# OathLayer

Privacy-first, AI-powered SLA enforcement for tokenized real-world assets. Chainlink CRE automates compliance monitoring, AI Tribunal Council (3-agent Groq/Llama 3.3) predicts breaches, World ID gates provider identity.

## Architecture

```
World Chain (4801)          CRE Workflows              Sepolia (Tenderly VNet)
┌──────────────────┐   ┌─────────────────────┐   ┌──────────────────┐
│ WorldChainRegistry│   │ Cron (15min)        │   │ SLAEnforcement   │
│   register() ────┼──→│   → uptime fetch    │   │   recordBreach() │
│   ProviderReg    │   │   → AI Tribunal     │──→│   recordWarn()   │
│   Requested      │   │   → 3-agent council │   │   compliance gate│
│                  │   │ ProviderRegReq ─────┼──→│   setCompliance  │
│                  │   │   → ConfidHTTP KYC  │   │   createSLA()    │
└──────────────────┘   └─────────────────────┘   └──────────────────┘
```

## What CRE Actually Does

CRE is the **full oracle + automation pipeline** — not just a trigger:

1. **Monitors** — Cron reads all SLAs, fetches off-chain uptime data per provider
2. **Analyzes** — Runs 3-agent AI Tribunal (Risk Analyst → Provider Advocate → Judge) via Groq in TEE
3. **Enforces** — Writes `recordBreachWarning()` / `recordBreach()` to contract based on verdict
4. **Relays** — Cross-chain provider registration: World Chain event → compliance check → Sepolia write

`onlyCREForwarder` modifier gates all enforcement functions. For testnet, `creForwarder` = deployer wallet (`0x77C037fb...`). In production, this would be the DON's assigned forwarder address.

Mock API's `/demo-breach` replicates the same logic for demo convenience (bypasses CRE DON).

## Modules

| Module | Path | Stack |
|--------|------|-------|
| Contracts | `contracts/` | Foundry, Solidity ^0.8.20 |
| CRE Workflow | `workflow/` | Chainlink CRE SDK, TypeScript |
| Mock API | `workflow/mock-api/` | Express, TypeScript |
| Indexer | `indexer/` | Ponder v0.12, Hono, GraphQL |
| Dashboard | `dashboard/` | Next.js 14, wagmi, viem, RainbowKit |
| Mini App | `miniapp/` | Next.js, World Mini App SDK |

## Key Contracts

- `SLAEnforcement.sol` — Main contract on Sepolia (Tenderly VNet)
- `WorldChainRegistry.sol` — Registration proxy on World Chain Sepolia (4801)

## Deployment

- **SLAEnforcement**: OathLayer VNet (Sepolia fork, State Sync ON) — `0xcb08eaa01e2ab1adbb1b567d7c7e837e4a4661be`
- **WorldChainRegistry**: OathLayer World Chain VNet (World Chain Sepolia fork, State Sync ON) — `0xe1349d2c44422b70c73bf767afb58ae1c59cd1fd`
- **Sepolia VNet RPC**: `https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d`
- **World Chain VNet RPC**: `https://virtual.worldchain-sepolia.eu.rpc.tenderly.co/d8f04de9-4cc1-4066-b8d3-31ed51ee1d85`

## Commands

```bash
# Contracts
cd contracts && forge build && forge test

# Workflow
cd workflow && npm install && cre workflow simulate --verbose

# Mock API
cd workflow/mock-api && npm run dev

# Indexer
cd indexer && npm install && npm run dev  # GraphQL at :42069/graphql

# Dashboard
cd dashboard && npm install && npm run dev
```

## Code Conventions

- Solidity: Foundry style, `require()` strings for errors (not custom errors — hackathon simplicity)
- TypeScript: CRE SDK patterns — `runtime.runInNodeMode()` for consensus, `.result()` for sync unwrap
- Indexer: Ponder event handlers in `src/index.ts`, schema in `ponder.schema.ts`, GraphQL API in `src/api/index.ts`
- Dashboard: data from Ponder GraphQL via `hooks/usePonderData.ts` (5s poll). `lib/ponder.ts` has typed queries. `getCollateralRatio` still uses wagmi.
- Ponder returns strings for bigint fields — wrap with `BigInt()` for `formatEther()`
- AI Tribunal: ALL verdicts on-chain (CLEAR=riskScore 0, WARNING, BREACH) — "decentralized AI" full audit trail. Production: move CLEAR/WARNING off-chain for gas optimization.
- Breach enforcement: tribunal must vote BREACH **and** uptime < SLA threshold. Breach cooldown: 24h, warning cooldown: 4h.
- Tests: Foundry `vm.prank`/`vm.expectRevert`/`vm.warp` patterns
- Access control: `onlyCREForwarder` modifier for all CRE-callable functions
- Compliance: `ComplianceStatus` enum (NONE=0, APPROVED=1, REJECTED=2), rejection is permanent

## Dashboard Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/dashboard` | Live SLAs (5), AI Tribunal (5), Recent Breaches (5) — each with "View all →" |
| `/dashboard/slas` | All SLA agreements |
| `/dashboard/predictions` | All AI Tribunal verdicts with per-agent breakdown |
| `/dashboard/breaches` | All breaches with tenant column |
| `/provider/register` | World ID verify + bond ETH + compliance polling |
| `/sla/create` | Create SLA (compliance-gated) |
| `/sla/[id]` | SLA detail: agreement, breaches, tribunal history, claims |
| `/arbitrate` | World ID gated arbitration panel |

## Environment Variables

### Indexer (.env.local)
- `PONDER_RPC_URL` — Tenderly VNet RPC
- `SLA_CONTRACT_ADDRESS` — SLAEnforcement address
- `DEPLOYMENT_BLOCK` — Contract deploy block

### Dashboard (.env.local)
- `NEXT_PUBLIC_SLA_CONTRACT_ADDRESS` — SLAEnforcement address
- `NEXT_PUBLIC_RPC_URL` — Tenderly VNet RPC
- `NEXT_PUBLIC_WLD_APP_ID` — World ID app ID
- `NEXT_PUBLIC_DEPLOY_BLOCK` — Contract deploy block
- `NEXT_PUBLIC_PONDER_URL` — Ponder GraphQL endpoint (default: `http://localhost:42069`)

### Mock API
- `DEMO_REJECT_ADDRESS` — Address to reject in compliance check (demo)
- `MOCK_API_ADMIN_SECRET` — Auth token for control endpoints (default: demo-secret)

### CRE Secrets (via `cre secrets create`)
- `UPTIME_API_KEY` — Mock API auth
- `COMPLIANCE_API_KEY` — Compliance API auth (used via ConfidentialHTTPClient)
- `GROQ_API_KEY` — Groq API key for Llama 3.3 70B (AI Tribunal, used via ConfidentialHTTPClient)
