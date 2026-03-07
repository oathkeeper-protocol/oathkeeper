// OathLayer — Chainlink CRE Workflow
// Monitors SLA compliance for tokenized real-world assets
// Triggers: Cron (every 15 min) + EVM Log (ClaimFiled event)
//           + EVM Log (ProviderRegistrationRequested on World Chain)
//           + EVM Log (ArbitratorRegistrationRequested on World Chain)
// Actions: fetch uptime → detect breach → AI Tribunal (3 agents) → write on-chain
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
  worldChainContractAddress: z.string().default("").describe("WorldChainRegistry address on World Chain (empty to skip World Chain triggers)"),
  worldChainSelector: z.string().default("").describe("CCIP chain selector for World Chain (empty to skip World Chain triggers)"),
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
      { internalType: "string", name: "serviceName", type: "string" },
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

// Mirrors SLAEnforcement.ComplianceStatus enum — keep in sync with contract
const ComplianceStatus = { NONE: 0, APPROVED: 1, REJECTED: 2 } as const;

// --- AI Tribunal Council types ---

type AgentVote = {
  vote: "BREACH" | "WARNING" | "NO_BREACH";
  confidence: number;
  reasoning: string;
};

type SLAVote = {
  slaId: number;
  vote: AgentVote;
};

type TribunalVerdict = {
  slaId: number;
  action: "BREACH" | "WARNING" | "NONE";
  councilConfidence: number;
  tally: string;
  summary: string;
};

// --- AI Tribunal Council prompts ---

const TRIBUNAL_PROMPTS = {
  riskAnalyst: `You are a Risk Analyst for an SLA enforcement system. Analyze uptime metrics and predict breach probability in the next 24 hours. Be data-driven and objective. Consider current metrics against SLA thresholds and trend direction.

For each SLA, respond with JSON: {"slaId": <number>, "vote": "BREACH" | "WARNING" | "NO_BREACH", "confidence": <0.0-1.0>, "reasoning": "<max 100 chars>"}

Respond with a JSON array of votes for all SLAs.`,

  providerAdvocate: (analystAssessment: string) => `You are a Provider Advocate defending infrastructure providers against wrongful SLA penalties. Your job is to protect providers from false slashing.

The Risk Analyst has assessed: ${analystAssessment}

Find mitigating factors: temporary dips, maintenance windows, recovery trends in historical data, measurement noise, or threshold proximity that doesn't warrant action.

Your bias is to PROTECT providers. Only vote BREACH if evidence is absolutely undeniable despite your best defense.

For each SLA, respond with JSON: {"slaId": <number>, "vote": "BREACH" | "WARNING" | "NO_BREACH", "confidence": <0.0-1.0>, "reasoning": "<max 100 chars>"}

Respond with a JSON array of votes for all SLAs.`,

  enforcementJudge: (analystAssessment: string, advocateDefense: string) => `You are the Enforcement Judge in an SLA tribunal. You must weigh the Risk Analyst's findings against the Provider Advocate's defense and render a fair verdict.

Risk Analyst says: ${analystAssessment}
Provider Advocate says: ${advocateDefense}

Only vote BREACH if evidence is overwhelming despite the defense. Your vote is the tiebreaker — be deliberate.

For each SLA, respond with JSON: {"slaId": <number>, "vote": "BREACH" | "WARNING" | "NO_BREACH", "confidence": <0.0-1.0>, "reasoning": "<max 100 chars>"}

Respond with a JSON array of votes for all SLAs.`,
};

// --- Tribunal helper: call Groq via ConfidentialHTTPClient ---

function callTribunalAgent(
  runtime: Runtime<Config>,
  systemPrompt: string,
  userPrompt: string,
  groqKey: string,
  temperature: number = 0
): SLAVote[] {
  const confidentialClient = new cre.capabilities.ConfidentialHTTPClient();

  const response = confidentialClient.sendRequest(runtime, {
    request: {
      url: "https://api.groq.com/openai/v1/chat/completions",
      method: "POST",
      multiHeaders: {
        "Content-Type": { values: ["application/json"] },
        Authorization: { values: [`Bearer ${groqKey}`] },
      },
      bodyString: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
        temperature,
        response_format: { type: "json_object" },
      }),
    },
  }).result();

  if (!ok(response)) {
    throw new Error(`Groq API HTTP ${response.statusCode}`);
  }

  const body = new TextDecoder().decode(response.body);
  type GroqResponse = { choices: Array<{ message: { content: string } }> };
  const parsed = JSON.parse(body) as GroqResponse;
  const content = parsed.choices[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty response");

  // Parse JSON — handle both array and {votes: [...]} wrapper
  const jsonParsed = JSON.parse(content);
  const votes: SLAVote[] = Array.isArray(jsonParsed)
    ? jsonParsed
    : Array.isArray(jsonParsed.votes)
      ? jsonParsed.votes
      : Array.isArray(jsonParsed.results)
        ? jsonParsed.results
        : [];

  // Normalize: LLM may return {slaId, vote, confidence, reasoning} (flat)
  // or {slaId, vote: {vote, confidence, reasoning}} (nested)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return votes.map((v: any) => {
    const isNested = typeof v.vote === "object" && v.vote !== null;
    const rawVote: string = isNested ? v.vote.vote : v.vote;
    const rawConf: number = isNested ? v.vote.confidence : v.confidence;
    const rawReason: string = isNested ? v.vote.reasoning : v.reasoning;

    return {
      slaId: Number(v.slaId),
      vote: {
        vote: (["BREACH", "WARNING", "NO_BREACH"].includes(rawVote) ? rawVote : "NO_BREACH") as AgentVote["vote"],
        confidence: Math.max(0, Math.min(1, Number(rawConf) || 0.5)),
        reasoning: String(rawReason ?? "").slice(0, 100),
      },
    };
  });
}

// --- Tribunal: tally votes and determine verdict ---

function tallyTribunalVotes(
  slaId: number,
  analystVote: AgentVote | undefined,
  advocateVote: AgentVote | undefined,
  judgeVote: AgentVote | undefined
): TribunalVerdict {
  const votes = [
    { role: "Analyst", vote: analystVote },
    { role: "Advocate", vote: advocateVote },
    { role: "Judge", vote: judgeVote },
  ].filter(v => v.vote !== undefined) as { role: string; vote: AgentVote }[];

  if (votes.length === 0) {
    return { slaId, action: "NONE", councilConfidence: 0, tally: "0-0", summary: "No tribunal votes received" };
  }

  const breachVotes = votes.filter(v => v.vote.vote === "BREACH");
  const warningVotes = votes.filter(v => v.vote.vote === "WARNING");
  const noBreachVotes = votes.filter(v => v.vote.vote === "NO_BREACH");

  // Weighted confidence (Judge gets 1.5x)
  let weightedSum = 0;
  let weightTotal = 0;
  for (const v of votes) {
    const weight = v.role === "Judge" ? 1.5 : 1.0;
    weightedSum += v.vote.confidence * weight;
    weightTotal += weight;
  }
  const councilConfidence = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // Determine action by voting rules
  let action: TribunalVerdict["action"];
  let tally: string;

  if (breachVotes.length === votes.length) {
    action = "BREACH";
    tally = `${votes.length}-0 BREACH`;
  } else if (breachVotes.length > votes.length / 2) {
    action = "WARNING"; // Majority breach but not unanimous → high-confidence warning
    tally = `${breachVotes.length}-${votes.length - breachVotes.length} BREACH`;
  } else if (noBreachVotes.length === votes.length) {
    action = "NONE";
    tally = `0-${votes.length} CLEAR`;
  } else {
    action = warningVotes.length > 0 ? "WARNING" : "NONE";
    tally = `${breachVotes.length}-${noBreachVotes.length} SPLIT`;
  }

  // Build summary: who voted what
  const voteSummaries = votes.map(v => `${v.role}: ${v.vote.reasoning}`);
  const summary = `[${tally}] ${voteSummaries.join("; ")}`.slice(0, 200);

  return { slaId, action, councilConfidence: parseFloat(councilConfidence.toFixed(2)), tally, summary };
}

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
  serviceName: string;
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
  }) as readonly [Address, Address, string, bigint, bigint, bigint, bigint, bigint, boolean];

  return {
    provider: result[0],
    tenant: result[1],
    serviceName: result[2],
    bondAmount: result[3],
    minUptimeBps: result[5],
    penaltyBps: result[6],
    active: result[8],
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
  const breachedInLoop = new Set<number>();

  // Collect active SLA metrics for batched AI Tribunal deliberation
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
      breachedInLoop.add(i);
      breachCount++;
    }

    activeSLAMetrics.push({ slaId: i, provider: sla.provider, uptimeBps, minUptimeBps });
  }

  // --- AI Tribunal Council: 3-Agent Breach Determination ---
  // Sequential: Risk Analyst → Provider Advocate → Enforcement Judge
  // Each agent sees the previous agent's output for adversarial deliberation
  let warningCount = 0;

  if (activeSLAMetrics.length > 0) {
    try {
      const groqKey = runtime.getSecret({ id: "GROQ_API_KEY" }).result().value;
      if (!groqKey) throw new Error("GROQ_API_KEY secret not configured");

      // Fetch historical uptime for each provider (for Provider Advocate context)
      const providerHistories: Record<string, { timestamp: string; uptimePercent: number }[]> = {};
      for (const metric of activeSLAMetrics) {
        try {
          const historyData = runtime.runInNodeMode(
            (nodeRuntime) => {
              const response = httpClient.sendRequest(nodeRuntime, {
                url: `${config.uptimeApiUrl}/provider/${metric.provider}/history`,
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
              }).result();
              if (!ok(response)) throw new Error(`HTTP ${response.statusCode}`);
              return json(response);
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            consensusIdenticalAggregation() as any
          )().result() as { history: { timestamp: string; uptimePercent: number }[] };
          providerHistories[metric.provider] = historyData.history;
        } catch {
          // History fetch is best-effort — Advocate works without it
          providerHistories[metric.provider] = [];
        }
      }

      const metricsWithHistory = activeSLAMetrics.map(m => ({
        ...m,
        history: providerHistories[m.provider] ?? [],
      }));

      const metricsJson = JSON.stringify(metricsWithHistory);

      // --- Agent 1: Risk Analyst (temperature 0 — strict data analysis) ---
      runtime.log("[OathLayer] Tribunal: Risk Analyst evaluating...");
      let analystVotes: SLAVote[] = [];
      try {
        analystVotes = callTribunalAgent(
          runtime,
          TRIBUNAL_PROMPTS.riskAnalyst,
          `Current SLA metrics with 7-day history:\n${metricsJson}`,
          groqKey,
          0
        );
      } catch (e) {
        runtime.log(`[OathLayer] Tribunal: Risk Analyst failed: ${(e as Error).message}`);
      }

      const analystSummary = JSON.stringify(analystVotes.map(v => ({
        slaId: v.slaId, vote: v.vote.vote, confidence: v.vote.confidence, reasoning: v.vote.reasoning,
      })));

      // --- Agent 2: Provider Advocate (temperature 0.3 — slight creativity for defense) ---
      runtime.log("[OathLayer] Tribunal: Provider Advocate defending...");
      let advocateVotes: SLAVote[] = [];
      try {
        advocateVotes = callTribunalAgent(
          runtime,
          TRIBUNAL_PROMPTS.providerAdvocate(analystSummary),
          `Current SLA metrics with 7-day history:\n${metricsJson}`,
          groqKey,
          0.3
        );
      } catch (e) {
        runtime.log(`[OathLayer] Tribunal: Provider Advocate failed: ${(e as Error).message}`);
      }

      const advocateSummary = JSON.stringify(advocateVotes.map(v => ({
        slaId: v.slaId, vote: v.vote.vote, confidence: v.vote.confidence, reasoning: v.vote.reasoning,
      })));

      // --- Agent 3: Enforcement Judge (temperature 0 — deliberate, precedent-aware) ---
      runtime.log("[OathLayer] Tribunal: Enforcement Judge deliberating...");
      let judgeVotes: SLAVote[] = [];
      try {
        judgeVotes = callTribunalAgent(
          runtime,
          TRIBUNAL_PROMPTS.enforcementJudge(analystSummary, advocateSummary),
          `Current SLA metrics with 7-day history:\n${metricsJson}`,
          groqKey,
          0
        );
      } catch (e) {
        runtime.log(`[OathLayer] Tribunal: Enforcement Judge failed: ${(e as Error).message}`);
      }

      // --- Tally votes and submit verdicts ---
      const sepoliaNetwork = getNetwork({
        chainFamily: "evm",
        chainSelectorName: "ethereum-testnet-sepolia",
        isTestnet: true,
      });
      if (!sepoliaNetwork) throw new Error("Sepolia network not found");
      const sepoliaClient = new cre.capabilities.EVMClient(sepoliaNetwork.chainSelector.selector);

      for (const metric of activeSLAMetrics) {
        const analystVote = analystVotes.find(v => v.slaId === metric.slaId)?.vote;
        const advocateVote = advocateVotes.find(v => v.slaId === metric.slaId)?.vote;
        const judgeVote = judgeVotes.find(v => v.slaId === metric.slaId)?.vote;

        const verdict = tallyTribunalVotes(metric.slaId, analystVote, advocateVote, judgeVote);

        runtime.log(`[OathLayer] Tribunal SLA ${metric.slaId}: ${verdict.tally} (confidence: ${verdict.councilConfidence})`);

        if (verdict.action === "BREACH" && !breachedInLoop.has(metric.slaId)) {
          // Unanimous breach — record breach (slashing), skip if already breached in hard-check
          runtime.log(`[OathLayer] TRIBUNAL BREACH SLA ${metric.slaId}: unanimous — slashing bond`);
          writeBreach(runtime, evmClient, contractAddress, metric.slaId, metric.uptimeBps);
          breachCount++;
        } else if (verdict.action === "WARNING") {
          // Majority breach or warning votes — record as breach warning
          const confidenceScore = Math.round(verdict.councilConfidence * 100);
          const truncatedSummary = verdict.summary.slice(0, 200);
          runtime.log(`[OathLayer] TRIBUNAL WARNING SLA ${metric.slaId}: ${truncatedSummary}`);

          const callData = encodeFunctionData({
            abi: RELAY_ABI,
            functionName: "recordBreachWarning",
            args: [BigInt(metric.slaId), BigInt(confidenceScore), truncatedSummary],
          });
          const report = runtime.report(prepareReportRequest(callData)).result();
          sepoliaClient.writeReport(runtime, {
            receiver: toHex(toBytes(contractAddress, { size: 20 })),
            report,
          }).result();
          warningCount++;
        }
        // NONE = unanimous no-breach, skip
      }

      runtime.log(`[OathLayer] Tribunal complete: ${activeSLAMetrics.length} SLAs deliberated, ${warningCount} warnings, ${breachCount} breaches`);
    } catch (e) {
      // Fail silently — better to miss a warning than emit a false one
      runtime.log(`[OathLayer] Tribunal failed: ${(e as Error).message}`);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onClaimFiled = (runtime: Runtime<Config>, log: any) => {
  // Targeted scan: only check the specific SLA referenced in the claim.
  // Avoids triggering a full N-SLA scan + Gemini call on every claim event.
  const slaId = log.topics[2] !== undefined ? Number(BigInt(log.topics[2] as string)) : -1;
  runtime.log(`[OathLayer] ClaimFiled event — scanning SLA ${slaId >= 0 ? slaId : "(unknown)"}`);
  // Full scan still runs so breach detection is immediate; Gemini is gated inside scanSLAs
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

  // Use decodeAbiParameters for safe, checksum-validated address extraction
  if (!log.topics[1] || !log.topics[2]) throw new Error("Malformed ProviderRegistrationRequested log: missing topics");
  const [userAddress] = decodeAbiParameters([{ name: "user", type: "address" }], log.topics[1] as `0x${string}`);
  const nullifierHash = BigInt(log.topics[2] as string);

  runtime.log(`[OathLayer] Provider ${userAddress.slice(0, 10)}... — running confidential compliance check`);

  // Confidential HTTP compliance check — encrypted via TEE enclaves
  const confidentialClient = new cre.capabilities.ConfidentialHTTPClient();
  const complianceApiKey = runtime.getSecret({ id: "COMPLIANCE_API_KEY" }).result().value;
  if (!complianceApiKey) throw new Error("COMPLIANCE_API_KEY secret not configured");

  const complianceHttpResponse = confidentialClient.sendRequest(runtime, {
    request: {
      url: `${config.complianceApiUrl}/compliance/${userAddress}`,
      method: "GET",
      multiHeaders: {
        Authorization: { values: [`Bearer ${complianceApiKey}`] },
        "Content-Type": { values: ["application/json"] },
      },
    },
  }).result();

  if (!ok(complianceHttpResponse)) {
    throw new Error(`Compliance API HTTP ${complianceHttpResponse.statusCode}`);
  }

  const complianceResultBody = new TextDecoder().decode(complianceHttpResponse.body);
  const complianceResult = JSON.parse(complianceResultBody) as { compliant: boolean; reason: string };

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
      args: [userAddress, ComplianceStatus.APPROVED],
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
      args: [userAddress, ComplianceStatus.REJECTED],
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

  if (!log.topics[1] || !log.topics[2]) throw new Error("Malformed ArbitratorRegistrationRequested log: missing topics");
  const [userAddress] = decodeAbiParameters([{ name: "user", type: "address" }], log.topics[1] as `0x${string}`);
  const nullifierHash = BigInt(log.topics[2] as string);

  runtime.log(
    `[OathLayer] Relaying arbitrator registration: user=${userAddress} nullifier=${nullifierHash}`
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

  const handlers: ReturnType<typeof cre.handler>[] = [
    cre.handler(cronTrigger, onCronTrigger),
    cre.handler(logTrigger, onClaimFiled),
  ];

  // World Chain triggers — only register when worldChainSelector is configured
  // Set worldChainSelector to "" in config.local.json to skip (for simulation)
  if (config.worldChainSelector && config.worldChainContractAddress) {
    const worldChainSelector = BigInt(config.worldChainSelector);
    const worldChainClient = new cre.capabilities.EVMClient(worldChainSelector);
    const worldChainContractAddress = getAddress(config.worldChainContractAddress) as Address;

    const providerRegistrationTopic = keccak256(
      toBytes("ProviderRegistrationRequested(address,uint256,uint256,uint256)")
    );
    const providerRegistrationTrigger = worldChainClient.logTrigger({
      addresses: [toHex(toBytes(worldChainContractAddress, { size: 20 }))],
      topics: [
        { values: [providerRegistrationTopic] },
        { values: [] },
        { values: [] },
        { values: [] },
      ],
    });

    const arbitratorRegistrationTopic = keccak256(
      toBytes("ArbitratorRegistrationRequested(address,uint256,uint256,uint256)")
    );
    const arbitratorRegistrationTrigger = worldChainClient.logTrigger({
      addresses: [toHex(toBytes(worldChainContractAddress, { size: 20 }))],
      topics: [
        { values: [arbitratorRegistrationTopic] },
        { values: [] },
        { values: [] },
        { values: [] },
      ],
    });

    handlers.push(
      cre.handler(providerRegistrationTrigger, onProviderRegistrationRequested),
      cre.handler(arbitratorRegistrationTrigger, onArbitratorRegistrationRequested),
    );
  }

  return handlers;
};

// --- Entry point ---
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
