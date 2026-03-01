# Workflow Module

Chainlink CRE (Compute Runtime Engine) workflow + mock API server.

## workflow.ts

Single-file CRE workflow with 4 handlers:

1. **Cron (15min)** → `scanSLAs()` — reads all SLAs, fetches uptime, detects breaches, runs Gemini prediction
2. **ClaimFiled event** → `scanSLAs()` — immediate re-scan on tenant claim
3. **ProviderRegistrationRequested** → confidential HTTP compliance check → APPROVED/REJECTED + relay
4. **ArbitratorRegistrationRequested** → direct relay to Sepolia

### Key Patterns
- `runtime.runInNodeMode()` + `consensusIdenticalAggregation()` for DON consensus
- `ConfidentialHTTPClient` for compliance API (TEE-encrypted, PII protected)
- `ConfidentialHTTPClient` for Gemini API (API key protected from DON nodes)
- `encodeFunctionData` / `prepareReportRequest` / `writeReport` for on-chain writes
- Gemini uses `responseSchema` + `responseMimeType: "application/json"` for structured output
- Batch all SLA metrics into single Gemini prompt (avoids 15 RPM rate limit)
- `riskScore > 70` triggers `recordBreachWarning()` on-chain

### Config Schema (z.object)
- `slaContractAddress` — SLAEnforcement on Sepolia
- `uptimeApiUrl` — Mock API base URL
- `complianceApiUrl` — Compliance API base URL
- `chainSelectorName` — CCIP chain name
- `worldChainContractAddress` — WorldChainRegistry address
- `worldChainSelector` — CCIP chain selector for World Chain

### CRE Secrets
- `UPTIME_API_KEY`, `COMPLIANCE_API_KEY`, `GEMINI_API_KEY`

## mock-api/server.ts

Express server on `:3001` with:
- `GET /provider/:address/uptime` — returns uptime data (called by CRE)
- `GET /compliance/:address` — returns KYC compliance (called via ConfidentialHTTPClient)
- `POST /set-uptime` — demo control (admin auth required)
- `POST /set-provider-uptime` — per-provider override (admin auth required)
- `POST /reset` — reset all uptime (admin auth required)
- `GET /status` — health check

Admin auth: `x-admin-token` header matching `MOCK_API_ADMIN_SECRET` env var (default: `demo-secret`).
`DEMO_REJECT_ADDRESS` env var triggers compliance rejection for that address.

## Commands

```bash
npm install
cre workflow simulate --verbose              # dry run
cre workflow simulate --verbose --broadcast  # write to chain

# Mock API
cd mock-api && npm install && npm run dev
```
