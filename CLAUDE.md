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

## Modules

| Module | Path | Stack |
|--------|------|-------|
| Contracts | `contracts/` | Foundry, Solidity ^0.8.20 |
| CRE Workflow | `workflow/` | Chainlink CRE SDK, TypeScript |
| Mock API | `workflow/mock-api/` | Express, TypeScript |
| Dashboard | `dashboard/` | Next.js 14, wagmi, viem, RainbowKit |
| Mini App | `miniapp/` | Next.js, World Mini App SDK |

## Key Contracts

- `SLAEnforcement.sol` — Main contract on Sepolia (Tenderly VNet)
- `WorldChainRegistry.sol` — Registration proxy on World Chain Sepolia (4801)

## Deployment

- **SLAEnforcement**: OathLayer VNet (Sepolia fork, State Sync ON) — `0x7c8C2E0D488d2785040171f4C087B0EA7637DE91`
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

# Dashboard
cd dashboard && npm install && npm run dev
```

## Code Conventions

- Solidity: Foundry style, `require()` strings for errors (not custom errors — hackathon simplicity)
- TypeScript: CRE SDK patterns — `runtime.runInNodeMode()` for consensus, `.result()` for sync unwrap
- Dashboard: wagmi hooks, `useReadContracts` multicall for batch reads, `getLogs` on mount for history + `useWatchContractEvent` (5s poll) for real-time (no duplicate 30s interval)
- Dashboard events: deduplicated by blockNumber/txHash in `useWatchContractEvent` handlers
- Production note: `getLogs` works at demo scale but would be replaced by a subgraph (The Graph) or indexer (Ponder/Envio) for production — avoids block scanning, adds caching, enables complex queries
- Tests: Foundry `vm.prank`/`vm.expectRevert`/`vm.warp` patterns
- Access control: `onlyCREForwarder` modifier for all CRE-callable functions
- Compliance: `ComplianceStatus` enum (NONE=0, APPROVED=1, REJECTED=2), rejection is permanent

## Environment Variables

### Dashboard (.env.local)
- `NEXT_PUBLIC_SLA_CONTRACT_ADDRESS` — SLAEnforcement address
- `NEXT_PUBLIC_RPC_URL` — Tenderly VNet RPC
- `NEXT_PUBLIC_WLD_APP_ID` — World ID app ID
- `NEXT_PUBLIC_DEPLOY_BLOCK` — Contract deploy block (for getLogs fromBlock)

### Mock API
- `DEMO_REJECT_ADDRESS` — Address to reject in compliance check (demo)
- `MOCK_API_ADMIN_SECRET` — Auth token for control endpoints (default: demo-secret)

### CRE Secrets (via `cre secrets create`)
- `UPTIME_API_KEY` — Mock API auth
- `COMPLIANCE_API_KEY` — Compliance API auth (used via ConfidentialHTTPClient)
- `GROQ_API_KEY` — Groq API key for Llama 3.3 70B (AI Tribunal, used via ConfidentialHTTPClient)
