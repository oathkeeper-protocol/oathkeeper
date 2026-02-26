// OathLayer — Chainlink CRE Workflow
// Monitors SLA compliance for tokenized real-world assets
// Triggers: Cron (every 15 min) + EVM Log (ClaimFiled event)
//           + EVM Log (ProviderRegistrationRequested on World Chain)
//           + EVM Log (ArbitratorRegistrationRequested on World Chain)
// Actions: fetch uptime → detect breach → write recordBreach() on-chain
//          relay World ID verifications from World Chain → Sepolia

import {
  cre,
  Runner,
  type Runtime,
  encodeCallMsg,
  prepareReportRequest,
  LAST_FINALIZED_BLOCK_NUMBER,
  bytesToHex,
  json,
  ok,
  getNetwork,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeAbiParameters,
  keccak256,
  toBytes,
  toHex,
  getAddress,
  zeroAddress,
  type Address,
} from "viem";
import { z } from "zod";

// --- Config schema (injected by CRE runtime) ---
const configSchema = z.object({
  slaContractAddress: z.string().describe("Deployed SLAEnforcement contract address on Sepolia"),
  uptimeApiUrl: z.string().describe("Base URL for uptime API"),
  chainSelectorName: z.string(),
  worldChainContractAddress: z.string().describe("WorldChainRegistry address on World Chain"),
  // World Chain mainnet CCIP chain selector (from Chainlink docs: 11820315825706515952)
  worldChainSelector: z.string().describe("CCIP chain selector for World Chain mainnet (default: 11820315825706515952)"),
});

type Config = z.infer<typeof configSchema>;

// --- Minimal ABI ---
const SLA_ABI = [
  {
    inputs: [],
    name: "slaCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "slas",
    outputs: [
      { internalType: "address", name: "provider", type: "address" },
      { internalType: "address", name: "tenant", type: "address" },
      { internalType: "uint256", name: "bondAmount", type: "uint256" },
      { internalType: "uint256", name: "responseTimeHrs", type: "uint256" },
      { internalType: "uint256", name: "minUptimeBps", type: "uint256" },
      { internalType: "uint256", name: "penaltyBps", type: "uint256" },
      { internalType: "uint256", name: "createdAt", type: "uint256" },
      { internalType: "bool", name: "active", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "slaId", type: "uint256" },
      { internalType: "uint256", name: "uptimeBps", type: "uint256" },
      { internalType: "uint256", name: "penaltyBps", type: "uint256" },
    ],
    name: "recordBreach",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// --- Relay ABI — new forwarder functions on SLAEnforcement (Sepolia) ---
const RELAY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "nullifierHash", type: "uint256" },
    ],
    name: "registerProviderRelayed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "nullifierHash", type: "uint256" },
    ],
    name: "registerArbitratorRelayed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// --- EVM helpers ---

function readSlaCount(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  contractAddress: Address
): bigint {
  const callData = encodeFunctionData({ abi: SLA_ABI, functionName: "slaCount" });
  const reply = evmClient.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to: contractAddress, data: callData }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  }).result();

  return decodeFunctionResult({
    abi: SLA_ABI,
    functionName: "slaCount",
    data: bytesToHex(reply.data),
  }) as bigint;
}

type SLAData = {
  provider: Address;
  tenant: Address;
  bondAmount: bigint;
  minUptimeBps: bigint;
  penaltyBps: bigint;
  active: boolean;
};

function readSla(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  contractAddress: Address,
  slaId: number
): SLAData {
  const callData = encodeFunctionData({ abi: SLA_ABI, functionName: "slas", args: [BigInt(slaId)] });
  const reply = evmClient.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to: contractAddress, data: callData }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  }).result();

  const result = decodeFunctionResult({
    abi: SLA_ABI,
    functionName: "slas",
    data: bytesToHex(reply.data),
  }) as readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, boolean];

  return {
    provider: result[0],
    tenant: result[1],
    bondAmount: result[2],
    minUptimeBps: result[4],
    penaltyBps: result[5],
    active: result[7],
  };
}

function writeBreach(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  contractAddress: Address,
  slaId: number,
  uptimeBps: number,
  penaltyBps: bigint
): void {
  const callData = encodeFunctionData({
    abi: SLA_ABI,
    functionName: "recordBreach",
    args: [BigInt(slaId), BigInt(uptimeBps), penaltyBps],
  });

  const report = runtime.report(prepareReportRequest(callData)).result();
  evmClient.writeReport(runtime, {
    receiver: toHex(toBytes(contractAddress, { size: 20 })),
    report,
  }).result();
}

// --- Core SLA scan logic (shared by cron and log handlers) ---
function scanSLAs(runtime: Runtime<Config>): { breachCount: number } {
  const config = runtime.config;
  const contractAddress = getAddress(config.slaContractAddress) as Address;

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain: ${config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const httpClient = new cre.capabilities.HTTPClient();

  const apiKey = runtime.getSecret({ id: "UPTIME_API_KEY" }).result().value || "demo-key";

  const slaCount = readSlaCount(runtime, evmClient, contractAddress);
  runtime.log(`[OathLayer] Checking ${slaCount} SLAs`);

  let breachCount = 0;

  for (let i = 0; i < Number(slaCount); i++) {
    const sla = readSla(runtime, evmClient, contractAddress, i);
    if (!sla.active) continue;

    // Fetch uptime in node mode — all DON nodes must agree (consensus)
    const rawUptimeData = runtime.runInNodeMode(
      (nodeRuntime) => {
        const response = httpClient.sendRequest(nodeRuntime, {
          url: `${config.uptimeApiUrl}/provider/${sla.provider}/uptime`,
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        }).result();

        if (!ok(response)) {
          throw new Error(`HTTP ${response.statusCode}`);
        }

        return json(response);
      },
      // Consensus: identical value required across all DON nodes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      consensusIdenticalAggregation() as any
    )().result();

    const uptimeData = rawUptimeData as { uptimePercent: number };
    const uptimeBps = Math.round(uptimeData.uptimePercent * 100);
    const minUptimeBps = Number(sla.minUptimeBps);

    runtime.log(`[OathLayer] SLA ${i}: ${uptimeBps} bps (min: ${minUptimeBps})`);

    if (uptimeBps < minUptimeBps) {
      runtime.log(`[OathLayer] BREACH SLA ${i}: ${uptimeBps} < ${minUptimeBps} — slashing bond`);
      writeBreach(runtime, evmClient, contractAddress, i, uptimeBps, sla.penaltyBps);
      breachCount++;
    }
  }

  runtime.log(`[OathLayer] Done. Breaches: ${breachCount}`);
  return { breachCount };
}

// --- Cross-chain relay helpers ---

/**
 * Relay a World ID registration from World Chain to Sepolia's SLAEnforcement.
 * The ZK proof was already verified by WorldChainRegistry on World Chain;
 * the CRE DON acts as a trusted forwarder so Sepolia skips re-verification.
 */
function relayRegistration(
  runtime: Runtime<Config>,
  functionName: "registerProviderRelayed" | "registerArbitratorRelayed",
  userAddress: Address,
  nullifierHash: bigint
): void {
  const config = runtime.config;
  const contractAddress = getAddress(config.slaContractAddress) as Address;

  const sepoliaNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: "ethereum-testnet-sepolia",
    isTestnet: true,
  });
  if (!sepoliaNetwork) throw new Error("Sepolia network not found in CRE registry");

  const sepoliaClient = new cre.capabilities.EVMClient(sepoliaNetwork.chainSelector.selector);

  const callData = encodeFunctionData({
    abi: RELAY_ABI,
    functionName,
    args: [userAddress, nullifierHash],
  });

  const report = runtime.report(prepareReportRequest(callData)).result();
  sepoliaClient.writeReport(runtime, {
    receiver: toHex(toBytes(contractAddress, { size: 20 })),
    report,
  }).result();
}

// --- Handlers ---

const onCronTrigger = (runtime: Runtime<Config>) => {
  runtime.log("[OathLayer] Cron triggered — scanning all SLAs");
  return scanSLAs(runtime);
};

const onClaimFiled = (runtime: Runtime<Config>) => {
  runtime.log("[OathLayer] ClaimFiled event — immediate compliance scan");
  return scanSLAs(runtime);
};

/**
 * Triggered when WorldChainRegistry emits:
 *   ProviderRegistrationRequested(address indexed user, uint256 indexed nullifierHash, uint256 root, uint256 timestamp)
 *
 * Decodes the log and relays the registration to Sepolia via the trusted forwarder pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onProviderRegistrationRequested = (runtime: Runtime<Config>, log: any) => {
  runtime.log("[OathLayer] ProviderRegistrationRequested on World Chain — relaying to Sepolia");

  // topics[0] = event signature hash (already filtered by trigger)
  // topics[1] = user (indexed address, left-padded to 32 bytes)
  // topics[2] = nullifierHash (indexed uint256)
  // data      = abi-encoded (root uint256, timestamp uint256)
  const userAddress = `0x${(log.topics[1] as string).slice(26)}` as Address;
  const nullifierHash = BigInt(log.topics[2] as string);

  const decoded = decodeAbiParameters(
    [
      { name: "root", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
    log.data as `0x${string}`
  );
  const root = decoded[0];

  runtime.log(
    `[OathLayer] Relaying provider registration: user=${userAddress} nullifier=${nullifierHash} root=${root}`
  );

  relayRegistration(runtime, "registerProviderRelayed", userAddress, nullifierHash);

  runtime.log(`[OathLayer] Provider registration relayed to Sepolia for ${userAddress}`);
  return { relayed: true, role: "provider", user: userAddress };
};

/**
 * Triggered when WorldChainRegistry emits:
 *   ArbitratorRegistrationRequested(address indexed user, uint256 indexed nullifierHash, uint256 root, uint256 timestamp)
 *
 * Decodes the log and relays the registration to Sepolia via the trusted forwarder pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onArbitratorRegistrationRequested = (runtime: Runtime<Config>, log: any) => {
  runtime.log("[OathLayer] ArbitratorRegistrationRequested on World Chain — relaying to Sepolia");

  const userAddress = `0x${(log.topics[1] as string).slice(26)}` as Address;
  const nullifierHash = BigInt(log.topics[2] as string);

  const decoded = decodeAbiParameters(
    [
      { name: "root", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
    log.data as `0x${string}`
  );
  const root = decoded[0];

  runtime.log(
    `[OathLayer] Relaying arbitrator registration: user=${userAddress} nullifier=${nullifierHash} root=${root}`
  );

  relayRegistration(runtime, "registerArbitratorRelayed", userAddress, nullifierHash);

  runtime.log(`[OathLayer] Arbitrator registration relayed to Sepolia for ${userAddress}`);
  return { relayed: true, role: "arbitrator", user: userAddress };
};

// --- Workflow init ---
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain: ${config.chainSelectorName}`);
  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const contractAddress = getAddress(config.slaContractAddress) as Address;

  // World Chain EVMClient — uses chain selector from config (operator-set at deployment)
  const worldChainSelector = BigInt(config.worldChainSelector);
  const worldChainClient = new cre.capabilities.EVMClient(worldChainSelector);
  const worldChainContractAddress = getAddress(config.worldChainContractAddress) as Address;

  // Cron: every 15 minutes
  const cron = new cre.capabilities.CronCapability();
  const cronTrigger = cron.trigger({ schedule: "0 */15 * * * *" });

  // EVM Log: ClaimFiled(uint256 indexed claimId, uint256 indexed slaId, address tenant)
  const claimFiledTopic = keccak256(toBytes("ClaimFiled(uint256,uint256,address)"));
  const logTrigger = evmClient.logTrigger({
    addresses: [toHex(toBytes(contractAddress, { size: 20 }))],
    topics: [
      { values: [claimFiledTopic] },
      { values: [] },
      { values: [] },
      { values: [] },
    ],
  });

  // World Chain EVM Log: ProviderRegistrationRequested(address indexed user, uint256 indexed nullifierHash, uint256 root, uint256 timestamp)
  const providerRegistrationTopic = keccak256(
    toBytes("ProviderRegistrationRequested(address,uint256,uint256,uint256)")
  );
  const providerRegistrationTrigger = worldChainClient.logTrigger({
    addresses: [toHex(toBytes(worldChainContractAddress, { size: 20 }))],
    topics: [
      { values: [providerRegistrationTopic] },
      { values: [] }, // user (indexed)
      { values: [] }, // nullifierHash (indexed)
      { values: [] },
    ],
  });

  // World Chain EVM Log: ArbitratorRegistrationRequested(address indexed user, uint256 indexed nullifierHash, uint256 root, uint256 timestamp)
  const arbitratorRegistrationTopic = keccak256(
    toBytes("ArbitratorRegistrationRequested(address,uint256,uint256,uint256)")
  );
  const arbitratorRegistrationTrigger = worldChainClient.logTrigger({
    addresses: [toHex(toBytes(worldChainContractAddress, { size: 20 }))],
    topics: [
      { values: [arbitratorRegistrationTopic] },
      { values: [] }, // user (indexed)
      { values: [] }, // nullifierHash (indexed)
      { values: [] },
    ],
  });

  return [
    cre.handler(cronTrigger, onCronTrigger),
    cre.handler(logTrigger, onClaimFiled),
    cre.handler(providerRegistrationTrigger, onProviderRegistrationRequested),
    cre.handler(arbitratorRegistrationTrigger, onArbitratorRegistrationRequested),
  ];
};

// --- Entry point ---
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
