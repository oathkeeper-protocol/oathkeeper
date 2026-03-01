# OathLayer

Privacy-first, AI-powered SLA enforcement for tokenized real-world assets. Chainlink CRE automates compliance monitoring, Gemini Flash predicts breaches before they happen, and World ID ensures only verified humans participate.

**Hackathon:** CONVERGENCE (Chainlink) — Deadline: March 8, 2026
**Tracks:** Risk & Compliance ($16K) · Privacy ($16K) · CRE & AI ($17K)
**Bounties:** World ID + CRE ($5K) · World Mini App + CRE ($5K) · Tenderly VirtualTestNets ($5K)

---

## Architecture

```
World Chain (4801)          CRE Workflows              Sepolia (Tenderly VNet)
┌──────────────────┐   ┌─────────────────────┐   ┌──────────────────┐
│ WorldChainRegistry│   │ 1. Cron (15min)     │   │ SLAEnforcement   │
│                  │   │    → fetch uptime    │   │                  │
│ register() ──────┼──→│    → Gemini Flash    │──→│ recordBreach()   │
│  ProviderReg     │   │    → breach predict  │   │ recordWarn()     │
│  Requested       │   │                     │   │                  │
│                  │   │ 2. ProviderRegReq   │   │ compliance gate  │
│                  │   │    → ConfidHTTP KYC ─┼──→│ setCompliance()  │
│                  │   │    → relay or reject │   │                  │
│                  │   │                     │   │ createSLA()      │
│                  │   │ 3. ClaimFiled react  │   │ (gated)          │
│                  │   │ 4. ArbitratorReg    │   │                  │
└──────────────────┘   └─────────────────────┘   └──────────────────┘

Dashboard (Next.js)          Mock APIs (:3001)
┌──────────────────┐   ┌─────────────────────┐
│ / — live SLAs    │   │ /provider/:addr/    │
│   (multicall),   │   │   uptime            │
│   breach alerts  │   │ /compliance/:addr   │
│   (getLogs),     │   │   → mock KYC check  │
│   risk scores    │   │                     │
│ /provider/reg    │   │                     │
└──────────────────┘   └─────────────────────┘
```

## How Chainlink CRE is Used (5 Capabilities)

| Capability | Usage |
|---|---|
| **Cron trigger** | Scans all active SLAs every 15 minutes for compliance |
| **EVM Log trigger** | Reacts immediately to `ClaimFiled`, `ProviderRegistrationRequested`, `ArbitratorRegistrationRequested` events |
| **ConfidentialHTTPClient** | Encrypted KYC/compliance checks via TEE enclaves — provider PII never visible to DON nodes |
| **Secrets** | `GEMINI_API_KEY`, `COMPLIANCE_API_KEY`, `UPTIME_API_KEY` via threshold-encrypted vault |
| **Cross-chain relay** | World Chain → Sepolia registration relay via trusted CRE forwarder pattern |

## How AI is Used

- **Gemini 2.0 Flash** analyzes uptime trends across all active SLAs in a single batched prompt
- Returns structured `{ riskScore, prediction }` via `responseSchema` (deterministic JSON mode)
- API key protected via `ConfidentialHTTPClient` — DON nodes cannot see the key
- `riskScore > 70` triggers on-chain `BreachWarning` event with prediction text
- 4-hour cooldown per SLA prevents warning spam

## How World ID is Used

- **Provider registration** — Orb-level verification prevents Sybil SLA providers
- **Arbitrator access** — only verified humans can uphold or overturn breaches
- **Cross-chain** — proof verified on World Chain, relayed to Sepolia via CRE

## How Tenderly is Used

- **Virtual TestNet** — Sepolia fork with unlimited faucet
- **Public explorer** — judges verify all transactions without a wallet
- **evm_increaseTime** — manipulate block.timestamp for cooldown testing

---

## Project Structure

```
oathlayer/
├── contracts/              # Foundry smart contracts
│   ├── src/
│   │   ├── SLAEnforcement.sol      # Main contract (Sepolia)
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
├── dashboard/              # Next.js 14 + wagmi + RainbowKit
│   └── src/app/
│       ├── page.tsx                    # Live SLA dashboard
│       ├── provider/register/page.tsx  # World ID + bond + compliance polling
│       ├── sla/create/page.tsx         # Create SLA (compliance-gated)
│       ├── claims/page.tsx             # File claims
│       └── arbitrate/page.tsx          # World ID gated arbitration
└── miniapp/                # World Mini App (mobile)
```

---

## Setup

### Contracts

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

### CRE Workflow

```bash
cd workflow
npm install

# Create secrets
cre secrets create UPTIME_API_KEY --value "demo-key"
cre secrets create COMPLIANCE_API_KEY --value "your-key"
cre secrets create GEMINI_API_KEY --value "your-gemini-key"

# Simulate
cre workflow simulate --verbose --broadcast
```

### Mock API

```bash
cd workflow/mock-api
npm install
npm run dev  # runs on :3001

# Trigger breach
curl -X POST http://localhost:3001/set-uptime \
  -H "Content-Type: application/json" \
  -H "x-admin-token: demo-secret" \
  -d '{"uptime": 98.0}'

# Check compliance
curl http://localhost:3001/compliance/0x742d35Cc6634C0532925a3b844Bc9e7595f2bd9
```

### Dashboard

```bash
cd dashboard
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_SLA_CONTRACT_ADDRESS, NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_WLD_APP_ID
npm run dev  # runs on :3000
```

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
| `BreachWarning` | Gemini predicts riskScore > 70 |
| `ComplianceCheckPassed` | Provider approved via ConfidentialHTTPClient |
| `ComplianceCheckFailed` | Provider rejected |

---

## Demo Script

1. **Register provider** via World ID on dashboard → bond 1 ETH
2. **Compliance check** fires automatically (CRE → ConfidentialHTTPClient → mock API) → APPROVED
3. **Create SLA** (now compliance-gated) — 99.5% uptime, 5% penalty
4. **AI prediction** — CRE cron fires, Gemini analyzes uptime → BreachWarning if risk > 70
5. **Trigger breach** — `POST /set-uptime {"uptime": 98.0}` → CRE detects → `recordBreach()` → bond slashed
6. **Dashboard updates** — live stats, breach warnings with risk badges, breach history
7. **Rejection flow** — set `DEMO_REJECT_ADDRESS` → show compliance rejection
8. **Tenderly explorer** — all transactions publicly verifiable

---

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | Foundry (Solidity ^0.8.20) |
| Automation | Chainlink CRE SDK (TypeScript) |
| AI | Gemini 2.0 Flash (structured output, TEE-encrypted) |
| Price Feeds | Chainlink AggregatorV3Interface (ETH/USD) |
| Privacy | CRE ConfidentialHTTPClient (TEE enclaves) |
| Identity | World ID / IDKit v1 |
| Testing | Tenderly Virtual TestNets |
| Frontend | Next.js 14 + wagmi + viem + RainbowKit |
| Mobile | World Mini App SDK (MiniKit) |
| Charts | Recharts |

## Known Limitations

- Cross-chain relay trust model: CRE DON is trust anchor, World ID root not re-verified on Sepolia
- Arbitration reversal has no on-chain enforcement in V1
- ComplianceStatus has no expiry mechanism
- `consensusMedianAggregation` on Gemini riskScore not yet tested in production CRE
