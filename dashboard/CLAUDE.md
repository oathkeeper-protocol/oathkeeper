# Dashboard Module

Next.js 14 dashboard with wagmi + viem + RainbowKit for live on-chain data.

## Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Main dashboard — live SLA stats, breach warnings, breach history |
| `/provider/register` | `app/provider/register/page.tsx` | World ID verify + bond ETH + compliance status polling |
| `/sla/create` | `app/sla/create/page.tsx` | Create SLA (compliance-gated) |
| `/claims` | `app/claims/page.tsx` | File claims against SLAs |
| `/arbitrate` | `app/arbitrate/page.tsx` | World ID gated arbitration |

## Data Patterns

- **SLA reads**: `useReadContracts` multicall — batch all SLA reads into single `eth_call`
- **Breach count**: `useReadContract` for `breachCount` state var (not event counting)
- **Historical events**: `getLogs` (viem public client) on mount + 30s poll interval
- **Real-time events**: `useWatchContractEvent` with `poll: true`, `pollingInterval: 5000` (HTTP transport, no WebSocket on Tenderly)
- **Compliance polling**: `useReadContract` for `providerCompliance[address]` with `refetchInterval: 5000`

## Key Components

- `StatCard` — metric display card with animated entry
- `BondHealthBar` — visual bond health indicator (green/amber/red)
- `RiskBadge` — risk score badge (green <50 / amber 50-70 / red >70)
- `ComplianceStatusBadge` — polls compliance status, shows spinner/approved/rejected
- `ComplianceChart` — uptime trend chart (Recharts)

## Config

- Chain: Tenderly VNet (Sepolia fork, chain ID 11155111)
- RPC configured in `lib/wagmi.ts`
- Contract address + ABI in `lib/contract.ts`

## Environment Variables (.env.local)

```
NEXT_PUBLIC_SLA_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_RPC_URL=https://virtual.sepolia.eu.rpc.tenderly.co/...
NEXT_PUBLIC_WLD_APP_ID=app_staging_oathlayer
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_DEPLOY_BLOCK=0
NEXT_PUBLIC_TENDERLY_EXPLORER=https://dashboard.tenderly.co/...
```

## Commands

```bash
npm install
npm run dev     # dev server on :3000
npm run build   # production build
```
