// mock-api/server.ts
// Mock provider uptime API for OathLayer demo
// Allows controlling uptime % to trigger/clear breaches during demo

import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
import express, { Request, Response } from 'express';
import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// Load env from parent workflow/.env
config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(express.json());

// --- Viem setup for direct contract calls ---
const RPC_URL = process.env.TENDERLY_RPC_URL || '';
const PRIVATE_KEY = process.env.CRE_ETH_PRIVATE_KEY as `0x${string}` | undefined;
const CONTRACT = process.env.SLA_CONTRACT_ADDRESS as `0x${string}` | undefined;

const SLA_ABI = parseAbi([
  'function recordBreach(uint256 slaId, uint256 uptimeBps) external',
  'function recordBreachWarning(uint256 slaId, uint256 riskScore, string prediction) external',
  'function fileClaim(uint256 slaId, string description) external',
  'function registerArbitratorRelayed(address user, uint256 nullifierHash) external',
  'function verifiedArbitrators(address) view returns (bool)',
  'function slas(uint256) view returns (address provider, address tenant, string serviceName, uint256 bondAmount, uint256 initialBondAmount, uint256 responseTimeHrs, uint256 minUptimeBps, uint256 penaltyBps, uint256 createdAt, bool active)',
  'function slaCount() view returns (uint256)',
]);

const account = PRIVATE_KEY ? privateKeyToAccount(PRIVATE_KEY) : null;
const walletClient = account && RPC_URL ? createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
}) : null;
const publicClient = RPC_URL ? createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
}) : null;

// Per-provider uptime state (defaults to healthy 99.9%)
const providerUptime: Record<string, number> = {};
let globalUptime = 99.9; // Default uptime for unknown providers

// --- AI Tribunal Council (ported from workflow/workflow.ts) ---
const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY || '',
  process.env.GROQ_API_KEY_2 || '',
  process.env.GROQ_API_KEY_3 || '',
].filter(Boolean);
const GROQ_API_KEY = GROQ_API_KEYS[0] || '';

type AgentVote = { vote: 'BREACH' | 'WARNING' | 'NO_BREACH'; confidence: number; reasoning: string };
type SLAVote = { slaId: number; vote: AgentVote };
type TribunalVerdict = { slaId: number; action: 'BREACH' | 'WARNING' | 'NONE'; tally: string; summary: string; riskScore: number };

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

async function callGroqAgent(systemPrompt: string, userPrompt: string, temperature = 0, apiKey?: string): Promise<SLAVote[]> {
  const key = apiKey || GROQ_API_KEY;
  const MAX_RETRIES = 3;
  let res: Response | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
        temperature,
        response_format: { type: 'json_object' },
      }),
    });
    if (res.ok) break;
    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      console.log(`[MockAPI] Groq 429 — retry ${attempt + 1}/${MAX_RETRIES}, waiting 2s`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
  }

  if (!res!.ok) throw new Error(`Groq API HTTP ${res!.status}`);
  const body = await res.json() as { choices: { message: { content: string } }[] };
  const content = body.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response');

  const parsed = JSON.parse(content);
  console.log(`[Tribunal] Raw Groq response: ${content.slice(0, 300)}`);

  // Handle: array, {votes:[...]}, {results:[...]}, or single object {slaId, vote, ...}
  let votes: any[];
  if (Array.isArray(parsed)) {
    votes = parsed;
  } else if (Array.isArray(parsed.votes)) {
    votes = parsed.votes;
  } else if (Array.isArray(parsed.results)) {
    votes = parsed.results;
  } else if (parsed.slaId !== undefined || parsed.vote !== undefined) {
    // Single object response (common for single-SLA queries)
    votes = [parsed];
  } else {
    // Try to find any array value in the response
    const arrKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
    votes = arrKey ? parsed[arrKey] : [];
  }

  return votes.map((v: any) => {
    const isNested = typeof v.vote === 'object' && v.vote !== null;
    const rawVote: string = isNested ? v.vote.vote : v.vote;
    const rawConf: number = isNested ? v.vote.confidence : v.confidence;
    const rawReason: string = isNested ? v.vote.reasoning : v.reasoning;
    return {
      slaId: Number(v.slaId ?? v.sla_id ?? 0),
      vote: {
        vote: (['BREACH', 'WARNING', 'NO_BREACH'].includes(rawVote) ? rawVote : 'NO_BREACH') as AgentVote['vote'],
        confidence: Math.max(0, Math.min(1, Number(rawConf) || 0.5)),
        reasoning: String(rawReason ?? '').slice(0, 100),
      },
    };
  });
}

function tallyVotes(slaId: number, analyst?: AgentVote, advocate?: AgentVote, judge?: AgentVote): TribunalVerdict {
  const votes = [
    { role: 'Analyst', vote: analyst },
    { role: 'Advocate', vote: advocate },
    { role: 'Judge', vote: judge },
  ].filter(v => v.vote !== undefined) as { role: string; vote: AgentVote }[];

  if (votes.length === 0) return { slaId, action: 'NONE', tally: '0-0', summary: 'No tribunal votes', riskScore: 0 };

  const breachVotes = votes.filter(v => v.vote.vote === 'BREACH');
  const noBreachVotes = votes.filter(v => v.vote.vote === 'NO_BREACH');
  const warningVotes = votes.filter(v => v.vote.vote === 'WARNING');

  let weightedSum = 0, weightTotal = 0;
  for (const v of votes) {
    const w = v.role === 'Judge' ? 1.5 : 1.0;
    weightedSum += v.vote.confidence * w;
    weightTotal += w;
  }
  const councilConfidence = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // "For" = votes in favor of action (BREACH or WARNING), "Against" = NO_BREACH
  const forVotes = breachVotes.length + warningVotes.length;
  const againstVotes = noBreachVotes.length;

  let action: TribunalVerdict['action'];
  let tally: string;
  if (breachVotes.length === votes.length) {
    action = 'BREACH'; tally = `${votes.length}-0 BREACH`;
  } else if (breachVotes.length > votes.length / 2) {
    action = 'BREACH'; tally = `${breachVotes.length}-${againstVotes} BREACH`;
  } else if (noBreachVotes.length === votes.length) {
    action = 'NONE'; tally = `0-${votes.length} CLEAR`;
  } else if (forVotes > againstVotes) {
    action = 'WARNING'; tally = `${forVotes}-${againstVotes} WARNING`;
  } else {
    action = 'NONE'; tally = `${forVotes}-${againstVotes} CLEAR`;
  }

  const summary = `[${tally}] ${votes.map(v => `${v.role}: ${v.vote.reasoning}`).join('; ')}`.slice(0, 200);
  const riskScore = Math.round(councilConfidence * 100);

  return { slaId, action, tally, summary, riskScore };
}

// Run full 3-agent tribunal for given SLA metrics
async function runTribunal(metrics: { slaId: number; provider: string; uptimeBps: number; minUptimeBps: number }[]): Promise<TribunalVerdict[]> {
  // Fetch history for each provider
  const metricsWithHistory = metrics.map(m => {
    const addr = m.provider.toLowerCase();
    const currentUptime = providerUptime[addr] ?? globalUptime;
    const history: { timestamp: string; uptimePercent: number }[] = [];
    const now = Date.now();
    for (let d = 6; d >= 0; d--) {
      const date = new Date(now - d * 86400000);
      const dayUptime = d > 2
        ? 99.5 + Math.random() * 0.4
        : currentUptime + (99.9 - currentUptime) * (d / 3) + (Math.random() - 0.5) * 0.5;
      history.push({ timestamp: date.toISOString(), uptimePercent: Math.min(100, Math.max(0, parseFloat(dayUptime.toFixed(2)))) });
    }
    return { ...m, history: providerHistory[addr] ?? history };
  });

  const metricsJson = JSON.stringify(metricsWithHistory);

  console.log('[Tribunal] Risk Analyst evaluating...');
  const analystVotes = await callGroqAgent(TRIBUNAL_PROMPTS.riskAnalyst, `Current SLA metrics with 7-day history:\n${metricsJson}`, 0, GROQ_API_KEYS[0]);
  const analystSummary = JSON.stringify(analystVotes.map(v => ({ slaId: v.slaId, vote: v.vote.vote, confidence: v.vote.confidence, reasoning: v.vote.reasoning })));

  console.log('[Tribunal] Provider Advocate defending...');
  const advocateVotes = await callGroqAgent(TRIBUNAL_PROMPTS.providerAdvocate(analystSummary), `Current SLA metrics with 7-day history:\n${metricsJson}`, 0.3, GROQ_API_KEYS[1] || GROQ_API_KEYS[0]);
  const advocateSummary = JSON.stringify(advocateVotes.map(v => ({ slaId: v.slaId, vote: v.vote.vote, confidence: v.vote.confidence, reasoning: v.vote.reasoning })));

  console.log('[Tribunal] Enforcement Judge deliberating...');
  const judgeVotes = await callGroqAgent(TRIBUNAL_PROMPTS.enforcementJudge(analystSummary, advocateSummary), `Current SLA metrics with 7-day history:\n${metricsJson}`, 0, GROQ_API_KEYS[2] || GROQ_API_KEYS[0]);

  return metrics.map((m, idx) => {
    // Match by slaId first, fall back to index (LLMs often return slaId: 0 for single-SLA queries)
    const aVote = (analystVotes.find(v => v.slaId === m.slaId) ?? analystVotes[idx])?.vote;
    const dVote = (advocateVotes.find(v => v.slaId === m.slaId) ?? advocateVotes[idx])?.vote;
    const jVote = (judgeVotes.find(v => v.slaId === m.slaId) ?? judgeVotes[idx])?.vote;
    console.log(`[Tribunal] SLA #${m.slaId} votes: Analyst=${aVote?.vote ?? 'MISS'}, Advocate=${dVote?.vote ?? 'MISS'}, Judge=${jVote?.vote ?? 'MISS'}`);
    return tallyVotes(m.slaId, aVote, dVote, jVote);
  });
}

// --- Auth middleware for control endpoints ---
const requireAdminAuth = (req: Request, res: Response, next: () => void) => {
  if (req.headers['x-admin-token'] !== (process.env.MOCK_API_ADMIN_SECRET || 'demo-secret')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// --- Routes ---

// GET /compliance/:address — KYC/compliance check (called by CRE ConfidentialHTTPClient)
app.get('/compliance/:address', (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const rejectAddr = process.env.DEMO_REJECT_ADDRESS?.toLowerCase();

  if (rejectAddr && address === rejectAddr) {
    console.log(`[MockAPI] Compliance REJECTED for ${address} (DEMO_REJECT_ADDRESS match)`);
    res.json({
      compliant: false,
      riskLevel: 'high',
      reason: 'Sanctions match',
      checks: ['identity', 'sanctions', 'pep'],
    });
    return;
  }

  console.log(`[MockAPI] Compliance APPROVED for ${address}`);
  res.json({
    compliant: true,
    riskLevel: 'low',
    reason: 'KYC verified',
    checks: ['identity', 'sanctions', 'pep'],
  });
});

// GET provider uptime (called by CRE workflow)
app.get('/provider/:address/uptime', (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const uptime = providerUptime[address] ?? globalUptime;

  console.log(`[MockAPI] Uptime request for ${address}: ${uptime}%`);

  res.json({
    provider: req.params.address,
    uptimePercent: uptime,
    timestamp: new Date().toISOString(),
    status: uptime >= 99.5 ? 'compliant' : 'breached',
  });
});

// Per-provider history overrides for demo (set via POST /set-history)
const providerHistory: Record<string, { timestamp: string; uptimePercent: number }[]> = {};

// GET /provider/:address/history — 7-day uptime history (used by AI Tribunal's Provider Advocate)
app.get('/provider/:address/history', (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();

  // If demo operator set custom history, use it
  if (providerHistory[address]) {
    console.log(`[MockAPI] History request for ${address}: custom (${providerHistory[address].length} entries)`);
    res.json({ provider: req.params.address, history: providerHistory[address] });
    return;
  }

  // Generate 7 days of synthetic history based on current uptime
  const currentUptime = providerUptime[address] ?? globalUptime;
  const history: { timestamp: string; uptimePercent: number }[] = [];
  const now = Date.now();

  for (let d = 6; d >= 0; d--) {
    const date = new Date(now - d * 86400000);
    // If current uptime is degraded, show a gradual decline pattern
    const dayUptime = d > 2
      ? 99.5 + Math.random() * 0.4 // Days 7-3: healthy
      : currentUptime + (99.9 - currentUptime) * (d / 3) + (Math.random() - 0.5) * 0.5; // Days 2-0: trending toward current
    history.push({
      timestamp: date.toISOString(),
      uptimePercent: Math.min(100, Math.max(0, parseFloat(dayUptime.toFixed(2)))),
    });
  }

  console.log(`[MockAPI] History request for ${address}: synthetic (7 days)`);
  res.json({ provider: req.params.address, history });
});

// POST /set-uptime — demo control: set global uptime
// Used during demo to trigger a breach
app.post('/set-uptime', requireAdminAuth, (req: Request, res: Response) => {
  const { uptime } = req.body as { uptime: number };
  if (typeof uptime !== 'number' || uptime < 0 || uptime > 100) {
    res.status(400).json({ error: 'uptime must be a number between 0 and 100' });
    return;
  }

  globalUptime = uptime;
  console.log(`[MockAPI] Global uptime set to ${uptime}%`);
  res.json({ ok: true, uptime: globalUptime });
});

// POST /set-provider-uptime — demo control: set per-provider uptime
app.post('/set-provider-uptime', requireAdminAuth, (req: Request, res: Response) => {
  const { address, uptime } = req.body as { address: string; uptime: number };
  if (!address || typeof uptime !== 'number' || uptime < 0 || uptime > 100) {
    res.status(400).json({ error: 'address and uptime (0-100) required' });
    return;
  }

  providerUptime[address.toLowerCase()] = uptime;
  console.log(`[MockAPI] Provider ${address} uptime set to ${uptime}%`);
  res.json({ ok: true, address, uptime });
});

// GET /status — health check + current state
app.get('/status', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    globalUptime,
    providerOverrides: providerUptime,
    timestamp: new Date().toISOString(),
  });
});

// POST /set-history — demo control: inject custom history for a provider
app.post('/set-history', requireAdminAuth, (req: Request, res: Response) => {
  const { address, history } = req.body as { address: string; history: { timestamp: string; uptimePercent: number }[] };
  if (!address || !Array.isArray(history)) {
    res.status(400).json({ error: 'address and history[] required' });
    return;
  }
  providerHistory[address.toLowerCase()] = history;
  console.log(`[MockAPI] Custom history set for ${address} (${history.length} entries)`);
  res.json({ ok: true, address, entries: history.length });
});

// POST /demo-breach — run AI Tribunal + write breach on-chain
// Body: { slaId?: number, uptime?: number }
//   slaId: null/undefined = all active SLAs, number = specific SLA
//   uptime: the simulated uptime % (default: 94.0)
app.post('/demo-breach', requireAdminAuth, async (req: Request, res: Response) => {
  if (!walletClient || !publicClient || !CONTRACT) {
    res.status(500).json({ error: 'Contract client not configured (check TENDERLY_RPC_URL, CRE_ETH_PRIVATE_KEY, SLA_CONTRACT_ADDRESS)' });
    return;
  }

  const { slaId = null, uptime = 94.0 } = req.body as { slaId?: number | null; uptime?: number };
  const uptimeBps = Math.round(uptime * 100);
  globalUptime = uptime;

  try {
    // Collect target SLAs with their on-chain data
    const targets: { id: number; provider: string; minUptimeBps: number }[] = [];
    if (slaId !== null && slaId !== undefined) {
      const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(slaId)] });
      targets.push({ id: slaId, provider: data[0], minUptimeBps: Number(data[6]) });
    } else {
      const count = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slaCount' });
      for (let i = 0; i < Number(count); i++) {
        const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(i)] });
        if (data[9]) targets.push({ id: i, provider: data[0], minUptimeBps: Number(data[6]) });
      }
    }

    // Run AI Tribunal (3-agent council via Groq)
    const metrics = targets.map(t => ({ slaId: t.id, provider: t.provider, uptimeBps, minUptimeBps: t.minUptimeBps }));
    let verdicts: TribunalVerdict[];
    if (GROQ_API_KEY) {
      console.log(`[MockAPI] Running AI Tribunal for ${targets.length} SLA(s)...`);
      verdicts = await runTribunal(metrics);
    } else {
      console.log('[MockAPI] No GROQ_API_KEY — using fallback verdict');
      verdicts = metrics.map(m => ({
        slaId: m.slaId, action: 'BREACH' as const, tally: '3-0 BREACH',
        summary: `[3-0 BREACH] Analyst: Uptime ${uptime}% below ${m.minUptimeBps/100}% threshold; Advocate: No mitigating factors; Judge: Penalty warranted`,
        riskScore: Math.max(0, Math.min(100, Math.round(100 - uptime))),
      }));
    }

    const results: { slaId: number; verdict: string; action: string; warning?: string; breach?: string; skipped?: string; error?: string }[] = [];

    for (let i = 0; i < verdicts.length; i++) {
      const verdict = verdicts[i];
      const target = targets[i];
      const belowThreshold = uptimeBps < target.minUptimeBps;

      try {
        if (verdict.action === 'NONE') {
          // Tribunal says CLEAR — record with riskScore=0 so dashboard shows full assessment history
          const clearHash = await walletClient.writeContract({
            address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreachWarning',
            args: [BigInt(verdict.slaId), BigInt(0), verdict.summary],
          });
          console.log(`[MockAPI] SLA #${verdict.slaId} — CLEAR (${verdict.tally}) tx: ${clearHash}`);
          results.push({ slaId: verdict.slaId, verdict: verdict.tally, action: 'clear', warning: clearHash });
          continue;
        }

        // Record tribunal verdict as warning
        const warnHash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreachWarning',
          args: [BigInt(verdict.slaId), BigInt(verdict.riskScore), verdict.summary],
        });
        console.log(`[MockAPI] SLA #${verdict.slaId} — BreachWarning tx: ${warnHash} (${verdict.tally})`);

        // Only slash if tribunal says BREACH AND uptime is actually below threshold
        if (verdict.action === 'BREACH' && belowThreshold) {
          const breachHash = await walletClient.writeContract({
            address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreach',
            args: [BigInt(verdict.slaId), BigInt(uptimeBps)],
          });
          console.log(`[MockAPI] SLA #${verdict.slaId} — Breach tx: ${breachHash}`);
          results.push({ slaId: verdict.slaId, verdict: verdict.tally, action: 'breach', warning: warnHash, breach: breachHash });
        } else {
          console.log(`[MockAPI] SLA #${verdict.slaId} — Warning only (verdict=${verdict.action}, uptime ${uptime}% vs ${target.minUptimeBps/100}%)`);
          results.push({ slaId: verdict.slaId, verdict: verdict.tally, action: 'warning', warning: warnHash });
        }
      } catch (err: any) {
        console.error(`[MockAPI] SLA #${verdict.slaId} failed:`, err.message?.slice(0, 200));
        results.push({ slaId: verdict.slaId, verdict: verdict.tally, action: 'error', error: err.message?.slice(0, 200) });
      }
    }

    res.json({
      ok: true,
      message: `AI Tribunal for ${results.length} SLA(s) at ${uptime}% uptime`,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to simulate breach', detail: err.message });
  }
});

// POST /demo-warning — run AI Tribunal + write warning only (no slash)
app.post('/demo-warning', requireAdminAuth, async (req: Request, res: Response) => {
  if (!walletClient || !publicClient || !CONTRACT) {
    res.status(500).json({ error: 'Contract client not configured' });
    return;
  }

  const { slaId = null, uptime = 97.0 } = req.body as { slaId?: number | null; uptime?: number };
  const uptimeBps = Math.round(uptime * 100);
  globalUptime = uptime;

  try {
    const targets: { id: number; provider: string; minUptimeBps: number }[] = [];
    if (slaId !== null && slaId !== undefined) {
      const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(slaId)] });
      targets.push({ id: slaId, provider: data[0], minUptimeBps: Number(data[6]) });
    } else {
      const count = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slaCount' });
      for (let i = 0; i < Number(count); i++) {
        const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(i)] });
        targets.push({ id: i, provider: data[0], minUptimeBps: Number(data[6]) });
      }
    }

    const metrics = targets.map(t => ({ slaId: t.id, provider: t.provider, uptimeBps, minUptimeBps: t.minUptimeBps }));
    let verdicts: TribunalVerdict[];
    if (GROQ_API_KEY) {
      console.log(`[MockAPI] Running AI Tribunal (warning-only) for ${targets.length} SLA(s)...`);
      verdicts = await runTribunal(metrics);
    } else {
      verdicts = metrics.map(m => ({
        slaId: m.slaId, action: 'WARNING' as const, tally: '2-1 BREACH',
        summary: `[2-1 BREACH] Analyst: Uptime trending down; Advocate: Temporary degradation; Judge: Warning issued`,
        riskScore: Math.max(0, Math.min(100, Math.round(100 - uptime))),
      }));
    }

    const results: { slaId: number; verdict: string; warning?: string; error?: string }[] = [];
    for (const verdict of verdicts) {
      try {
        const hash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreachWarning',
          args: [BigInt(verdict.slaId), BigInt(verdict.riskScore), verdict.summary],
        });
        console.log(`[MockAPI] SLA #${verdict.slaId} — Warning tx: ${hash} (${verdict.tally})`);
        results.push({ slaId: verdict.slaId, verdict: verdict.tally, warning: hash });
      } catch (err: any) {
        results.push({ slaId: verdict.slaId, verdict: verdict.tally, error: err.message?.slice(0, 200) });
      }
    }

    res.json({ ok: true, message: `AI Tribunal warning for ${results.length} SLA(s)`, results });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed', detail: err.message });
  }
});

// POST /demo-claim — file a claim as tenant (impersonates tenant via Tenderly)
app.post('/demo-claim', requireAdminAuth, async (req: Request, res: Response) => {
  if (!publicClient || !CONTRACT || !RPC_URL) {
    res.status(500).json({ error: 'Contract client not configured' });
    return;
  }

  const { slaId = 0, description = 'Downtime incident — provider unresponsive for >2h' } = req.body as { slaId?: number; description?: string };

  try {
    // Read tenant address from SLA
    const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(slaId)] });
    const tenant = data[1] as `0x${string}`;

    if (tenant === '0x0000000000000000000000000000000000000000') {
      res.status(400).json({ error: `SLA #${slaId} has no tenant` });
      return;
    }

    // Fund tenant via Tenderly (needs ETH for gas)
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tenderly_setBalance', params: [tenant, '0xDE0B6B3A7640000'], id: 1 }),
    });

    // Tenderly VNet allows sending tx from any funded address without private key
    const calldata = encodeFunctionData({ abi: SLA_ABI, functionName: 'fileClaim', args: [BigInt(slaId), description] });

    const txRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_sendTransaction', id: 1,
        params: [{ from: tenant, to: CONTRACT, data: calldata, gas: '0x100000' }],
      }),
    });
    const txData = await txRes.json() as { result?: string; error?: { message: string } };

    if (txData.error) {
      res.status(500).json({ error: `Claim failed: ${txData.error.message}` });
      return;
    }

    console.log(`[MockAPI] SLA #${slaId} — Claim filed as tenant ${tenant.slice(0, 10)}... tx: ${txData.result}`);
    res.json({ ok: true, message: `Claim filed for SLA #${slaId}`, slaId, tenant, tx: txData.result });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to file claim', detail: err.message });
  }
});

// POST /time-warp — advance VNet time (for cooldown testing)
// Body: { hours?: number } — default 25h
app.post('/time-warp', requireAdminAuth, async (req: Request, res: Response) => {
  if (!RPC_URL) {
    res.status(500).json({ error: 'RPC_URL not configured' });
    return;
  }
  const { hours = 25 } = req.body as { hours?: number };
  const seconds = Math.round(hours * 3600);
  try {
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [`0x${seconds.toString(16)}`], id: 1 }),
    });
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'evm_mine', params: [], id: 2 }),
    });
    console.log(`[MockAPI] Time warped ${hours}h forward`);
    res.json({ ok: true, message: `Advanced VNet time ${hours}h` });
  } catch (err: any) {
    res.status(500).json({ error: 'Time warp failed', detail: err.message });
  }
});

// POST /reset — reset all uptime to healthy + fast-forward past cooldowns
app.post('/reset', requireAdminAuth, async (_req: Request, res: Response) => {
  globalUptime = 99.9;
  Object.keys(providerUptime).forEach(k => delete providerUptime[k]);
  Object.keys(providerHistory).forEach(k => delete providerHistory[k]);

  // Fast-forward Tenderly VNet time past cooldowns (25h > 24h breach + 4h warning)
  if (RPC_URL) {
    try {
      await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'evm_increaseTime', params: ['0x15F90'], id: 1 }), // 25 hours
      });
      await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'evm_mine', params: [], id: 2 }),
      });
      console.log('[MockAPI] Reset + fast-forwarded VNet 25h past cooldowns');
    } catch (e) {
      console.log('[MockAPI] Reset (time warp failed, cooldowns may still apply)');
    }
  }

  res.json({ ok: true, message: 'All uptime and history reset, cooldowns cleared' });
});

// POST /seed-arbitrator — register an address as arbitrator (bypasses World ID for demo)
app.post('/seed-arbitrator', requireAdminAuth, async (req: Request, res: Response) => {
  if (!walletClient || !publicClient || !CONTRACT) {
    res.status(500).json({ error: 'Contract client not configured' });
    return;
  }

  const { address: addr } = req.body as { address?: string };
  if (!addr) {
    res.status(400).json({ error: 'address required' });
    return;
  }

  try {
    const already = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'verifiedArbitrators', args: [addr as `0x${string}`] });
    if (already) {
      console.log(`[MockAPI] ${addr.slice(0, 10)}... already registered as arbitrator`);
      res.json({ ok: true, message: 'Already registered', address: addr });
      return;
    }

    const hash = await walletClient.writeContract({
      address: CONTRACT, abi: SLA_ABI, functionName: 'registerArbitratorRelayed',
      args: [addr as `0x${string}`, BigInt(Math.floor(Math.random() * 1e15))],
    });
    console.log(`[MockAPI] Registered ${addr.slice(0, 10)}... as arbitrator (demo bypass) tx: ${hash}`);
    res.json({ ok: true, message: `Arbitrator registered (demo bypass)`, address: addr, tx: hash });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to register arbitrator', detail: err.message?.slice(0, 200) });
  }
});

// --- CRE Execution Endpoints ---
// Called by CRE workflow to execute on-chain writes (since CRE simulation can't broadcast)

// CRE bulk execution endpoint — single POST handles all breaches + warnings + clears
// Called once per CRE workflow run via ConfidentialHTTPClient
type CREAction = {
  type: 'breach' | 'warning' | 'clear';
  slaId: number;
  uptimeBps?: number;
  riskScore?: number;
  prediction?: string;
};

app.post('/cre/execute', requireAdminAuth, async (req: Request, res: Response) => {
  if (!walletClient || !CONTRACT) {
    res.status(500).json({ error: 'Wallet not configured' });
    return;
  }
  const { actions } = req.body as { actions?: CREAction[] };
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    res.status(400).json({ error: 'actions array required' });
    return;
  }

  const results: { slaId: number; type: string; ok: boolean; tx?: string; error?: string }[] = [];

  for (const action of actions) {
    try {
      if (action.type === 'breach') {
        const hash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreach',
          args: [BigInt(action.slaId), BigInt(action.uptimeBps ?? 0)],
        });
        console.log(`[MockAPI] CRE breach SLA ${action.slaId} tx: ${hash}`);
        results.push({ slaId: action.slaId, type: 'breach', ok: true, tx: hash });
      } else if (action.type === 'warning' || action.type === 'clear') {
        const riskScore = action.type === 'clear' ? 0 : (action.riskScore ?? 0);
        const prediction = action.prediction ?? (action.type === 'clear' ? '[CLEAR] No risk detected' : '');
        const hash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreachWarning',
          args: [BigInt(action.slaId), BigInt(riskScore), prediction],
        });
        console.log(`[MockAPI] CRE ${action.type} SLA ${action.slaId} tx: ${hash}`);
        results.push({ slaId: action.slaId, type: action.type, ok: true, tx: hash });
      }
    } catch (err: any) {
      console.log(`[MockAPI] CRE ${action.type} SLA ${action.slaId} failed: ${err.message?.slice(0, 200)}`);
      results.push({ slaId: action.slaId, type: action.type, ok: false, error: err.message?.slice(0, 200) });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  console.log(`[MockAPI] CRE bulk execute: ${succeeded}/${actions.length} succeeded`);
  res.json({ ok: true, total: actions.length, succeeded, results });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[MockAPI] OathLayer mock uptime API running on :${PORT}`);
  console.log(`[MockAPI] Endpoints:`);
  console.log(`  GET  /status                  — health check`);
  console.log(`  GET  /provider/:addr/uptime   — provider uptime`);
  console.log(`  GET  /provider/:addr/history  — 7-day history`);
  console.log(`  POST /demo-breach             — breach + slash on-chain`);
  console.log(`  POST /demo-warning            — warning only (no slash)`);
  console.log(`  POST /reset                   — reset all to healthy`);
  console.log(`  POST /cre/execute             — CRE bulk execution: breaches + warnings + clears`);
});

export default app;
