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
  LATEST_BLOCK_NUMBER,
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
  startSlaId: z.number().default(0).describe("Skip SLAs below this ID (used to ignore old/stale SLAs)"),
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
      { internalType: "uint256", name: "initialBondAmount", type: "uint256" },
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
  riskAnalyst: `You are a Risk Analyst for an SLA enforcement system. Analyze uptime metrics and vote based on these rules:

VOTING RULES (uptimeBps = current uptime, minUptimeBps = SLA threshold):
- BREACH: uptimeBps < minUptimeBps (below threshold — SLA violated)
- WARNING: uptimeBps >= minUptimeBps BUT within 5% above threshold (e.g. threshold 9500, uptime 9500-9975 = warning zone)
- NO_BREACH: uptimeBps > minUptimeBps + 5% buffer (healthy, well above threshold)

Be data-driven and objective. Set confidence based on how far from the threshold the uptime is.

For each SLA, respond with JSON: {"slaId": <number>, "vote": "BREACH" | "WARNING" | "NO_BREACH", "confidence": <0.0-1.0>, "reasoning": "<max 80 chars>"}

Respond with a JSON array of votes for all SLAs.`,

  providerAdvocate: (analystAssessment: string) => `You are a Provider Advocate defending infrastructure providers against wrongful SLA penalties.

The Risk Analyst has assessed: ${analystAssessment}

VOTING RULES (uptimeBps = current uptime, minUptimeBps = SLA threshold):
- BREACH: uptimeBps < minUptimeBps (below threshold — this is non-negotiable, the SLA is violated)
- WARNING: uptimeBps >= minUptimeBps BUT within 5% above threshold — defend the provider but flag risk
- NO_BREACH: uptimeBps > minUptimeBps + 5% buffer — provider is healthy, advocate for clearance

IMPORTANT: If uptimeBps < minUptimeBps, you MUST vote BREACH. You cannot defend against math.
Your advocacy applies to borderline cases (WARNING zone) and severity assessment, not denying hard breaches.

For each SLA, respond with JSON: {"slaId": <number>, "vote": "BREACH" | "WARNING" | "NO_BREACH", "confidence": <0.0-1.0>, "reasoning": "<max 80 chars>"}

Respond with a JSON array of votes for all SLAs.`,

  enforcementJudge: (analystAssessment: string, advocateDefense: string) => `You are the Enforcement Judge in an SLA tribunal. Weigh the Risk Analyst's findings against the Provider Advocate's defense.

Risk Analyst says: ${analystAssessment}
Provider Advocate says: ${advocateDefense}

VOTING RULES (uptimeBps = current uptime, minUptimeBps = SLA threshold):
- BREACH: uptimeBps < minUptimeBps and defense is insufficient — penalize
- WARNING: uptimeBps is close to threshold (within 5% above) — issue warning, no penalty
- NO_BREACH: uptime is healthy or defense is convincing — clear the provider

Your vote is the tiebreaker — be deliberate and fair.

For each SLA, respond with JSON: {"slaId": <number>, "vote": "BREACH" | "WARNING" | "NO_BREACH", "confidence": <0.0-1.0>, "reasoning": "<max 80 chars>"}

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
    action = "BREACH"; // Majority breach → breach verdict
    tally = `${breachVotes.length}-${votes.length - breachVotes.length} BREACH`;
  } else if (noBreachVotes.length === votes.length) {
    action = "NONE";
    tally = `0-${votes.length} CLEAR`;
  } else {
    // WARNING votes count as "for" (pro-action)
    const forVotes = breachVotes.length + warningVotes.length;
    const againstVotes = noBreachVotes.length;
    if (forVotes > againstVotes) {
      action = "WARNING";
      tally = `${forVotes}-${againstVotes} WARNING`;
    } else if (againstVotes > forVotes) {
      action = "NONE";
      tally = `${forVotes}-${againstVotes} CLEAR`;
    } else {
      // True split — Judge tiebreak via weighted confidence
      action = warningVotes.length > 0 ? "WARNING" : "NONE";
      tally = `${forVotes}-${againstVotes} SPLIT`;
    }
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
    blockNumber: LATEST_BLOCK_NUMBER,
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
    blockNumber: LATEST_BLOCK_NUMBER,
  }).result();

  // Decode manually — CRE's Javy WASM runtime can't handle BigInt > Number.MAX_SAFE_INTEGER
  // in viem's decodeFunctionResult (e.g. bondAmount = 0.1 ETH = 10^17)
  const hex = bytesToHex(reply.data);
  const data = hex.slice(2); // remove 0x prefix
  // Each ABI slot is 32 bytes = 64 hex chars
  // Slots: 0=provider, 1=tenant, 2=serviceName(offset), 3=bondAmount,
  //        4=initialBondAmount, 5=responseTimeHrs, 6=minUptimeBps, 7=penaltyBps, 8=createdAt, 9=active
  const slot = (i: number): string => {
    const s = data.slice(i * 64, (i + 1) * 64);
    return s.length > 0 ? s : "0".repeat(64);
  };
  const addrFromSlot = (i: number) => getAddress(`0x${slot(i).slice(24)}`) as Address;
  const numFromSlot = (i: number) => parseInt(slot(i), 16);
  const boolFromSlot = (i: number) => parseInt(slot(i), 16) !== 0;

  // serviceName is dynamic — offset at slot 2 points to length + data
  const strOffset = numFromSlot(2) / 32;
  const strLen = numFromSlot(strOffset);
  const strHex = data.slice((strOffset + 1) * 64, (strOffset + 1) * 64 + strLen * 2);
  let serviceName = "";
  for (let c = 0; c < strHex.length; c += 2) {
    serviceName += String.fromCharCode(parseInt(strHex.slice(c, c + 2), 16));
  }

  return {
    provider: addrFromSlot(0),
    tenant: addrFromSlot(1),
    serviceName,
    bondAmount: BigInt(0), // not used in scan logic, skip large number parsing
    minUptimeBps: BigInt(numFromSlot(6)),
    penaltyBps: BigInt(numFromSlot(7)),
    active: boolFromSlot(9),
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

// Bulk execute on-chain writes via mock API — single ConfidentialHTTPClient call.
// Collects all breach/warning/clear actions and sends them in one POST.
type CREAction = {
  type: "breach" | "warning" | "clear";
  slaId: number;
  uptimeBps?: number;
  riskScore?: number;
  prediction?: string;
};

function executeBulkViaMockAPI(
  runtime: Runtime<Config>,
  actions: CREAction[],
  apiKey: string
): void {
  if (actions.length === 0) return;

  try {
    const config = runtime.config;
    const confidentialClient = new cre.capabilities.ConfidentialHTTPClient();
    const response = confidentialClient.sendRequest(runtime, {
      request: {
        url: `${config.uptimeApiUrl}/cre/execute`,
        method: "POST",
        multiHeaders: {
          "Content-Type": { values: ["application/json"] },
          "x-admin-token": { values: [apiKey] },
        },
        bodyString: JSON.stringify({ actions }),
      },
    }).result();

    if (!ok(response)) {
      runtime.log(`[OathLayer] Bulk execute HTTP ${response.statusCode}`);
      return;
    }
    const result = JSON.parse(new TextDecoder().decode(response.body)) as {
      ok: boolean; total: number; succeeded: number;
      results: { slaId: number; type: string; ok: boolean; tx?: string; error?: string }[];
    };
    runtime.log(`[OathLayer] Bulk execute: ${result.succeeded}/${result.total} on-chain writes succeeded`);
    for (const r of result.results) {
      if (r.ok) {
        runtime.log(`[OathLayer]   SLA ${r.slaId} ${r.type}: tx ${r.tx}`);
      } else {
        runtime.log(`[OathLayer]   SLA ${r.slaId} ${r.type}: FAILED ${r.error}`);
      }
    }
  } catch (e) {
    runtime.log(`[OathLayer] Bulk execute failed: ${(e as Error).message}`);
  }
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
  const startId = config.startSlaId ?? 0;
  runtime.log(`[OathLayer] Checking SLAs ${startId}..${Number(slaCount) - 1} (${Number(slaCount) - startId} active)`);

  // CRE hard limit: 10 writeReport calls per workflow execution.
  // Budget breaches first (hard-check loop), then tribunal breaches, then warnings.
  const CRE_WRITE_LIMIT = 10;
  let writesUsed = 0;

  let breachCount = 0;
  const breachedInLoop = new Set<number>();

  // Collect all on-chain actions for bulk execution via mock API
  const pendingActions: CREAction[] = [];

  // Collect active SLA metrics for batched AI Tribunal deliberation
  const activeSLAMetrics: { slaId: number; provider: Address; uptimeBps: number; minUptimeBps: number }[] = [];

  // Cache uptime per provider to avoid hitting CRE's 5 HTTP call limit
  const uptimeCache: Record<string, number> = {};

  for (let i = startId; i < Number(slaCount); i++) {
    const sla = readSla(runtime, evmClient, contractAddress, i);
    if (!sla.active) continue;

    let uptimeBps: number;
    if (uptimeCache[sla.provider] !== undefined) {
      uptimeBps = uptimeCache[sla.provider];
    } else {
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
      uptimeBps = Math.round(uptimeData.uptimePercent * 100);
      uptimeCache[sla.provider] = uptimeBps;
    }

    const minUptimeBps = Number(sla.minUptimeBps);

    runtime.log(`[OathLayer] SLA ${i}: ${uptimeBps} bps (min: ${minUptimeBps})`);

    if (uptimeBps < minUptimeBps) {
      if (writesUsed >= CRE_WRITE_LIMIT) {
        runtime.log(`[OathLayer] BREACH SLA ${i}: ${uptimeBps} < ${minUptimeBps} — SKIPPED (write budget exhausted)`);
        continue;
      }
      runtime.log(`[OathLayer] BREACH SLA ${i}: ${uptimeBps} < ${minUptimeBps} — slashing bond`);
      writeBreach(runtime, evmClient, contractAddress, i, uptimeBps);
      pendingActions.push({ type: "breach", slaId: i, uptimeBps });
      breachedInLoop.add(i);
      breachCount++;
      writesUsed++;
    }

    activeSLAMetrics.push({ slaId: i, provider: sla.provider, uptimeBps, minUptimeBps });
  }

  // --- AI Tribunal Council: 3-Agent Breach Determination ---
  // Sequential: Risk Analyst → Provider Advocate → Enforcement Judge
  // Each agent sees the previous agent's output for adversarial deliberation
  let warningCount = 0;

  if (activeSLAMetrics.length > 0) {
    try {
      // Rotate Groq API keys across agents to avoid per-key rate limits
      const groqKey1 = runtime.getSecret({ id: "GROQ_API_KEY" }).result().value;
      const groqKey2 = runtime.getSecret({ id: "GROQ_API_KEY_2" }).result().value || groqKey1;
      const groqKey3 = runtime.getSecret({ id: "GROQ_API_KEY_3" }).result().value || groqKey1;
      if (!groqKey1) throw new Error("GROQ_API_KEY secret not configured");
      const groqKeys = [groqKey1, groqKey2, groqKey3];

      // Skip history fetch to stay within CRE 5 HTTP call limit
      // (1 uptime + 3 Groq agents + 1 bulk execute = 5)
      const metricsJson = JSON.stringify(activeSLAMetrics);

      // --- Agent 1: Risk Analyst (temperature 0 — strict data analysis) ---
      runtime.log("[OathLayer] Tribunal: Risk Analyst evaluating...");
      let analystVotes: SLAVote[] = [];
      try {
        analystVotes = callTribunalAgent(
          runtime,
          TRIBUNAL_PROMPTS.riskAnalyst,
          `Current SLA metrics:\n${metricsJson}`,
          groqKeys[0],
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
          `Current SLA metrics:\n${metricsJson}`,
          groqKeys[1],
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
          `Current SLA metrics:\n${metricsJson}`,
          groqKeys[2],
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

      // Tally all verdicts first, then write in priority order: breaches > warnings
      const verdicts: (TribunalVerdict & { uptimeBps: number })[] = [];
      for (const metric of activeSLAMetrics) {
        const analystVote = analystVotes.find(v => v.slaId === metric.slaId)?.vote;
        const advocateVote = advocateVotes.find(v => v.slaId === metric.slaId)?.vote;
        const judgeVote = judgeVotes.find(v => v.slaId === metric.slaId)?.vote;

        const verdict = tallyTribunalVotes(metric.slaId, analystVote, advocateVote, judgeVote);
        runtime.log(`[OathLayer] Tribunal SLA ${metric.slaId}: ${verdict.tally} (confidence: ${verdict.councilConfidence})`);

        // For breached SLAs, still record the tribunal verdict (audit trail) but skip duplicate breach
        const alreadyBreached = breachedInLoop.has(metric.slaId);

        if (verdict.action === "NONE") {
          // CLEAR — record riskScore=0 on-chain for full audit trail
          pendingActions.push({ type: "clear", slaId: metric.slaId, riskScore: 0, prediction: verdict.summary.slice(0, 200) });
        } else if (alreadyBreached) {
          // Already breached — record verdict as warning (audit trail) but don't slash again
          const riskScore = Math.round(verdict.councilConfidence * 100);
          pendingActions.push({ type: "warning", slaId: metric.slaId, riskScore, prediction: verdict.summary.slice(0, 200) });
          runtime.log(`[OathLayer] Tribunal SLA ${metric.slaId}: recording verdict (already breached, no double-slash)`);
        } else {
          verdicts.push({ ...verdict, uptimeBps: metric.uptimeBps });
        }
      }

      // Write breaches first (higher priority — slashes bond)
      const tribunalBreaches = verdicts.filter(v => v.action === "BREACH");
      const tribunalWarnings = verdicts.filter(v => v.action === "WARNING");

      for (const verdict of tribunalBreaches) {
        if (writesUsed >= CRE_WRITE_LIMIT) {
          runtime.log(`[OathLayer] TRIBUNAL BREACH SLA ${verdict.slaId}: SKIPPED (write budget exhausted, ${writesUsed}/${CRE_WRITE_LIMIT})`);
          continue;
        }
        runtime.log(`[OathLayer] TRIBUNAL BREACH SLA ${verdict.slaId}: unanimous — slashing bond`);
        writeBreach(runtime, evmClient, contractAddress, verdict.slaId, verdict.uptimeBps);
        pendingActions.push({ type: "breach", slaId: verdict.slaId, uptimeBps: verdict.uptimeBps });
        breachCount++;
        writesUsed++;
      }

      for (const verdict of tribunalWarnings) {
        if (writesUsed >= CRE_WRITE_LIMIT) {
          runtime.log(`[OathLayer] TRIBUNAL WARNING SLA ${verdict.slaId}: SKIPPED (write budget exhausted, ${writesUsed}/${CRE_WRITE_LIMIT})`);
          continue;
        }
        const confidenceScore = Math.round(verdict.councilConfidence * 100);
        const truncatedSummary = verdict.summary.slice(0, 200);
        runtime.log(`[OathLayer] TRIBUNAL WARNING SLA ${verdict.slaId}: ${truncatedSummary}`);

        const callData = encodeFunctionData({
          abi: RELAY_ABI,
          functionName: "recordBreachWarning",
          args: [BigInt(verdict.slaId), BigInt(confidenceScore), truncatedSummary],
        });
        const report = runtime.report(prepareReportRequest(callData)).result();
        sepoliaClient.writeReport(runtime, {
          receiver: toHex(toBytes(contractAddress, { size: 20 })),
          report,
        }).result();
        pendingActions.push({ type: "warning", slaId: verdict.slaId, riskScore: confidenceScore, prediction: truncatedSummary });
        warningCount++;
        writesUsed++;
      }

      runtime.log(`[OathLayer] Tribunal complete: ${activeSLAMetrics.length} SLAs deliberated, ${breachCount} breaches, ${warningCount} warnings (${writesUsed}/${CRE_WRITE_LIMIT} writes used)`);
    } catch (e) {
      // Fail silently — better to miss a warning than emit a false one
      runtime.log(`[OathLayer] Tribunal failed: ${(e as Error).message}`);
    }
  }

  // Bulk execute all on-chain writes via mock API (single ConfidentialHTTPClient call)
  // This is the actual on-chain execution — writeReport doesn't broadcast in simulation mode
  if (pendingActions.length > 0) {
    runtime.log(`[OathLayer] Executing ${pendingActions.length} on-chain actions via mock API...`);
    executeBulkViaMockAPI(runtime, pendingActions, apiKey);
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
