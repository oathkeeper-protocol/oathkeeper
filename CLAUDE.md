# OathLayer

Privacy-first, AI-powered SLA enforcement for tokenized real-world assets. Chainlink CRE automates compliance monitoring, Gemini Flash predicts breaches, World ID gates provider identity.

## Architecture

```
World Chain (4801)          CRE Workflows              Sepolia (Tenderly VNet)
┌──────────────────┐   ┌─────────────────────┐   ┌──────────────────┐
│ WorldChainRegistry│   │ Cron (15min)        │   │ SLAEnforcement   │
│   register() ────┼──→│   → uptime fetch    │   │   recordBreach() │
│   ProviderReg    │   │   → Gemini Flash    │──→│   recordWarn()   │
│   Requested      │   │   → breach predict  │   │   compliance gate│
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

- **SLAEnforcement**: Tenderly VNet (Sepolia fork) — `0xB71247A5744b5c0e16a2b4374A34aCa8319703dB`
- **WorldChainRegistry**: World Chain Sepolia (4801)
- **RPC**: `https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d`

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
- Dashboard: wagmi hooks, `useReadContracts` multicall for batch reads, `getLogs` for historical events
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
- `GEMINI_API_KEY` — Gemini 2.0 Flash API key (used via ConfidentialHTTPClient)
