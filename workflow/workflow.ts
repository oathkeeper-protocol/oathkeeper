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
  complianceApiUrl: z.string().describe("Base URL for compliance API (mock at :3001)"),
  chainSelectorName: z.string(),
  worldChainContractAddress: z.string().describe("WorldChainRegistry address on World Chain"),
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
    ],
    name: "recordBreach",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// --- Relay ABI — forwarder functions on SLAEnforcement (Sepolia) ---
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
  {
    inputs: [
      { internalType: "address", name: "provider", type: "address" },
      { internalType: "uint8", name: "status", type: "uint8" },
    ],
    name: "setComplianceStatus",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "slaId", type: "uint256" },
      { internalType: "uint256", name: "riskScore", type: "uint256" },
      { internalType: "string", name: "prediction", type: "string" },
    ],
    name: "recordBreachWarning",
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
  uptimeBps: number
): void {
  const callData = encodeFunctionData({
    abi: SLA_ABI,
    functionName: "recordBreach",
    args: [BigInt(slaId), BigInt(uptimeBps)],
  });

  const report = runtime.report(prepareReportRequest(callData)).result();
  evmClient.writeReport(runtime, {
    receiver: toHex(toBytes(contractAddress, { size: 20 })),
    report,
  }).result();
}

// --- Core SLA scan logic (shared by cron and log handlers) ---
function scanSLAs(runtime: Runtime<Config>): { breachCount: number; warningCount: number } {
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

  // Collect active SLA metrics for batched Gemini prediction
  const activeSLAMetrics: { slaId: number; provider: Address; uptimeBps: number; minUptimeBps: number }[] = [];

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      consensusIdenticalAggregation() as any
    )().result();

    const uptimeData = rawUptimeData as { uptimePercent: number };
    const uptimeBps = Math.round(uptimeData.uptimePercent * 100);
    const minUptimeBps = Number(sla.minUptimeBps);

    runtime.log(`[OathLayer] SLA ${i}: ${uptimeBps} bps (min: ${minUptimeBps})`);

    if (uptimeBps < minUptimeBps) {
      runtime.log(`[OathLayer] BREACH SLA ${i}: ${uptimeBps} < ${minUptimeBps} — slashing bond`);
      writeBreach(runtime, evmClient, contractAddress, i, uptimeBps);
      breachCount++;
    }

    activeSLAMetrics.push({ slaId: i, provider: sla.provider, uptimeBps, minUptimeBps });
  }

  // --- AI Breach Prediction via Gemini Flash ---
  let warningCount = 0;

  if (activeSLAMetrics.length > 0) {
    try {
      const geminiKey = runtime.getSecret({ id: "GEMINI_API_KEY" }).result().value;
      if (!geminiKey) throw new Error("GEMINI_API_KEY secret not configured");

      const confidentialClient = new cre.capabilities.ConfidentialHTTPClient();

      const prompt = `You are an SLA compliance analyzer. Given the following uptime metrics for infrastructure providers, predict the probability of an SLA breach in the next 24 hours for each SLA.

Metrics: ${JSON.stringify(activeSLAMetrics)}

Respond with a JSON array: [{"slaId": <number>, "riskScore": <0-100>, "prediction": "<one sentence max 100 chars>"}]`;

      const geminiResponse = runtime.runInNodeMode(
        (nodeRuntime) => {
          const response = confidentialClient.sendRequest(nodeRuntime, {
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey,
            },
            body: Buffer.from(JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 512,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      slaId: { type: "INTEGER" },
                      riskScore: { type: "INTEGER" },
                      prediction: { type: "STRING" },
                    },
                    required: ["slaId", "riskScore", "prediction"],
                  },
                },
              },
            })),
          }).result();

          if (!ok(response)) {
            throw new Error(`Gemini API HTTP ${response.statusCode}`);
          }

          return json(response);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        consensusIdenticalAggregation() as any
      )().result();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiResponse = geminiResponse as any;
      const predictions = JSON.parse(apiResponse.candidates[0].content.parts[0].text) as {
        slaId: number;
        riskScore: number;
        prediction: string;
      }[];

      // Get Sepolia client for writing breach warnings
      const sepoliaNetwork = getNetwork({
        chainFamily: "evm",
        chainSelectorName: "ethereum-testnet-sepolia",
        isTestnet: true,
      });
      if (!sepoliaNetwork) throw new Error("Sepolia network not found");
      const sepoliaClient = new cre.capabilities.EVMClient(sepoliaNetwork.chainSelector.selector);

      for (const pred of predictions) {
        if (pred.riskScore > 70) {
          const truncated = pred.prediction.slice(0, 100);
          runtime.log(`[OathLayer] WARNING SLA ${pred.slaId}: risk=${pred.riskScore} — ${truncated}`);

          const callData = encodeFunctionData({
            abi: RELAY_ABI,
            functionName: "recordBreachWarning",
            args: [BigInt(pred.slaId), BigInt(pred.riskScore), truncated],
          });
          const report = runtime.report(prepareReportRequest(callData)).result();
          sepoliaClient.writeReport(runtime, {
            receiver: toHex(toBytes(contractAddress, { size: 20 })),
            report,
          }).result();
          warningCount++;
        }
      }

      runtime.log(`[OathLayer] Gemini predictions: ${predictions.length} SLAs analyzed, ${warningCount} warnings`);
    } catch (e) {
      // Fail silently — better to miss a warning than emit a false one
      runtime.log(`[OathLayer] Gemini prediction failed: ${(e as Error).message}`);
    }
  }

  runtime.log(`[OathLayer] Done. Breaches: ${breachCount}, Warnings: ${warningCount}`);
  return { breachCount, warningCount };
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
  runtime.log("[OathLayer] ProviderRegistrationRequested on World Chain — compliance check + relay");

  const config = runtime.config;
  const contractAddress = getAddress(config.slaContractAddress) as Address;
  const userAddress = `0x${(log.topics[1] as string).slice(26)}` as Address;
  const nullifierHash = BigInt(log.topics[2] as string);

  const decoded = decodeAbiParameters(
    [
      { name: "root", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
    log.data as `0x${string}`
  );

  runtime.log(`[OathLayer] Provider ${userAddress.slice(0, 10)}... — running confidential compliance check`);

  // Confidential HTTP compliance check — encrypted via TEE enclaves
  const confidentialClient = new cre.capabilities.ConfidentialHTTPClient();
  const complianceApiKey = runtime.getSecret({ id: "COMPLIANCE_API_KEY" }).result().value;
  if (!complianceApiKey) throw new Error("COMPLIANCE_API_KEY secret not configured");

  const complianceResult = runtime.runInNodeMode(
    (nodeRuntime) => {
      const response = confidentialClient.sendRequest(nodeRuntime, {
        url: `${config.complianceApiUrl}/compliance/${userAddress}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${complianceApiKey}`,
          "Content-Type": "application/json",
        },
      }).result();

      if (!ok(response)) {
        throw new Error(`Compliance API HTTP ${response.statusCode}`);
      }

      return json(response);
    },
    // Mock API is deterministic — identical consensus is correct here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    consensusIdenticalAggregation() as any
  )().result() as { compliant: boolean; reason: string };

  // Get Sepolia EVM client for writing compliance status + relay
  const sepoliaNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: "ethereum-testnet-sepolia",
    isTestnet: true,
  });
  if (!sepoliaNetwork) throw new Error("Sepolia network not found in CRE registry");
  const sepoliaClient = new cre.capabilities.EVMClient(sepoliaNetwork.chainSelector.selector);

  if (complianceResult.compliant) {
    // Set APPROVED + relay registration in same handler
    const setComplianceData = encodeFunctionData({
      abi: RELAY_ABI,
      functionName: "setComplianceStatus",
      args: [userAddress, 1], // 1 = APPROVED
    });
    const complianceReport = runtime.report(prepareReportRequest(setComplianceData)).result();
    sepoliaClient.writeReport(runtime, {
      receiver: toHex(toBytes(contractAddress, { size: 20 })),
      report: complianceReport,
    }).result();

    // Relay the registration
    relayRegistration(runtime, "registerProviderRelayed", userAddress, nullifierHash);
    runtime.log(`[OathLayer] Provider ${userAddress.slice(0, 10)}... APPROVED and relayed to Sepolia`);
    return { relayed: true, compliant: true, role: "provider", user: userAddress };
  } else {
    // Set REJECTED, do NOT relay
    const setComplianceData = encodeFunctionData({
      abi: RELAY_ABI,
      functionName: "setComplianceStatus",
      args: [userAddress, 2], // 2 = REJECTED
    });
    const complianceReport = runtime.report(prepareReportRequest(setComplianceData)).result();
    sepoliaClient.writeReport(runtime, {
      receiver: toHex(toBytes(contractAddress, { size: 20 })),
      report: complianceReport,
    }).result();

    runtime.log(`[OathLayer] Provider ${userAddress.slice(0, 10)}... REJECTED: ${complianceResult.reason}`);
    return { relayed: false, compliant: false, role: "provider", user: userAddress };
  }
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
