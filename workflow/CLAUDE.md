# Workflow Module

Chainlink CRE (Compute Runtime Engine) workflow + mock API server.

## workflow.ts

Single-file CRE workflow with 4 handlers:

1. **Cron (15min)** → `scanSLAs()` — reads all SLAs, fetches uptime, detects breaches, runs AI Tribunal (3-agent council via Groq)
2. **ClaimFiled event** → `scanSLAs()` — immediate re-scan on tenant claim
3. **ProviderRegistrationRequested** → confidential HTTP compliance check → APPROVED/REJECTED + relay
4. **ArbitratorRegistrationRequested** → direct relay to Sepolia

### Key Patterns
- `runtime.runInNodeMode()` + `consensusIdenticalAggregation()` for DON consensus
- `ConfidentialHTTPClient` for compliance API (TEE-encrypted, PII protected)
- `ConfidentialHTTPClient` for Groq API (API key protected from DON nodes)
- `encodeFunctionData` / `prepareReportRequest` / `writeReport` for on-chain writes
- **AI Tribunal Council**: 3 agents (Risk Analyst → Provider Advocate → Enforcement Judge) deliberate sequentially
  - Each agent uses Groq (Llama 3.3 70B) via `ConfidentialHTTPClient` with `response_format: { type: "json_object" }`
  - Votes tallied with Judge at 1.5x weight; unanimous BREACH → slash, majority → warning, unanimous clear → skip
  - Prediction string packed as `[TALLY] summary` (e.g. `[2-1 BREACH] Analyst: ...; Advocate: ...; Judge: ...`)
- Batch all SLA metrics into single prompt per agent call
- Historical uptime fetched from `/provider/:address/history` for Provider Advocate context

### Config Schema (z.object)
- `slaContractAddress` — SLAEnforcement on Sepolia
- `uptimeApiUrl` — Mock API base URL
- `complianceApiUrl` — Compliance API base URL
- `chainSelectorName` — CCIP chain name
- `worldChainContractAddress` — WorldChainRegistry address
- `worldChainSelector` — CCIP chain selector for World Chain

### CRE Secrets
- `UPTIME_API_KEY`, `COMPLIANCE_API_KEY`, `GROQ_API_KEY`

## mock-api/server.ts

Express server on `:3001` with:
- `GET /provider/:address/uptime` — returns uptime data (called by CRE)
- `GET /provider/:address/history` — returns 7-day uptime history (used by AI Tribunal's Provider Advocate)
- `GET /compliance/:address` — returns KYC compliance (called via ConfidentialHTTPClient)
- `POST /set-uptime` — demo control (admin auth required)
- `POST /set-provider-uptime` — per-provider override (admin auth required)
- `POST /set-history` — inject custom history for demo scenarios (admin auth required)
- `POST /reset` — reset all uptime and history (admin auth required)
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
