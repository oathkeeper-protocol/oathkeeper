// mock-api/server.ts
// Mock provider uptime API for OathLayer demo
// Allows controlling uptime % to trigger/clear breaches during demo

import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

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
  console.log(`[MockAPI] Set breach: POST /set-uptime {"uptime": 98.0}`);
  console.log(`[MockAPI] Check status: GET /status`);
});

export default app;
