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
  'function slas(uint256) view returns (address provider, address tenant, string serviceName, uint256 bondAmount, uint256 responseTimeHrs, uint256 minUptimeBps, uint256 penaltyBps, uint256 breachCount, bool active)',
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
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

type AgentVote = { vote: 'BREACH' | 'WARNING' | 'NO_BREACH'; confidence: number; reasoning: string };
type SLAVote = { slaId: number; vote: AgentVote };
type TribunalVerdict = { slaId: number; action: 'BREACH' | 'WARNING' | 'NONE'; tally: string; summary: string; riskScore: number };

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

async function callGroqAgent(systemPrompt: string, userPrompt: string, temperature = 0): Promise<SLAVote[]> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
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

  if (!res.ok) throw new Error(`Groq API HTTP ${res.status}`);
  const body = await res.json() as { choices: { message: { content: string } }[] };
  const content = body.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response');

  const parsed = JSON.parse(content);
  const votes: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed.votes) ? parsed.votes : Array.isArray(parsed.results) ? parsed.results : [];

  return votes.map((v: any) => {
    const isNested = typeof v.vote === 'object' && v.vote !== null;
    const rawVote: string = isNested ? v.vote.vote : v.vote;
    const rawConf: number = isNested ? v.vote.confidence : v.confidence;
    const rawReason: string = isNested ? v.vote.reasoning : v.reasoning;
    return {
      slaId: Number(v.slaId),
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

  let action: TribunalVerdict['action'];
  let tally: string;
  if (breachVotes.length === votes.length) {
    action = 'BREACH'; tally = `${votes.length}-0 BREACH`;
  } else if (breachVotes.length > votes.length / 2) {
    action = 'WARNING'; tally = `${breachVotes.length}-${votes.length - breachVotes.length} BREACH`;
  } else if (noBreachVotes.length === votes.length) {
    action = 'NONE'; tally = `0-${votes.length} CLEAR`;
  } else {
    action = warningVotes.length > 0 ? 'WARNING' : 'NONE';
    tally = `${breachVotes.length}-${noBreachVotes.length} SPLIT`;
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
  const analystVotes = await callGroqAgent(TRIBUNAL_PROMPTS.riskAnalyst, `Current SLA metrics with 7-day history:\n${metricsJson}`, 0);
  const analystSummary = JSON.stringify(analystVotes.map(v => ({ slaId: v.slaId, vote: v.vote.vote, confidence: v.vote.confidence, reasoning: v.vote.reasoning })));

  console.log('[Tribunal] Provider Advocate defending...');
  const advocateVotes = await callGroqAgent(TRIBUNAL_PROMPTS.providerAdvocate(analystSummary), `Current SLA metrics with 7-day history:\n${metricsJson}`, 0.3);
  const advocateSummary = JSON.stringify(advocateVotes.map(v => ({ slaId: v.slaId, vote: v.vote.vote, confidence: v.vote.confidence, reasoning: v.vote.reasoning })));

  console.log('[Tribunal] Enforcement Judge deliberating...');
  const judgeVotes = await callGroqAgent(TRIBUNAL_PROMPTS.enforcementJudge(analystSummary, advocateSummary), `Current SLA metrics with 7-day history:\n${metricsJson}`, 0);

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
      targets.push({ id: slaId, provider: data[0], minUptimeBps: Number(data[5]) });
    } else {
      const count = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slaCount' });
      for (let i = 0; i < Number(count); i++) {
        const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(i)] });
        if (data[8]) targets.push({ id: i, provider: data[0], minUptimeBps: Number(data[5]) });
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

    const results: { slaId: number; verdict: string; warning?: string; breach?: string; error?: string }[] = [];

    for (const verdict of verdicts) {
      try {
        // 1. Record breach warning (AI tribunal verdict)
        const warnHash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreachWarning',
          args: [BigInt(verdict.slaId), BigInt(verdict.riskScore), verdict.summary],
        });
        console.log(`[MockAPI] SLA #${verdict.slaId} — BreachWarning tx: ${warnHash} (${verdict.tally})`);

        // 2. Record breach (slash bond) — always slash in demo-breach regardless of tribunal outcome
        const breachHash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreach',
          args: [BigInt(verdict.slaId), BigInt(uptimeBps)],
        });
        console.log(`[MockAPI] SLA #${verdict.slaId} — Breach tx: ${breachHash}`);

        results.push({ slaId: verdict.slaId, verdict: verdict.tally, warning: warnHash, breach: breachHash });
      } catch (err: any) {
        console.error(`[MockAPI] SLA #${verdict.slaId} breach failed:`, err.message?.slice(0, 200));
        results.push({ slaId: verdict.slaId, verdict: verdict.tally, error: err.message?.slice(0, 200) });
      }
    }

    res.json({
      ok: true,
      message: `AI Tribunal + breach for ${results.length} SLA(s) at ${uptime}% uptime`,
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
      targets.push({ id: slaId, provider: data[0], minUptimeBps: Number(data[5]) });
    } else {
      const count = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slaCount' });
      for (let i = 0; i < Number(count); i++) {
        const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(i)] });
        targets.push({ id: i, provider: data[0], minUptimeBps: Number(data[5]) });
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

// POST /reset — reset all uptime to healthy
app.post('/reset', requireAdminAuth, (_req: Request, res: Response) => {
  globalUptime = 99.9;
  Object.keys(providerUptime).forEach(k => delete providerUptime[k]);
  Object.keys(providerHistory).forEach(k => delete providerHistory[k]);
  console.log('[MockAPI] Reset all uptime and history to defaults');
  res.json({ ok: true, message: 'All uptime and history reset' });
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
});

export default app;
