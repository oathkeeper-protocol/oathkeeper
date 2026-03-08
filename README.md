# OathLayer

**Autonomous SLA Enforcement for Tokenized Real-World Assets**

OathLayer is a trustless SLA enforcement protocol where Chainlink CRE (Compute Runtime Engine) automates the entire compliance lifecycle — from monitoring provider uptime, to running a 3-agent adversarial AI Tribunal for breach determination, to executing on-chain penalties — without human intervention. Provider identity is Sybil-resistant via World ID, and disputed penalties can be challenged through a human arbitration layer that overrides AI decisions.

**In short:** CRE watches. AI deliberates. Smart contracts enforce. Humans arbitrate.

## Live Deployments

| Service | URL |
|---------|-----|
| **Dashboard** | [oathlayer-protocol.vercel.app](https://oathlayer-protocol.vercel.app) |
| **Mini App** | [oathlayer-miniapp.robbyn.xyz](https://oathlayer-miniapp.robbyn.xyz) (via World App) |
| **Mock API** | [oathlayer-api.robbyn.xyz](https://oathlayer-api.robbyn.xyz) |
| **Ponder Indexer** | [oathlayer-indexer.robbyn.xyz](https://oathlayer-indexer.robbyn.xyz) (GraphQL) |
| **Sepolia VNet Explorer** | [Tenderly Explorer](https://dashboard.tenderly.co/robbyn/project/testnet/5c780e4f-4df5-4a50-b221-2342cd4b713e) |
| **World Chain VNet Explorer** | [Tenderly Explorer](https://dashboard.tenderly.co/robbyn/project/testnet/d8f04de9-4cc1-4066-b8d3-31ed51ee1d85) |

> **Demo Video:** [Coming soon — YouTube link]

---

## Architecture

```
+----------------------------------------------------------------------+
|                    CHAINLINK CRE (Oracle Layer)                       |
|                                                                       |
|  +-------------+   +--------------+   +---------------------------+  |
|  | Cron 15min  |-->| Fetch        |-->| AI Tribunal Council       |  |
|  | (trigger)   |   | Uptime API   |   |                           |  |
|  +-------------+   +--------------+   |  +---------------------+  |  |
|                                        |  | 1. Risk Analyst     |  |  |
|  +-------------+   +--------------+   |  | 2. Provider Advocate|  |  |
|  | Log Trigger |-->| Confidential |   |  | 3. Enforce. Judge   |  |  |
|  | (events)    |   | HTTPClient   |   |  +---------------------+  |  |
|  +-------------+   | (TEE)        |   |  Groq / Llama 3.3 70B    |  |
|                     +--------------+   +-------------+-------------+  |
+------------------------------------------------------|-+--------------+
                                                       |
                                                       v
+----------------------------------------------------------------------+
|                            ON-CHAIN                                   |
|                                                                       |
|  +-------------------+            +-------------------------------+  |
|  | World Chain (4801) |            | Sepolia (Tenderly VNet)       |  |
|  |                    |            |                               |  |
|  | WorldChain         |   CRE     | SLAEnforcement                |  |
|  | Registry           |  relay    |  |- recordBreach()     <-- CRE|  |
|  |                    | --------> |  |- recordBreachWarning()     |  |
|  | register()         |            |  |- setCompliance()          |  |
|  | (World ID ZK)      |            |  |- createSLA() (gated)     |  |
|  |                    |            |  |- fileClaim()              |  |
|  |                    |            |  |- arbitrate() (World ID)   |  |
|  +-------------------+            +-------------------------------+  |
+----------------------------------------------------------------------+

+----------------------------------------------------------------------+
|                            OFF-CHAIN                                  |
|                                                                       |
|  Dashboard (:3000)       Mini App             Mock API (:3001)        |
|  +----------------+     +---------------+    +---------------+        |
|  | /dashboard     |     | World App     |    | /uptime       |        |
|  | /sla/[id]      |     | MiniKit       |    | /compliance   |        |
|  | /sla/create    |     | Provider      |    | /history      |        |
|  | /arbitrate     |     | registration  |    | /demo-*       |        |
|  +-------+--------+     +-------+-------+    +-------+-------+        |
|          |                      |                     |                |
|          +----------------------+---------------------+                |
|                     Ponder Indexer (:42069)                            |
|                     GraphQL <- on-chain events                        |
+----------------------------------------------------------------------+
```

## How Chainlink CRE is Used (5 Capabilities)

| Capability | Usage |
|---|---|
| **Cron trigger** | Scans all active SLAs every 15 minutes for compliance |
| **EVM Log trigger** | Reacts immediately to `ClaimFiled`, `ProviderRegistrationRequested`, `ArbitratorRegistrationRequested` events |
| **ConfidentialHTTPClient** | Encrypted KYC/compliance checks via TEE enclaves — provider PII never visible to DON nodes |
| **Secrets** | `GROQ_API_KEY`, `COMPLIANCE_API_KEY`, `UPTIME_API_KEY` via threshold-encrypted vault |
| **Cross-chain relay** | World Chain → Sepolia registration relay via trusted CRE forwarder pattern |

## How AI is Used — Tribunal Council

OathLayer uses a **3-agent adversarial AI tribunal** to prevent false positives from a single model:

| Agent | Role | Bias |
|-------|------|------|
| **Risk Analyst** | Evaluates raw metrics against SLA thresholds | Data-driven, neutral |
| **Provider Advocate** | Defends providers — finds mitigating factors, temporary dips | Biased toward protecting providers |
| **Enforcement Judge** | Weighs both arguments, casts tiebreaker vote (1.5x weight) | Balanced |

- **Model:** Groq (Llama 3.3 70B) via `ConfidentialHTTPClient` — API key protected in TEE
- **Flow:** Sequential deliberation: Analyst → Advocate (sees Analyst output) → Judge (sees both)
- **Voting:** Unanimous BREACH → slash bond (if uptime below threshold). Majority → warning. Unanimous clear → record with riskScore=0.
- **On-chain output:** `[2-1 BREACH] Analyst: sustained degradation; Advocate: maintenance window; Judge: evidence sufficient`
- **All verdicts on-chain** — Including CLEAR (riskScore=0). Full audit trail for transparent, decentralized AI governance. Production roadmap: move CLEAR/WARNING off-chain for gas optimization.
- **Breach gating:** Tribunal must vote BREACH **and** uptime must be below SLA threshold to slash. Prevents false positives.
- **Graceful degradation:** If an agent fails, remaining agents still vote
- **Historical context:** Provider Advocate receives 7-day uptime history for trend-based defense arguments
- **Cooldowns:** 24h breach cooldown + 4h warning cooldown per SLA (contract-enforced)

## How World ID is Used

- **Provider registration** — A provider is a **company/organization** (cloud infra, data center, hosting service) represented by a wallet. World ID verifies that a **unique human** controls the provider wallet — preventing one entity from registering multiple fake providers to game the system (Sybil resistance). It does not verify *who* the person is (CEO, CTO, ops), only that they are real and unique.
- **Arbitrator access** — only verified humans can uphold or overturn breaches
- **Cross-chain** — ZK proof verified on World Chain, relayed to Sepolia via CRE
- **Production note:** Provider wallets would typically be multisigs (Safe) with World ID on the initial signer. Hackathon uses single EOA.

## How Tenderly is Used

OathLayer runs on **two Tenderly Virtual TestNets** with State Sync enabled — keeping forked state current with live testnets:

| VNet | Forked From | Chain ID | RPC |
|------|-------------|----------|-----|
| **OathLayer VNet** | Sepolia | 11155111 | `https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d` |
| **OathLayer World Chain VNet** | World Chain Sepolia | 4801 | `https://virtual.worldchain-sepolia.eu.rpc.tenderly.co/d8f04de9-4cc1-4066-b8d3-31ed51ee1d85` |

- **State Sync** — Both VNets sync state with their upstream testnets, keeping World ID merkle roots and other protocol state current. This enables live World ID on-chain verification on the fork.
- **Public Explorer** — Judges can verify all transactions without connecting a wallet
- **Unlimited faucet** — Fund any wallet for testing via Tenderly dashboard
- **evm_increaseTime** — Manipulate `block.timestamp` for cooldown/timing tests
- **Impersonation** — `--unlocked` flag for testing CRE forwarder calls without private keys

---

## Deployed Contracts

| Contract | Chain | Address |
|---|---|---|
| `SLAEnforcement` | OathLayer VNet (Sepolia fork, 11155111) | `0x8286A8cfA5c8C1872097D9b43E01CbdEe934D319` |
| `WorldChainRegistry` | OathLayer World Chain VNet (World Chain Sepolia fork, 4801) | `0xe1349d2c44422b70c73bf767afb58ae1c59cd1fd` |

**Tenderly Explorers:**
- [OathLayer VNet (Sepolia)](https://dashboard.tenderly.co/robbyn/project/testnet/5c780e4f-4df5-4a50-b221-2342cd4b713e) — SLAEnforcement transactions
- [OathLayer World Chain VNet](https://dashboard.tenderly.co/robbyn/project/testnet/d8f04de9-4cc1-4066-b8d3-31ed51ee1d85) — WorldChainRegistry transactions

---

## Project Structure

```
oathlayer/
├── contracts/              # Foundry smart contracts
│   ├── src/
│   │   ├── SLAEnforcement.sol      # Main contract (Sepolia VNet)
│   │   └── WorldChainRegistry.sol  # Registration proxy (World Chain)
│   ├── script/
│   │   ├── DeploySLA.s.sol
│   │   └── DeployWorldChain.s.sol
│   └── test/
│       └── SLAEnforcement.t.sol    # 27 tests (incl. breach cooldown)
├── workflow/               # Chainlink CRE workflow
│   ├── workflow.ts         # 4 handlers: cron, claim, provider reg, arbitrator reg
│   └── mock-api/
│       └── server.ts       # Mock uptime + compliance API + AI Tribunal + demo controls
├── indexer/                # Ponder event indexer → GraphQL API
│   ├── ponder.schema.ts    # Schema: sla, breach, breach_warning, claim, etc.
│   ├── src/index.ts        # Event handlers (8 events)
│   └── src/api/index.ts    # Hono + GraphQL middleware
├── dashboard/              # Next.js + wagmi + RainbowKit
│   └── src/
│       ├── app/
│       │   ├── (landing)/page.tsx         # Landing page
│       │   ├── dashboard/page.tsx         # Live SLA dashboard (5+5+5 preview)
│       │   ├── dashboard/slas/page.tsx    # All SLA agreements
│       │   ├── dashboard/predictions/    # All AI Tribunal verdicts
│       │   ├── dashboard/breaches/       # All breaches with tenant
│       │   ├── provider/register/page.tsx # World ID + bond + compliance
│       │   ├── sla/create/page.tsx        # Create SLA (compliance-gated)
│       │   ├── sla/[id]/page.tsx          # SLA detail + tribunal history
│       │   └── arbitrate/page.tsx         # World ID gated arbitration
│       ├── components/
│       │   ├── AppShell.tsx               # Shared nav + demo controls
│       │   ├── TribunalVerdicts.tsx       # Agent verdict breakdown (A/D/J)
│       │   └── Providers.tsx              # wagmi + RainbowKit providers
│       └── lib/
│           ├── contract.ts                # ABI + address
│           ├── ponder.ts                  # Ponder GraphQL client + typed queries
│           └── wagmi.ts                   # Chain config (Tenderly VNet)
└── miniapp/                # World Mini App (mobile)
    └── src/app/page.tsx    # Provider registration + claims via MiniKit
```

---

## Prerequisites

| Tool | Install |
|------|---------|
| **Node.js** ≥ 18 | [nodejs.org](https://nodejs.org) |
| **Bun** | `curl -fsSL https://bun.sh/install \| bash` |
| **CRE CLI** | `curl -sSL https://cre.chain.link/install.sh \| bash` |
| **Foundry** | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |

After installing CRE CLI, run `cre login` to authenticate (requires free Chainlink account).

## Setup

### 1. Contracts

```bash
cd contracts
forge install
forge build
forge test  # 22 tests
```

Deploy:
```bash
forge script script/DeploySLA.s.sol --rpc-url $TENDERLY_RPC_URL --broadcast
forge script script/DeployWorldChain.s.sol --rpc-url $WORLD_CHAIN_RPC --broadcast
```

### 2. Mock API

Start this first — the CRE workflow and dashboard depend on it.

```bash
cd workflow/mock-api
npm install
npm run dev  # runs on :3001
```

### 3. Dashboard

```bash
cd dashboard
npm install
cp .env.local.example .env.local  # set NEXT_PUBLIC_SLA_CONTRACT_ADDRESS, RPC_URL, etc.
npm run dev  # runs on :3000
```

### 4. Mini App (optional — requires World App on mobile)

```bash
cd miniapp
npm install
npm run dev  # runs on :3002
# Production: https://oathlayer-miniapp.robbyn.xyz (deployed on VPS)
# Access via World App: tap explore → enter URL above
```

### 5. CRE Workflow

```bash
cd workflow
npm install
bun run node_modules/@chainlink/cre-sdk-javy-plugin/bin/setup.ts  # first time only — downloads Javy WASM compiler
```

**Run simulation** (from project root):
```bash
# Export secrets (or add to root .env)
export UPTIME_API_KEY="demo-secret"
export COMPLIANCE_API_KEY="demo-secret"
export GROQ_API_KEY="your-groq-api-key"

# Dry run — no on-chain writes
cre workflow simulate ./workflow --target local-simulation --non-interactive --trigger-index 0

# Broadcast — writes breach/warning txs to chain
cre workflow simulate ./workflow --target local-simulation --non-interactive --trigger-index 0 --broadcast
```

**Trigger index reference:**

| Index | Trigger | Description |
|-------|---------|-------------|
| 0 | Cron | Scan all SLAs + AI Tribunal (main flow) |
| 1 | ClaimFiled log | React to tenant claim on Sepolia |

> **Note:** World Chain log triggers (provider/arbitrator registration) are disabled in `config.local.json` for local simulation because the CRE simulator doesn't support World Chain's chain selector. They work in deployed workflows.

### Configuration Files

| File | Purpose |
|------|---------|
| `project.yaml` | RPC endpoints (Tenderly VNet Sepolia + World Chain) |
| `workflow/workflow.yaml` | Workflow name, entry point, config/secrets paths, target settings |
| `workflow/config.local.json` | Runtime config: contract addresses, API URLs, chain selectors |
| `secrets.yaml` | Maps secret names → env var names (values loaded from `.env` or exported vars) |
| `.env` (root) | Secret values for simulation: `UPTIME_API_KEY`, `COMPLIANCE_API_KEY`, `GROQ_API_KEY`, `CRE_ETH_PRIVATE_KEY` |

### Running All Services Locally

| Terminal | Command | Port |
|----------|---------|------|
| 1 | `cd workflow/mock-api && npm run dev` | `:3001` |
| 2 | `cd indexer && npm run dev` | `:42069` |
| 3 | `cd dashboard && npm run dev` | `:3000` |
| 4 | `cd miniapp && npm run dev` (optional) | `:3002` |
| 5 | CRE simulate commands (see above) | — |

---

## Smart Contract — SLAEnforcement.sol

### Functions

| Function | Access | Description |
|---|---|---|
| `registerProvider(root, nullifierHash, proof)` | Public (payable) | Bond ETH + World ID ZK proof |
| `registerProviderRelayed(user, nullifierHash)` | CRE only | Cross-chain relay from World Chain |
| `setComplianceStatus(provider, status)` | CRE only | Set APPROVED/REJECTED (rejection is permanent) |
| `createSLA(tenant, responseTimeHrs, minUptimeBps, penaltyBps)` | Compliance-gated | Create SLA with bonded collateral |
| `recordBreach(slaId, uptimeBps)` | CRE only | Slash bond, penaltyBps read from SLA storage |
| `recordBreachWarning(slaId, riskScore, prediction)` | CRE only | AI prediction event (4h cooldown) |
| `fileClaim(slaId, description)` | Tenant only | Submit maintenance request |
| `arbitrate(slaId, upheld)` | Verified arbitrator | Override breach decision |

### Events

| Event | Trigger |
|---|---|
| `SLACreated` | New SLA agreement |
| `ClaimFiled` | Tenant files claim → triggers reactive CRE scan |
| `SLABreached` | CRE detects uptime below threshold |
| `BreachWarning` | AI Tribunal council confidence > threshold |
| `ComplianceCheckPassed` | Provider approved via ConfidentialHTTPClient |
| `ComplianceCheckFailed` | Provider rejected |

---

## World ID + CRE: Cross-Chain Identity Relay

World ID proofs are generated on World Chain via MiniKit. Because Sepolia does not natively support World ID, OathLayer uses Chainlink CRE as the trust relay: the CRE DON listens for the `ProviderRegistrationRequested` event on World Chain, verifies the event context via ConfidentialHTTPClient, and calls `setComplianceStatus()` on Sepolia — bringing Sybil-resistant identity to a chain where World ID does not natively exist.

This pattern demonstrates CRE as a general-purpose cross-chain bridge for identity proofs, not just for token transfers.

---

## Chainlink Files

| File | Chainlink Usage |
|---|---|
| [`workflow/workflow.ts`](./workflow/workflow.ts) | CRE SDK — cron trigger, EVM log triggers, ConfidentialHTTPClient, Secrets, AI Tribunal (Groq/Llama 3.3) |
| [`contracts/src/SLAEnforcement.sol`](./contracts/src/SLAEnforcement.sol) | `AggregatorV3Interface` (ETH/USD price feed), `onlyCREForwarder` access control |
| [`contracts/src/WorldChainRegistry.sol`](./contracts/src/WorldChainRegistry.sol) | Cross-chain registration proxy — emits events consumed by CRE EVM log trigger |
| [`workflow/workflow.yaml`](./workflow/workflow.yaml) | CRE workflow configuration, targets, secrets |
| [`workflow/config.local.json`](./workflow/config.local.json) | Runtime config: contract addresses, chain selectors, API endpoints |
| [`project.yaml`](./project.yaml) | CRE project config with RPC endpoints |
| [`secrets.yaml`](./secrets.yaml) | CRE secrets mapping (GROQ_API_KEY, UPTIME_API_KEY, COMPLIANCE_API_KEY) |

---

## Demo Flow

1. **Landing** (`/`) — Product overview with live status badge
2. **Register provider** (`/provider/register`) — Connect wallet → World ID verify → bond ETH → compliance check fires automatically (CRE → ConfidentialHTTPClient → mock API) → APPROVED
3. **Create SLA** (`/sla/create`) — Compliance-gated form: set uptime threshold, penalty %, bond amount
4. **Dashboard** (`/dashboard`) — Live stats: active SLAs (5), AI Tribunal verdicts (5), recent breaches (5) — each with "View all →"
5. **Demo Controls** (bottom-right FAB) — Set SLA target + uptime %, trigger AI Tribunal assessment:
   - **Simulate Breach** — 3-agent tribunal deliberates → breach if unanimous + below threshold → bond slashed
   - **Warning Only** — tribunal runs but no slash
   - **+25h** — fast-forward VNet time past cooldowns
   - **Reset** — restore healthy uptime + clear cooldowns
6. **AI Tribunal history** (`/dashboard/predictions`) — Per-agent verdict breakdown (Risk Analyst / Provider Advocate / Enforcement Judge) with vote tallies
7. **SLA detail** (`/sla/[id]`) — Agreement details, breach history, tribunal verdicts, claims
8. **Arbitrate** (`/arbitrate`) — World ID gated: uphold or overturn breach decisions
9. **Tenderly explorer** — All transactions publicly verifiable without a wallet

### Quick Test (No World ID Required)

```bash
# 1. Start mock API (terminal 1)
cd workflow/mock-api && npm run dev

# 2. Start dashboard (terminal 2)
cd dashboard && npm run dev

# 3. Fund wallet + register provider via Tenderly impersonation (terminal 3)
export TENDERLY_RPC=https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d
export SLA=0x8286A8cfA5c8C1872097D9b43E01CbdEe934D319
export CRE_FWD=0x4B2fF22FFeb81292F8511a8eB370C4F7Aa656d9B

cast rpc tenderly_setBalance <YOUR_ADDRESS> 0x56BC75E2D63100000 --rpc-url $TENDERLY_RPC

cast send $SLA "registerProviderRelayed(address,uint256)" \
  <YOUR_ADDRESS> 12345 --rpc-url $TENDERLY_RPC --from $CRE_FWD --unlocked

cast send $SLA "setComplianceStatus(address,uint8)" \
  <YOUR_ADDRESS> 1 --rpc-url $TENDERLY_RPC --from $CRE_FWD --unlocked

# 4. Create SLA on dashboard → /sla/create

# 5. Run CRE scan (healthy state — all SLAs should be CLEAR)
export UPTIME_API_KEY=demo-secret COMPLIANCE_API_KEY=demo-secret GROQ_API_KEY=your-key
cre workflow simulate ./workflow --target local-simulation --non-interactive --trigger-index 0

# 6. Force breach — drop uptime to 90%
curl -X POST http://localhost:3001/set-uptime \
  -H "x-admin-token: demo-secret" \
  -H "Content-Type: application/json" \
  -d '{"uptime": 90.0}'

# 7. Run CRE scan again — tribunal should vote BREACH, bond gets slashed
cre workflow simulate ./workflow --target local-simulation --non-interactive --trigger-index 0 --broadcast

# 8. Reset uptime
curl -X POST http://localhost:3001/reset -H "x-admin-token: demo-secret"
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | Foundry (Solidity ^0.8.20) |
| Automation | Chainlink CRE SDK (TypeScript) |
| AI | Groq / Llama 3.3 70B — 3-agent Tribunal Council (TEE-encrypted via ConfidentialHTTPClient) |
| Price Feeds | Chainlink AggregatorV3Interface (ETH/USD) |
| Privacy | CRE ConfidentialHTTPClient (TEE enclaves) |
| Identity | World ID / IDKit v4 + MiniKit |
| Indexer | Ponder v0.12 + Hono (GraphQL API for dashboard) |
| Testing | Tenderly Virtual TestNets (State Sync enabled) |
| Frontend | Next.js + wagmi + viem + RainbowKit |
| Mobile | World Mini App SDK (MiniKit) |

---

## Testing Notes

### World ID — Orb vs Device Level

In production, OathLayer uses **Orb-level** World ID verification. For hackathon testing, registration uses **Device level** (phone signup, no Orb required). The ZK proof structure and on-chain relay are identical — only the trust tier changes.

### Mini App Testing

The Mini App requires **World App** on mobile:
1. Install [World App](https://worldcoin.org/download) on iOS or Android
2. Create an account (no Orb needed for Device level)
3. Tap explore → enter `https://oathlayer-miniapp.robbyn.xyz`
4. Register as provider → verify with World ID → done

---

## How It's Built

- **Smart Contracts** — Solidity ^0.8.20, Foundry for testing/deployment. `SLAEnforcement` on Sepolia handles SLA creation, bond management, breach recording, and claims. `WorldChainRegistry` on World Chain Sepolia handles World ID proof verification and emits events for CRE relay.
- **CRE Workflow** — TypeScript with Chainlink CRE SDK. Cron trigger scans SLAs every 15 minutes. EVM Log triggers react to claims, provider registrations, and arbitrator registrations. `ConfidentialHTTPClient` encrypts compliance checks and AI inference calls in TEE enclaves.
- **AI Tribunal** — 3-agent sequential deliberation using Groq (Llama 3.3 70B). Risk Analyst evaluates metrics, Provider Advocate defends with historical context, Enforcement Judge weighs both arguments with 1.5x vote weight. All agents called via `ConfidentialHTTPClient` — API keys never leave the TEE.
- **World ID** — IDKit v4 on dashboard, MiniKit in World Mini App. ZK proofs verified on-chain via `WorldChainRegistry`, relayed cross-chain to Sepolia by CRE. Two use cases: provider registration (Sybil-resistant identity) and arbitrator access (human override of AI decisions).
- **Tenderly** — Two Virtual TestNets with State Sync enabled: Sepolia fork for enforcement, World Chain Sepolia fork for identity. Public explorers for judge verification. `evm_increaseTime` for cooldown testing.
- **Frontend** — Next.js 14, wagmi v2, viem, RainbowKit. Ponder v0.12 indexes all contract events into a GraphQL API. Dashboard polls Ponder every 5 seconds for real-time updates.
- **Deployment** — Dashboard on Vercel. Mock API, Mini App, and Ponder Indexer on VPS via Docker + Traefik reverse proxy with auto-SSL.

## Challenges

- **CRE is pre-release** — Documentation is sparse and the SDK API changed during development. Required reading source code and experimenting with the simulator to understand trigger behavior, consensus modes, and secret management.
- **Cross-chain World ID** — World ID is native to World Chain but SLA enforcement lives on Sepolia. Built a CRE-based cross-chain identity relay pattern. Had to match exact `signal` and `groupId` parameters between MiniKit/IDKit and on-chain verification — mismatches produced opaque `0xddae3b71` (InvalidProof) reverts.
- **AI in TEE constraints** — `ConfidentialHTTPClient` has response size limits and no streaming support. Required careful prompt engineering to keep 3-agent tribunal responses under 200 characters while preserving useful reasoning.
- **Tenderly State Sync** — World ID proof verification requires current merkle roots from the World ID contract. State Sync on Tenderly VNets was essential to keep the fork's World ID roots current with the live testnet.
- **Multi-chain coordination** — A single CRE workflow manages events from two different chains (World Chain + Sepolia) and writes back to Sepolia. The CRE simulator doesn't support World Chain's chain selector, requiring config-level disabling for local development.

## Prize Tracks

### Risk & Compliance
OathLayer automates SLA compliance monitoring for tokenized RWA infrastructure. CRE monitors uptime every 15 minutes, a 3-agent AI Tribunal Council deliberates adversarially to prevent false positives, and breached providers get bonds slashed automatically.

### Privacy (ConfidentialHTTPClient)
Provider compliance checks and AI Tribunal inference run inside TEE enclaves via `ConfidentialHTTPClient`. API keys (`GROQ_API_KEY`, `COMPLIANCE_API_KEY`) are threshold-encrypted in CRE's secret vault and never visible to DON nodes. Provider PII from compliance checks never leaves the enclave.

### Best Use of World ID with CRE
World ID is native to World Chain but SLA enforcement lives on Sepolia. OathLayer uses CRE as a cross-chain identity bridge — providers verify via World ID on World Chain, CRE's EVM Log trigger picks up the event, runs a ConfidentialHTTPClient compliance check, and relays the verified identity to Sepolia. This pattern generalizes to any chain.

### Best CRE Usage in World Mini App
The Mini App lets providers register and tenants file claims directly from World App. Registration triggers a CRE workflow: World ID proof verified on World Chain, ConfidentialHTTPClient runs compliance check, and identity is relayed cross-chain to Sepolia — all from a single tap.

### Build CRE Workflows with Tenderly Virtual TestNets
Two VNets with State Sync enabled — Sepolia fork for enforcement and World Chain Sepolia fork for identity. Multi-chain CRE workflow orchestrates cross-chain identity relay, AI-powered risk assessment, and automated bond slashing, all testable with Tenderly's public explorer.

---

## Known Limitations

- Cross-chain relay trust: CRE DON is trust anchor, World ID root not re-verified on Sepolia
- Arbitration reversal has no on-chain enforcement in V1
- ComplianceStatus has no expiry mechanism
- `scanSLAs` is O(N) with N separate consensus rounds — fine at demo scale
