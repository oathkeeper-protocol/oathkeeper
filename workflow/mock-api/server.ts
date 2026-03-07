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

// POST /demo-breach — simulate breach directly on-chain
// Calls recordBreachWarning (AI tribunal verdict) + recordBreach (penalty slash)
// Body: { slaId?: number, uptime?: number }
//   slaId: null/undefined = all active SLAs, number = specific SLA
//   uptime: the simulated uptime % (default: 94.0)
app.post('/demo-breach', requireAdminAuth, async (req: Request, res: Response) => {
  if (!walletClient || !publicClient || !CONTRACT) {
    res.status(500).json({ error: 'Contract client not configured (check TENDERLY_RPC_URL, CRE_ETH_PRIVATE_KEY, SLA_CONTRACT_ADDRESS)' });
    return;
  }

  const { slaId = null, uptime = 94.0 } = req.body as { slaId?: number | null; uptime?: number };
  const uptimeBps = Math.round(uptime * 100); // 94.0% → 9400
  const riskScore = Math.max(0, Math.min(100, Math.round(100 - uptime))); // lower uptime → higher risk
  const prediction = `[3-0 BREACH] Analyst: Uptime ${uptime}% below threshold; Advocate: No mitigating factors; Judge: Penalty warranted`;

  globalUptime = uptime;

  try {
    // Determine which SLAs to breach
    let slaIds: number[] = [];
    if (slaId !== null && slaId !== undefined) {
      slaIds = [slaId];
    } else {
      const count = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slaCount' });
      for (let i = 0; i < Number(count); i++) {
        const data = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slas', args: [BigInt(i)] });
        if (data[8]) slaIds.push(i); // only active SLAs
      }
    }

    const results: { slaId: number; warning?: string; breach?: string; error?: string }[] = [];

    for (const id of slaIds) {
      try {
        // 1. Record breach warning (AI tribunal verdict)
        const warnHash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreachWarning',
          args: [BigInt(id), BigInt(riskScore), prediction],
        });
        console.log(`[MockAPI] SLA #${id} — BreachWarning tx: ${warnHash}`);

        // 2. Record breach (slash bond)
        const breachHash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreach',
          args: [BigInt(id), BigInt(uptimeBps)],
        });
        console.log(`[MockAPI] SLA #${id} — Breach tx: ${breachHash}`);

        results.push({ slaId: id, warning: warnHash, breach: breachHash });
      } catch (err: any) {
        console.error(`[MockAPI] SLA #${id} breach failed:`, err.message?.slice(0, 200));
        results.push({ slaId: id, error: err.message?.slice(0, 200) });
      }
    }

    res.json({
      ok: true,
      message: `Breach simulated for ${results.length} SLA(s) at ${uptime}% uptime`,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to simulate breach', detail: err.message });
  }
});

// POST /demo-warning — simulate AI tribunal warning only (no slash)
app.post('/demo-warning', requireAdminAuth, async (req: Request, res: Response) => {
  if (!walletClient || !publicClient || !CONTRACT) {
    res.status(500).json({ error: 'Contract client not configured' });
    return;
  }

  const { slaId = null, uptime = 97.0 } = req.body as { slaId?: number | null; uptime?: number };
  const riskScore = Math.max(0, Math.min(100, Math.round(100 - uptime)));
  const prediction = `[2-1 BREACH] Analyst: Uptime trending down; Advocate: Temporary degradation; Judge: Warning issued`;

  globalUptime = uptime;

  try {
    let slaIds: number[] = [];
    if (slaId !== null && slaId !== undefined) {
      slaIds = [slaId];
    } else {
      const count = await publicClient.readContract({ address: CONTRACT, abi: SLA_ABI, functionName: 'slaCount' });
      for (let i = 0; i < Number(count); i++) slaIds.push(i);
    }

    const results: { slaId: number; warning?: string; error?: string }[] = [];
    for (const id of slaIds) {
      try {
        const hash = await walletClient.writeContract({
          address: CONTRACT, abi: SLA_ABI, functionName: 'recordBreachWarning',
          args: [BigInt(id), BigInt(riskScore), prediction],
        });
        results.push({ slaId: id, warning: hash });
      } catch (err: any) {
        results.push({ slaId: id, error: err.message?.slice(0, 200) });
      }
    }

    res.json({ ok: true, message: `Warning issued for ${results.length} SLA(s)`, results });
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
