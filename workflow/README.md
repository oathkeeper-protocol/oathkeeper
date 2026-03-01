# OathLayer CRE Workflow

Chainlink CRE workflow that monitors SLA compliance, runs AI breach prediction, and gates provider registration with confidential HTTP compliance checks.

## Handlers

| Handler | Trigger | Action |
|---------|---------|--------|
| `onCronTrigger` | Every 15 min | `scanSLAs()` — fetch uptime, detect breaches, run Gemini prediction |
| `onClaimFiled` | `ClaimFiled` event | Immediate `scanSLAs()` re-scan |
| `onProviderRegistrationRequested` | World Chain event | ConfidentialHTTPClient KYC check → APPROVED/REJECTED + relay |
| `onArbitratorRegistrationRequested` | World Chain event | Direct relay to Sepolia |

## CRE Capabilities Used

1. **Cron** — 15-min compliance scan
2. **EVM Log triggers** — reactive to ClaimFiled, ProviderRegistrationRequested, ArbitratorRegistrationRequested
3. **ConfidentialHTTPClient** — TEE-encrypted compliance API + Gemini API calls
4. **Secrets** — threshold-encrypted storage for API keys
5. **Cross-chain relay** — World Chain → Sepolia via trusted forwarder

## Config

| Key | Description |
|-----|-------------|
| `slaContractAddress` | SLAEnforcement on Sepolia |
| `uptimeApiUrl` | Mock API base URL |
| `complianceApiUrl` | Compliance API base URL |
| `chainSelectorName` | CCIP chain name |
| `worldChainContractAddress` | WorldChainRegistry address |
| `worldChainSelector` | CCIP chain selector for World Chain |

## Secrets (via `cre secrets create`)

- `UPTIME_API_KEY` — Mock API auth
- `COMPLIANCE_API_KEY` — Compliance API auth (ConfidentialHTTPClient)
- `GEMINI_API_KEY` — Gemini 2.0 Flash (ConfidentialHTTPClient)

## Commands

```bash
npm install

# Simulate
cre workflow simulate --verbose
cre workflow simulate --verbose --broadcast
```

## Mock API

```bash
cd mock-api && npm install && npm run dev

# Trigger breach
curl -X POST http://localhost:3001/set-uptime \
  -H "Content-Type: application/json" \
  -H "x-admin-token: demo-secret" \
  -d '{"uptime": 98.0}'

# Check compliance
curl http://localhost:3001/compliance/0x742d35Cc6634C0532925a3b844Bc9e7595f2bd9

# Reset
curl -X POST http://localhost:3001/reset -H "x-admin-token: demo-secret"
```
