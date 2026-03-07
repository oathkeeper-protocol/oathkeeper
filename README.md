# OathLayer

**Autonomous SLA Enforcement for Tokenized Real-World Assets**

Chainlink CRE monitors uptime, an AI Tribunal Council (3-agent adversarial system via Groq/Llama 3.3) predicts breaches before they happen, and penalties execute on-chain — all without human intervention. Provider identity gated by World ID.

**Hackathon:** CONVERGENCE (Chainlink) — Deadline: March 27, 2026
**Tracks:** Risk & Compliance ($16K) · Privacy ($16K) · CRE & AI ($17K)
**Bounties:** World ID + CRE ($5K) · World Mini App + CRE ($5K) · Tenderly VirtualTestNets ($5K)

---

## Architecture

```
World Chain (4801)          CRE Workflows              Sepolia (Tenderly VNet)
┌──────────────────┐   ┌─────────────────────┐   ┌──────────────────┐
│ WorldChainRegistry│   │ 1. Cron (15min)     │   │ SLAEnforcement   │
│                  │   │    → fetch uptime    │   │                  │
│ register() ──────┼──→│    → AI Tribunal     │──→│ recordBreach()   │
│  ProviderReg     │   │    → 3-agent council │   │ recordWarn()     │
│  Requested       │   │                     │   │                  │
│                  │   │ 2. ProviderRegReq   │   │ compliance gate  │
│                  │   │    → ConfidHTTP KYC ─┼──→│ setCompliance()  │
│                  │   │    → relay or reject │   │                  │
│                  │   │                     │   │ createSLA()      │
│                  │   │ 3. ClaimFiled react  │   │ (gated)          │
│                  │   │ 4. ArbitratorReg    │   │                  │
└──────────────────┘   └─────────────────────┘   └──────────────────┘

Dashboard (Next.js)          Mini App (World App)      Mock APIs (:3001)
┌──────────────────┐   ┌─────────────────────┐   ┌─────────────────┐
│ / — landing      │   │ Provider registration│   │ /provider/:addr │
│ /dashboard —     │   │ via World ID MiniKit │   │   /uptime       │
│   live SLAs,     │   │ File claims against  │   │ /compliance/    │
│   breach alerts, │   │   SLA providers      │   │   :addr         │
│   risk scores    │   │                     │   │                 │
│ /sla/create      │   │ Runs inside World   │   │                 │
│ /claims          │   │ App mobile browser   │   │                 │
│ /arbitrate       │   │                     │   │                 │
└──────────────────┘   └─────────────────────┘   └─────────────────┘
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
- **Voting:** Unanimous BREACH → slash bond. Majority → warning. Unanimous clear → skip.
- **On-chain output:** `[2-1 BREACH] Analyst: sustained degradation; Advocate: maintenance window; Judge: evidence sufficient`
- **Graceful degradation:** If an agent fails, remaining agents still vote
- **Historical context:** Provider Advocate receives 7-day uptime history for trend-based defense arguments
- 4-hour cooldown per SLA prevents warning spam

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
| `SLAEnforcement` | OathLayer VNet (Sepolia fork, 11155111) | `0x7c8C2E0D488d2785040171f4C087B0EA7637DE91` |
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
│       └── SLAEnforcement.t.sol    # 22 tests
├── workflow/               # Chainlink CRE workflow
│   ├── workflow.ts         # 4 handlers: cron, claim, provider reg, arbitrator reg
│   └── mock-api/
│       └── server.ts       # Mock uptime + compliance API
├── dashboard/              # Next.js + wagmi + RainbowKit
│   └── src/
│       ├── app/
│       │   ├── (landing)/page.tsx         # Landing page
│       │   ├── dashboard/page.tsx         # Live SLA dashboard
│       │   ├── provider/register/page.tsx # World ID + bond + compliance
│       │   ├── sla/create/page.tsx        # Create SLA (compliance-gated)
│       │   ├── sla/[id]/page.tsx          # SLA detail view
│       │   ├── claims/page.tsx            # File claims
│       │   └── arbitrate/page.tsx         # World ID gated arbitration
│       ├── components/
│       │   ├── AppShell.tsx               # Shared nav + layout
│       │   └── Providers.tsx              # wagmi + RainbowKit providers
│       └── lib/
│           ├── contract.ts                # ABI + address
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
# Tunnel: cloudflared tunnel run oathlayer-miniapp
# Access via World App: https://oathlayer-miniapp.robbyn.xyz
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
| 2 | `cd dashboard && npm run dev` | `:3000` |
| 3 | `cd miniapp && npm run dev` (optional) | `:3002` |
| 4 | CRE simulate commands (see above) | — |

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

---

## Demo Flow

1. **Landing** (`/`) — Product overview with live status badge
2. **Register provider** (`/provider/register`) — Connect wallet → World ID verify → bond ETH → compliance check fires automatically (CRE → ConfidentialHTTPClient → mock API) → APPROVED
3. **Create SLA** (`/sla/create`) — Compliance-gated form: set uptime threshold, penalty %, bond amount
4. **Dashboard** (`/dashboard`) — Live stats: active SLAs, total bonded, AI warnings, breaches
5. **AI Tribunal** — CRE cron fires → 3 agents deliberate (Risk Analyst → Provider Advocate → Judge) → BreachWarning with tally
6. **Trigger breach** — `POST /set-uptime {"uptime": 98.0}` → CRE detects → `recordBreach()` → bond slashed
7. **File claim** (`/claims` or Mini App) — Tenant submits maintenance request → triggers reactive CRE scan
8. **Arbitrate** (`/arbitrate`) — World ID gated: uphold or overturn breach
9. **Tenderly explorer** — All transactions publicly verifiable without a wallet

### Quick Test (No World ID Required)

```bash
# 1. Start mock API (terminal 1)
cd workflow/mock-api && npm run dev

# 2. Start dashboard (terminal 2)
cd dashboard && npm run dev

# 3. Fund wallet + register provider via Tenderly impersonation (terminal 3)
export TENDERLY_RPC=https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d
export SLA=0x7c8C2E0D488d2785040171f4C087B0EA7637DE91
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

## Known Limitations

- Cross-chain relay trust: CRE DON is trust anchor, World ID root not re-verified on Sepolia
- Arbitration reversal has no on-chain enforcement in V1
- ComplianceStatus has no expiry mechanism
- `scanSLAs` is O(N) with N separate consensus rounds — fine at demo scale
