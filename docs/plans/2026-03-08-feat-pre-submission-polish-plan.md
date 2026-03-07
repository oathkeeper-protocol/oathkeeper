---
title: Pre-Submission Polish
type: feat
status: completed
date: 2026-03-08
deadline: 2026-03-09
estimated_effort: 60 min
---

# Pre-Submission Polish

Final bug fixes, redeploy, demo state seeding, and cleanup before hackathon video recording. No new features — just make the existing flow work end-to-end for a clean demo.

## Overview

The workflow ABI is stale (missing `serviceName` field), causing CRE scans to read garbled data from the contract. Fix this, redeploy with fresh state, gate Demo Controls behind `?demo=true`, seed 3 SLAs with staggered thresholds, and push.

## Problem Statement

1. **Workflow ABI mismatch** — `workflow/workflow.ts` has 8 outputs for `slas()`, contract has 9 (`serviceName` at index 2). Every field after index 1 is shifted. `readSla()` reads `serviceName` as `bondAmount`, `responseTimeHrs` as `minUptimeBps`, etc. CRE breach detection has been unreliable since deploy.
2. **Double-breach in single scan** — `scanSLAs()` can fire `recordBreach()` in both the hard-breach loop AND the tribunal unanimous-BREACH branch for the same SLA in one cycle. At 94% uptime vs 99.9% threshold, this is guaranteed — not "unlikely."
3. **Demo Controls always visible** — floating panel renders unconditionally, visible to judges on default `/dashboard`.
4. **Fresh contract state needed** — current on-chain state has garbled CRE transactions from the ABI mismatch.

## Execution Plan

### Phase 1: Bug Fixes (10 min)

#### Task 1.1: Fix Workflow ABI + readSla() Indices

**File:** `workflow/workflow.ts`

**ABI fix** (lines 56-71) — Add `serviceName` output at index 2:

```typescript
outputs: [
  { internalType: "address", name: "provider", type: "address" },       // [0]
  { internalType: "address", name: "tenant", type: "address" },         // [1]
  { internalType: "string", name: "serviceName", type: "string" },      // [2] NEW
  { internalType: "uint256", name: "bondAmount", type: "uint256" },     // [3]
  { internalType: "uint256", name: "responseTimeHrs", type: "uint256" },// [4]
  { internalType: "uint256", name: "minUptimeBps", type: "uint256" },   // [5]
  { internalType: "uint256", name: "penaltyBps", type: "uint256" },     // [6]
  { internalType: "uint256", name: "createdAt", type: "uint256" },      // [7]
  { internalType: "bool", name: "active", type: "bool" },               // [8]
],
```

**Type cast fix** (line ~360) — Update tuple type to 9 elements:

```typescript
as readonly [Address, Address, string, bigint, bigint, bigint, bigint, bigint, boolean];
```

**Index fix** in `readSla()` return (lines ~362-369):

```typescript
return {
  provider: result[0],
  tenant: result[1],
  bondAmount: result[3],     // was [2]
  minUptimeBps: result[5],   // was [4]
  penaltyBps: result[6],     // was [5]
  active: result[8],         // was [7]
};
```

**Acceptance:**
- [ ] ABI outputs array has 9 entries with `serviceName` (string) at index 2
- [ ] `readSla()` returns correct field values (bondAmount is a bigint, not a string)
- [ ] Type cast matches 9-tuple shape

#### Task 1.2: Guard Against Double-Breach in Same Scan Cycle

**File:** `workflow/workflow.ts`, `scanSLAs()` function

Add a `Set<number>` to track SLA IDs already breached in the hard-breach loop. Skip those IDs in the tribunal BREACH branch.

```typescript
// Before the per-SLA loop
const breachedInLoop = new Set<number>();

// In the hard-breach section (~line 446-449)
breachedInLoop.add(slaId);

// In the tribunal unanimous BREACH section (~line 567-571)
if (!breachedInLoop.has(slaId)) {
  await writeBreach(runtime, slaId, ...);
}
```

**Acceptance:**
- [ ] A single scan cycle produces at most ONE `SLABreached` event per SLA
- [ ] Hard breach takes precedence over tribunal breach (first check wins)

### Phase 2: Redeploy (5 min)

#### Task 2.1: Redeploy SLAEnforcement to Tenderly VNet

No contract code changes. Fresh state clears garbled CRE history.

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url $TENDERLY_RPC_URL --broadcast
```

**Capture immediately after deploy:**
- New contract address from deploy output
- Deploy block number from tx receipt

**Acceptance:**
- [ ] New contract address confirmed on Tenderly explorer
- [ ] Deploy block number captured for `NEXT_PUBLIC_DEPLOY_BLOCK`

### Phase 3: Update Config & Docs (10 min)

#### Task 3.1: Update Operational Config (4 files)

Replace old address `0x8286A8cfA5c8C1872097D9b43E01CbdEe934D319` with new address in:

| # | File | Keys to Update |
|---|------|----------------|
| 1 | `dashboard/.env.local` | `NEXT_PUBLIC_SLA_CONTRACT_ADDRESS`, `NEXT_PUBLIC_DEPLOY_BLOCK` |
| 2 | `miniapp/.env.local` | `NEXT_PUBLIC_SLA_CONTRACT_ADDRESS` |
| 3 | `workflow/.env` | `SLA_CONTRACT_ADDRESS` |
| 4 | `workflow/config.local.json` | `slaContractAddress` |

Also update the hardcoded fallback in `miniapp/src/app/page.tsx` line 16 — currently points to dead address `0xB71247A5744b5c0e16a2b4374A34aCa8319703dB`.

**Acceptance:**
- [ ] `grep -r "0x8286A8cfA5c8C1872097D9b43E01CbdEe934D319" .` returns zero matches (excluding git history)
- [ ] `NEXT_PUBLIC_DEPLOY_BLOCK` set to exact deploy block (not 0)

#### Task 3.2: Update Documentation (3 files)

| # | File | Section |
|---|------|---------|
| 5 | `CLAUDE.md` | Deployment section (line ~35) |
| 6 | `README.md` | Deployed Contracts table (line ~96) |
| 7 | `SUBMISSION_GUIDE.md` | Deployed Infrastructure table (line ~131) |

**Acceptance:**
- [ ] All 3 docs reference new contract address
- [ ] WorldChainRegistry address unchanged (no redeploy)

### Phase 4: Gate Demo Controls (5 min)

#### Task 4.1: Conditional Rendering with `?demo=true`

**File:** `dashboard/src/app/dashboard/page.tsx`

Gate `<DemoControls />` (line ~595) behind URL search param:

```tsx
"use client";
import { useSearchParams } from "next/navigation";

// In the Dashboard component
const searchParams = useSearchParams();
const isDemoMode = searchParams.get("demo") === "true";

// In JSX
{isDemoMode && <DemoControls />}
```

**Note on persistence:** The `?demo=true` param will be lost when navigating to `/sla/[id]` and back. This is acceptable — Demo Controls are only needed on `/dashboard`. The demo video will stay on that page while using controls.

**Acceptance:**
- [ ] `/dashboard` — no Demo Controls visible
- [ ] `/dashboard?demo=true` — floating gear button appears
- [ ] Demo Controls buttons still work (breach, scan, reset)

### Phase 5: Demo State Seeding (20 min)

#### Task 5.1: Fund Wallet

Use Tenderly VNet faucet to add >= 3 ETH to the deployer/provider wallet (need 2 ETH for bonds + gas).

#### Task 5.2: Register Provider

**Preferred: Tenderly impersonation** (faster, no dependency on World Chain + miniapp + tunnel):

```bash
# Impersonate CRE forwarder to set compliance
cast send $NEW_CONTRACT "setComplianceStatus(address,uint8)" $PROVIDER_ADDR 1 \
  --rpc-url $TENDERLY_RPC_URL --unlocked --from $CRE_FORWARDER

# Register provider directly (or via impersonation)
cast send $NEW_CONTRACT "registerProvider(bytes32,uint256,uint256[8])" \
  0x0000...0000 0 "[0,0,0,0,0,0,0,0]" \
  --rpc-url $TENDERLY_RPC_URL --from $PROVIDER_ADDR
```

If World ID flow works, use miniapp instead — but don't spend more than 5 min debugging if it doesn't.

#### Task 5.3: Create 3 SLAs with Staggered Thresholds

| Service | minUptimeBps | responseTimeHrs | penaltyBps | Bond |
|---------|-------------|-----------------|------------|------|
| Cloud Hosting | 9990 (99.9%) | 4 | 1000 (10%) | 1 ETH |
| RPC Node Provider | 9950 (99.5%) | 1 | 1500 (15%) | 0.5 ETH |
| CDN / Edge Network | 9900 (99.0%) | 2 | 800 (8%) | 0.5 ETH |

Use dashboard `/sla/create` page (tests the UI in the process). Set tenant to a second address.

**Breach targeting:**
- Global uptime 99.5% -> only Cloud Hosting breaches (99.5% < 99.9%)
- Global uptime 98.0% -> Cloud + RPC breach
- Global uptime 94.0% -> all three breach

#### Task 5.4: Run CRE Scans to Build History

1. **Healthy scan** — uptime at default 99.9% -> all CLEAR tribunal verdicts
2. **Partial breach** — set uptime to 99.5% via Demo Controls -> Cloud Hosting breaches
3. **Reset** — set back to healthy

**Warning:** `recordBreachWarning()` has a 4-hour cooldown per SLA. Each SLA gets at most 1 warning per seeding session. Plan the scan sequence so you don't waste warnings on unwanted states.

**Acceptance:**
- [ ] 3 SLA cards visible on dashboard with correct service names
- [ ] At least 1 `SLABreached` event in breach history
- [ ] At least 1 tribunal verdict with `[X-Y VERDICT]` badge
- [ ] Bond health bar reflects breach penalty on affected SLA

### Phase 6: End-to-End Verification (10 min)

#### Task 6.1: Full Flow Test

With all services running (dashboard :3000, mock API :3001):

1. Load `/dashboard` — verify 3 SLAs, breach history, tribunal history
2. Load `/dashboard?demo=true` — verify Demo Controls appear
3. Click "Trigger Breach (94% uptime)" — wait up to 30s for events
4. Verify `SLABreached` event appears on dashboard (only ONE per SLA, not double)
5. Click "Reset to Healthy"
6. Navigate to `/sla/0` — verify SLA detail page loads
7. Check `/sla/create` — verify form works
8. Spot-check that `/dashboard` without `?demo=true` has no Demo Controls

**Acceptance:**
- [ ] All dashboard pages load without errors
- [ ] Demo Controls hidden by default, visible with `?demo=true`
- [ ] Breach trigger produces exactly 1 breach event per affected SLA
- [ ] Dashboard updates within 30s of on-chain events

### Phase 7: Push & Verify (5 min)

#### Task 7.1: Commit and Push

```bash
# Stage all changes including untracked pages
git add dashboard/src/app/dashboard/predictions/ dashboard/src/app/dashboard/slas/
git add -A
git commit -m "fix: workflow ABI + demo controls gating + pre-submission polish"
git push origin main
```

**Include in commit:**
- Workflow ABI fix + double-breach guard
- Demo Controls `?demo=true` gating
- Updated config files with new contract address
- Untracked `/dashboard/slas` and `/dashboard/predictions` pages (currently `??` in git status)
- Updated docs (CLAUDE.md, README, SUBMISSION_GUIDE)

**Acceptance:**
- [ ] `git status` is clean
- [ ] GitHub repo reflects all changes
- [ ] No `.env.*` files committed

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tenderly VNet faucet doesn't provide enough ETH | Low | Blocks seeding | Fund early, verify balance before SLA creation |
| CRE simulation fails silently from Demo Controls | Medium | Demo stalls | Check mock API console after each button click |
| World ID registration broken | Medium | Blocks seeding | Use Tenderly impersonation (planned fallback) |
| `getLogs` timeout with wrong deploy block | Medium | No events shown | Set exact block from deploy receipt, not 0 |
| 4-hour warning cooldown blocks repeated scans | High | Fewer tribunal events | Fresh deploy resets cooldowns; plan scan sequence carefully |
| Groq rate limit during tribunal | Low | No tribunal verdicts | Have backup Groq key; limit scans to 3-4 total |

## Files Modified

| File | Change |
|------|--------|
| `workflow/workflow.ts` | ABI fix (add serviceName), readSla() indices, double-breach guard |
| `dashboard/src/app/dashboard/page.tsx` | Gate DemoControls behind `?demo=true` |
| `dashboard/.env.local` | New contract address + deploy block |
| `miniapp/.env.local` | New contract address |
| `miniapp/src/app/page.tsx` | Update hardcoded fallback address |
| `workflow/.env` | New contract address |
| `workflow/config.local.json` | New contract address |
| `CLAUDE.md` | Deployment section |
| `README.md` | Deployed Contracts table |
| `SUBMISSION_GUIDE.md` | Deployed Infrastructure table |

## References

- Brainstorm: `docs/brainstorms/2026-03-08-pre-submission-brainstorm.md`
- Contract struct: `contracts/src/SLAEnforcement.sol:53-63`
- Workflow ABI: `workflow/workflow.ts:56-71`
- readSla(): `workflow/workflow.ts:344-370`
- scanSLAs(): `workflow/workflow.ts:~446-571`
- DemoControls: `dashboard/src/app/dashboard/page.tsx:186-267`
- Dashboard ABI (already correct): `dashboard/src/lib/contract.ts:38-50`
- Demo API: `dashboard/src/app/api/demo/route.ts`
- SLA create presets: `dashboard/src/app/sla/create/page.tsx:11-18`
