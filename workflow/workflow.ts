// OathKeeper — Chainlink CRE Workflow
// Monitors SLA compliance for tokenized real-world assets
// Triggers: Cron (every 15 min) + EVM Log (ClaimFiled event)
// Actions: fetch uptime → detect breach → write recordBreach() on-chain

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
  slaContractAddress: z.string().describe("Deployed SLAEnforcement contract address"),
  uptimeApiUrl: z.string().describe("Base URL for uptime API"),
  chainSelectorName: z.string(),
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
  runtime.log(`[OathKeeper] Checking ${slaCount} SLAs`);

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

    runtime.log(`[OathKeeper] SLA ${i}: ${uptimeBps} bps (min: ${minUptimeBps})`);

    if (uptimeBps < minUptimeBps) {
      runtime.log(`[OathKeeper] BREACH SLA ${i}: ${uptimeBps} < ${minUptimeBps} — slashing bond`);
      writeBreach(runtime, evmClient, contractAddress, i, uptimeBps, sla.penaltyBps);
      breachCount++;
    }
  }

  runtime.log(`[OathKeeper] Done. Breaches: ${breachCount}`);
  return { breachCount };
}

// --- Handlers ---

const onCronTrigger = (runtime: Runtime<Config>) => {
  runtime.log("[OathKeeper] Cron triggered — scanning all SLAs");
  return scanSLAs(runtime);
};

const onClaimFiled = (runtime: Runtime<Config>) => {
  runtime.log("[OathKeeper] ClaimFiled event — immediate compliance scan");
  return scanSLAs(runtime);
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

  return [
    cre.handler(cronTrigger, onCronTrigger),
    cre.handler(logTrigger, onClaimFiled),
  ];
};

// --- Entry point ---
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
