# OathKeeper CRE Workflow

Chainlink CRE (Compute Runtime Engine) workflow that monitors SLA compliance for tokenized real-world assets.

## Architecture

```
CRE Triggers:
  ├── Cron: every 15 minutes (proactive scan)
  └── EVM Log: ClaimFiled event (reactive)
        │
        ▼
  Workflow Callback:
  1. Read slaCount from SLAEnforcement.sol
  2. For each active SLA:
     a. httpClient → mock uptime API (provider metrics)
     b. Check uptime vs SLA minimum threshold
     c. If breached → evmClient.write → recordBreach()
        └── Slashes bond, transfers penalty to tenant
```

## Setup

```bash
npm install
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `SLA_CONTRACT_ADDRESS` | Deployed SLAEnforcement address | Zero address |
| `UPTIME_API_URL` | Mock API base URL | http://localhost:3001 |
| `API_KEY` | Provider API auth token | demo-key |

## Simulate

```bash
# Dry run (no broadcast)
cre workflow simulate --verbose

# With broadcast (writes to chain)
cre workflow simulate --verbose --broadcast
```

## Mock API

```bash
cd mock-api && npm install && npm run dev

# Trigger a breach (set uptime below 99.5%)
curl -X POST http://localhost:3001/set-uptime -H "Content-Type: application/json" -d '{"uptime": 98.0}'

# Check current state
curl http://localhost:3001/status

# Reset to healthy
curl -X POST http://localhost:3001/reset
```

## Demo Script

1. Start mock API: `cd mock-api && npm run dev`
2. Start CRE simulation: `npm run simulate`
3. Observe compliant state (uptime 99.9%)
4. Trigger breach: `curl -X POST :3001/set-uptime -d '{"uptime": 98.0}'`
5. Watch CRE detect breach and call `recordBreach()` on next scan
