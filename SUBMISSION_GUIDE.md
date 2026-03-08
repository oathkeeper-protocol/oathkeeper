# OathLayer — Submission Guide

**Hackathon:** CONVERGENCE (Chainlink) — Deadline: March 27, 2026

---

## Tracks We're Targeting (4 tracks)

### 1. Risk & Compliance — $16K pool (1st: $10K, 2nd: $6K)

**Why we win this:** OathLayer is literally automated risk monitoring + protocol safeguard triggers. CRE monitors uptime, AI Tribunal predicts risk, `recordBreach()` auto-slashes bonds. This is our strongest track.

**What judges want to see:**
- Monitoring, safeguards, automated controls
- Detect risk, verify system health, trigger predefined responses
- CRE Workflow integrating blockchain + external API/AI

**Our pitch angle:**
> "OathLayer automates SLA compliance for tokenized RWA infrastructure. Chainlink CRE monitors uptime every 15 minutes, a 3-agent AI Tribunal Council deliberates adversarially to prevent false positives, and breached providers get bonds slashed automatically — zero human intervention."

**Key demo moments:**
- Live breach: drop uptime → CRE scan → AI Tribunal votes → bond slashed on-chain
- Show the 3-agent deliberation output (Risk Analyst vs Provider Advocate vs Judge)
- Dashboard updating in real-time with breach events
- Compliance gate: only approved providers can create SLAs

---

### 2. Best Use of World ID with CRE — $5K pool (1st: $3K, 2nd: $1.5K, 3rd: $500)

**Why we win this:** We're doing exactly what the track asks — using CRE to bring World ID to a chain where it's not natively supported. World ID verifies on World Chain, CRE relays to Sepolia.

**What judges want to see:**
- World ID integrated with CRE
- Enable World ID on blockchains where not natively supported
- Proof verification on-chain or off-chain via CRE

**Our pitch angle:**
> "World ID is native to World Chain but SLA enforcement lives on Sepolia. OathLayer uses CRE as a cross-chain identity bridge — providers verify via World ID on World Chain, CRE's EVM Log trigger picks up the `ProviderRegistrationRequested` event, runs a ConfidentialHTTPClient compliance check, and relays the verified identity to Sepolia. This pattern generalizes: CRE as a cross-chain identity relay for any chain."

**Key demo moments:**
- World ID verification flow (IDKit v4 → on-chain proof)
- Show WorldChainRegistry contract on World Chain VNet
- CRE relay: event on World Chain → compliance check → `setComplianceStatus()` on Sepolia
- Arbitrator registration also gated by World ID (two use cases, not just one)
- Dashboard shows provider identity proof (nullifier hash, tx hash)

---

### 3. Build CRE Workflows with Tenderly Virtual TestNets — $5K pool (1st: $5K, 2nd: $2.5K, 3rd: $1.75K)

**Why we win this:** Two VNets with State Sync, both with public explorers, real transaction history, multi-chain CRE workflow tested on Tenderly infrastructure.

**What judges want to see:**
- Tenderly VNet Explorer link with deployed contracts + tx history
- GitHub repo with CRE workflows, contracts, deployment scripts, docs
- Clear CRE workflow execution demo
- Documentation of architecture and integration

**Our pitch angle:**
> "OathLayer runs on two Tenderly Virtual TestNets — Sepolia fork for SLA enforcement and World Chain Sepolia fork for provider identity — both with State Sync enabled for live protocol state. The multi-chain CRE workflow orchestrates cross-chain identity relay, AI-powered risk assessment, and automated bond slashing, all testable with Tenderly's unlimited faucet and debuggable via the public explorer."

**Submission checklist:**
- [ ] Tenderly Explorer links (both VNets)
  - Sepolia VNet: https://dashboard.tenderly.co/robbyn/project/testnet/5c780e4f-4df5-4a50-b221-2342cd4b713e
  - World Chain VNet: https://dashboard.tenderly.co/robbyn/project/testnet/d8f04de9-4cc1-4066-b8d3-31ed51ee1d85
- [ ] Show State Sync is ON (proves live state, not stale fork)
- [ ] Multiple tx types visible: registration, SLA creation, breach, warning, compliance
- [ ] README documents Tenderly usage and VNet architecture

---

### 4. Best CRE Usage in World Mini App — $5K pool (1st: $3K, 2nd: $1.5K, 3rd: $500)

**Why we qualify:** Mini App for provider registration + claims inside World App, CRE handles cross-chain relay + compliance.

**What judges want to see:**
- CRE integrated in Mini App architecture
- Cross-chain or off-chain capability via CRE
- Mini App running in World App webview

**Our pitch angle:**
> "OathLayer's Mini App lets providers register and tenants file claims directly from World App. Registration triggers a CRE workflow: World ID proof verified on World Chain, ConfidentialHTTPClient runs compliance check, and identity is relayed cross-chain to Sepolia — all from a single tap in the Mini App."

**Key demo moments:**
- Show Mini App in World App simulator or on device
- Registration flow: World ID → CRE relay → compliance → approved on Sepolia
- File claim from Mini App → CRE reactive scan triggers

**Note:** The dashboard now handles World ID via IDKit v4 directly, so the Mini App is a secondary interface. Emphasize that the Mini App demonstrates CRE enabling multi-chain functionality from a World Chain-only environment.

---

## Universal Submission Requirements (ALL tracks)

- [ ] **CRE Workflow** — integrates blockchain + external API/AI/data source
- [ ] **Simulation or deployment** — successful `cre workflow simulate` or live CRE network
- [ ] **Video** — 3-5 minute publicly viewable demo video
- [ ] **Public repo** — GitHub public
- [ ] **README** — links to all Chainlink-integrated files
- [ ] **Novel project** — not a resubmission of past hackathon work

---

## Chainlink Files Reference (for README)

| File | Chainlink Usage |
|------|----------------|
| [`workflow/workflow.ts`](./workflow/workflow.ts) | CRE SDK — cron trigger, EVM log triggers, ConfidentialHTTPClient, Secrets, AI Tribunal |
| [`contracts/src/SLAEnforcement.sol`](./contracts/src/SLAEnforcement.sol) | `AggregatorV3Interface` (ETH/USD price feed), `onlyCREForwarder` access control |
| [`contracts/src/WorldChainRegistry.sol`](./contracts/src/WorldChainRegistry.sol) | Cross-chain registration proxy — emits events consumed by CRE EVM log trigger |
| [`workflow/workflow.yaml`](./workflow/workflow.yaml) | CRE workflow configuration, targets, secrets |
| [`workflow/config.local.json`](./workflow/config.local.json) | Runtime config: contract addresses, chain selectors, API endpoints |
| [`project.yaml`](./project.yaml) | CRE project config with RPC endpoints |
| [`secrets.yaml`](./secrets.yaml) | CRE secrets mapping (GROQ_API_KEY, UPTIME_API_KEY, COMPLIANCE_API_KEY) |

---

## 5 CRE Capabilities Used

| # | Capability | Where |
|---|-----------|-------|
| 1 | **Cron trigger** | Scans all active SLAs every 15 minutes |
| 2 | **EVM Log trigger** | Reacts to `ClaimFiled`, `ProviderRegistrationRequested`, `ArbitratorRegistrationRequested` |
| 3 | **ConfidentialHTTPClient** | Compliance KYC check (TEE-encrypted), AI Tribunal via Groq API |
| 4 | **Secrets** | `GROQ_API_KEY`, `COMPLIANCE_API_KEY`, `UPTIME_API_KEY` — threshold-encrypted vault |
| 5 | **Cross-chain relay** | World Chain → Sepolia identity bridge via trusted CRE forwarder |

---

## Deployed Infrastructure

| Component | Location | Link |
|-----------|----------|------|
| SLAEnforcement | OathLayer VNet (Sepolia fork, State Sync ON) | `0x8286A8cfA5c8C1872097D9b43E01CbdEe934D319` |
| WorldChainRegistry | OathLayer World Chain VNet (State Sync ON) | `0xe1349d2c44422b70c73bf767afb58ae1c59cd1fd` |
| Sepolia VNet Explorer | Tenderly | [Link](https://dashboard.tenderly.co/robbyn/project/testnet/5c780e4f-4df5-4a50-b221-2342cd4b713e) |
| World Chain VNet Explorer | Tenderly | [Link](https://dashboard.tenderly.co/robbyn/project/testnet/d8f04de9-4cc1-4066-b8d3-31ed51ee1d85) |
| Dashboard | Vercel | [oathlayer-protocol.vercel.app](https://oathlayer-protocol.vercel.app) |
| Mini App | VPS (Docker) | [oathlayer-miniapp.robbyn.xyz](https://oathlayer-miniapp.robbyn.xyz) |
| Mock API | VPS (Docker) | [oathlayer-api.robbyn.xyz](https://oathlayer-api.robbyn.xyz) |
| Ponder Indexer | VPS (Docker) | [oathlayer-indexer.robbyn.xyz](https://oathlayer-indexer.robbyn.xyz) |

---

## Video Script Outline (3-5 min)

### 0:00-0:30 — Hook + Problem
- "What happens when your cloud provider breaks their SLA? Nothing. You file a ticket, wait weeks, maybe get a credit. OathLayer changes that."

### 0:30-1:00 — Architecture Overview
- Quick diagram: World Chain (identity) → CRE (orchestration + AI) → Sepolia (enforcement)
- "5 Chainlink CRE capabilities in one workflow"

### 1:00-2:30 — Live Breach Demo (THE MONEY SHOT)
- Show healthy dashboard
- Drop uptime via mock API
- Run CRE workflow → 3-agent AI Tribunal deliberates
- Dashboard updates: tribunal verdict badge, breach event, bond slashed
- "No human intervention. Three AI agents deliberated adversarially. Bond slashed automatically."

### 2:30-3:30 — Provider Registration + World ID
- World ID verification via IDKit v4
- Compliance check via ConfidentialHTTPClient
- Cross-chain relay: World Chain → Sepolia
- "World ID isn't native to Sepolia. CRE bridges that gap."

### 3:30-4:00 — Claims + Arbitration
- File claim → reactive CRE scan (not waiting for cron)
- Arbitration panel — World ID gated safety valve

### 4:00-4:30 — Tenderly Infrastructure
- Show both VNet explorers with real tx history
- State Sync enabled — live protocol state
- "All verifiable on Tenderly's public explorer"

### 4:30-5:00 — Closing
- Recap: 5 CRE capabilities, 3-agent AI Tribunal, cross-chain World ID, dual Tenderly VNets
- "Automated SLA enforcement. No lawyers. No disputes. Code is law."

---

## Pre-Submission Checklist

### Code & Docs
- [ ] GitHub repo is PUBLIC
- [ ] README has Chainlink files table
- [ ] README has Tenderly explorer links (both VNets)
- [ ] README documents architecture, setup, and demo flow
- [ ] DEMO_GUIDE.md has step-by-step demo instructions
- [ ] All `.env` files excluded from repo
- [ ] Contract source verified on Tenderly

### Demo Readiness
- [ ] Mock API running and responding
- [ ] Dashboard loads with live on-chain data
- [ ] CRE simulation works: `cre workflow simulate` succeeds
- [ ] Breach flow works end-to-end: set-uptime → CRE scan → breach on-chain → dashboard updates
- [ ] World ID registration flow works (State Sync enabled)
- [ ] Mini App accessible via World App

### Tenderly
- [ ] State Sync ON for both VNets
- [ ] Public Explorer ON for both VNets
- [ ] Transaction history visible (registrations, SLAs, breaches, warnings)
- [ ] Explorer links work without authentication

### Video
- [ ] 3-5 minutes
- [ ] Publicly viewable (YouTube unlisted or similar)
- [ ] Shows CRE workflow execution (simulation or live)
- [ ] Live breach demo included
- [ ] Good audio quality

### Submission Form
- [ ] Project name: OathLayer
- [ ] Track selections: Risk & Compliance, World ID + CRE, Mini App + CRE, Tenderly VNets
- [ ] GitHub link
- [ ] Video link
- [ ] Tenderly explorer links
- [ ] Team info

---

## Estimated Prize Potential

| Track | Prize | Our Strength | Confidence |
|-------|-------|-------------|------------|
| Risk & Compliance | $10K (1st) / $6K (2nd) | Core use case, strong technical depth | HIGH |
| World ID + CRE | $3K (1st) / $1.5K (2nd) | Exact track requirement, cross-chain relay | HIGH |
| Tenderly VNets | $5K (1st) / $2.5K (2nd) | Dual VNets, State Sync, public explorers | MEDIUM-HIGH |
| Mini App + CRE | $3K (1st) / $1.5K (2nd) | Functional but secondary to dashboard | MEDIUM |
| Top 10 Projects | $1.5K | Strong overall project | MEDIUM |

**Best case:** $22.5K (1st in all) — unlikely but possible
**Realistic target:** $10K-15K across multiple tracks

---

## Eligibility Audit — Track-by-Track

### Universal Requirements (apply to ALL tracks)

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | CRE Workflow integrating blockchain + external API/AI | DONE | `workflow/workflow.ts` — cron + log triggers, Groq AI, mock API, ConfidentialHTTPClient |
| 2 | Successful simulation (CLI) or live CRE deployment | NEEDS TEST | `cre workflow simulate` — must verify it runs clean post State Sync changes |
| 3 | 3-5 min publicly viewable video | NOT DONE | Need to record |
| 4 | Publicly accessible source code (GitHub) | NEEDS CHECK | Repo exists at `oathlayer-protocol/app` — verify it's set to PUBLIC |
| 5 | README links to all Chainlink-integrated files | DONE | README has "Chainlink Files" table with 3 files |
| 6 | Novel project (not past hackathon resubmission) | DONE | First submission |
| 7 | .env files excluded from repo | DONE | `.gitignore` covers `.env*`, none tracked in git |

### Track 1: Risk & Compliance ($16K)

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | Monitoring / safeguards / automated controls | DONE | CRE cron scans every 15min, AI Tribunal, auto-slash |
| 2 | Detect risk | DONE | 3-agent AI Tribunal: Risk Analyst + Provider Advocate + Judge |
| 3 | Verify system health | DONE | Uptime monitoring via mock API + ConfidentialHTTPClient |
| 4 | Trigger predefined responses | DONE | `recordBreach()` auto-slashes bond, `recordBreachWarning()` emits alert |
| 5 | CRE Workflow with blockchain + external API/AI | DONE | Groq Llama 3.3 via ConfidentialHTTPClient + mock uptime API |

**Eligible: YES** — this is our core use case

### Track 2: Best Use of World ID with CRE ($5K)

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | World ID integrated with CRE | DONE | `ProviderRegistrationRequested` on World Chain → CRE relay → Sepolia |
| 2 | Enable World ID on chain where not natively supported | DONE | World ID native on World Chain, CRE bridges to Sepolia |
| 3 | Proof verification on-chain or off-chain via CRE | DONE | On-chain: `WorldChainRegistry.register()` calls `verifyProof()`. Off-chain: `/api/verify-worldid` via v4 API. CRE relays result. |
| 4 | Two distinct World ID use cases | DONE | Provider registration + Arbitrator registration |
| 5 | IDKit v4 integration | DONE | `IDKitRequestWidget`, `deviceLegacy`, RP signatures in dashboard |
| 6 | World ID on-chain verification works on VNet | NEEDS TEST | State Sync just enabled — retry registration to confirm `NonExistentRoot` is fixed |

**Eligible: YES** — doing exactly what the track describes

### Track 3: Best CRE Usage in World Mini App ($5K)

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | Mini App runs in World App webview | DONE | `miniapp/` — MiniKit SDK, tunneled via Cloudflare |
| 2 | CRE integrated in Mini App architecture | DONE | Mini App triggers `ProviderRegistrationRequested` → CRE relay → compliance |
| 3 | Cross-chain or off-chain capability via CRE | DONE | World Chain → Sepolia relay via CRE |
| 4 | Mini App uses MiniKit SDK | DONE | `@worldcoin/minikit-js` in miniapp `package.json` |
| 5 | Mini App is functional and testable | NEEDS TEST | Haven't tested miniapp since IDKit/dashboard changes — verify it still works |
| 6 | Mini App demo-ready in World App | NEEDS TEST | Cloudflare tunnel active? `oathlayer-miniapp.robbyn.xyz` accessible? |

**Eligible: YES** — but Mini App is secondary to dashboard. Needs testing.

### Track 4: Tenderly Virtual TestNets ($5K)

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | Tenderly VNet Explorer link with deployed contracts | DONE | Two VNets with contracts deployed |
| 2 | Transaction history visible | NEEDS CHECK | Verify breach/registration/SLA txs visible in explorer |
| 3 | State Sync enabled | DONE | Just enabled on both VNets |
| 4 | Public Explorer enabled | NEEDS CHECK | Toggle was shown — verify links work without auth |
| 5 | GitHub repo with CRE workflows + contracts + deploy scripts | DONE | `workflow/`, `contracts/src/`, `contracts/script/` |
| 6 | CRE workflow execution demo | NEEDS TEST | Must show simulation running against Tenderly VNets |
| 7 | Documentation of architecture + integration | DONE | README has architecture diagram, Tenderly section, VNet details |
| 8 | Multi-chain VNets | DONE | Sepolia (11155111) + World Chain Sepolia (4801) |

**Eligible: YES** — strong submission with dual VNets + State Sync

### Track 5: Privacy ($16K) — BONUS TRACK

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | ConfidentialHTTPClient usage | DONE | Compliance KYC check + Groq AI calls via TEE |
| 2 | Credentials protected | DONE | `GROQ_API_KEY`, `COMPLIANCE_API_KEY` via CRE Secrets |
| 3 | Privacy-preserving workflow | PARTIAL | Provider PII never visible to DON nodes (compliance check). But mock API, not real KYC. |

**Eligible: MAYBE** — we use ConfidentialHTTPClient but privacy isn't our primary story. Worth submitting as secondary track if allowed.

---

## Action Items to Complete Submission

### BLOCKERS (must fix)

| # | Item | Priority | Est. Effort |
|---|------|----------|-------------|
| 1 | **Record 3-5 min demo video** | CRITICAL | 2-3 hours (prep + record + edit) |
| 2 | **Verify GitHub repo is PUBLIC** | CRITICAL | 1 minute |
| 3 | **Test CRE simulation runs clean** | CRITICAL | 15 min |
| 4 | **Test World ID registration with State Sync** | HIGH | 10 min |
| 5 | **Push all recent changes to GitHub** | CRITICAL | 5 min |

### SHOULD DO

| # | Item | Priority | Est. Effort |
|---|------|----------|-------------|
| 6 | Verify Tenderly Public Explorers work without auth | HIGH | 5 min |
| 7 | Verify Mini App still works (if submitting to Mini App track) | MEDIUM | 30 min |
| 8 | Run `forge test` — confirm all 22 tests pass | MEDIUM | 2 min |
| 9 | Clean up any debug `console.log` in dashboard | LOW | 10 min |
| 10 | Ensure Tenderly explorers show diverse tx types (register, SLA create, breach, warning) | MEDIUM | 20 min |

### NICE TO HAVE

| # | Item | Priority |
|---|------|----------|
| 11 | Add Privacy track to submission (ConfidentialHTTPClient angle) | LOW |
| 12 | Deploy dashboard publicly (Vercel) for judges to try live | LOW |
| 13 | Add CRE simulation recording/screenshot to README | LOW |
