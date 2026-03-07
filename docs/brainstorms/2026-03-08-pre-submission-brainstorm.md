# Pre-Submission Brainstorm — OathLayer

**Date:** 2026-03-08
**Deadline:** 2026-03-09 (tomorrow)
**Status:** Decisions finalized

## What We're Building

Final polish pass before hackathon submission. No new features — just fix critical bugs, redeploy with `serviceName`, seed demo state, and push.

## Key Decisions

### 1. Upgradeable Contracts — SKIP
- One more redeploy. Update 4 env files + 3 docs. 10 min.
- No risk of proxy bugs night before deadline.
- 7 files to update (see deployment checklist below).

### 2. Breach Targeting — Staggered Thresholds
- Create SLAs with different `minUptimeBps`:
  - "Cloud Hosting" — 99.9% (9990 bps) → breaches first
  - "RPC Node Provider" — 99.5% (9950 bps) → breaches at lower uptime
  - "CDN / Edge Network" — 99.0% (9900 bps) → last to breach
- Set global uptime to 99.5% → only Cloud Hosting breaches
- Set to 98.0% → Cloud + RPC breach
- Set to 94% → all breach
- **Zero code change needed.**

### 3. CRE Cron — Manual Only
- Use Demo Controls panel + terminal `cre workflow simulate` commands
- No auto-schedule. Avoids runaway simulations.
- Run a few manual scans before recording video to build tx history.

### 4. Demo Controls Access — `?demo=true` Query Param
- Only show floating Demo Controls when URL is `/dashboard?demo=true`
- Clean for judges, hidden by default
- Share demo URL in README/DEMO_GUIDE

### 5. Arbitrate — Keep As-Is (Event Only)
- World ID gated, emits `ArbitrationDecision` event
- No on-chain enforcement in V1 — documented as known limitation
- Keeps the World ID arbitrator use case for the bounty track

### 6. Swagger/API Docs — Skip
- Dashboard Demo Controls panel is sufficient
- Judges see breach triggered from UI in the video

## Critical Bugs Found

### BUG: Workflow ABI missing `serviceName`
- `workflow/workflow.ts` has stale ABI for `slas()` getter — missing `serviceName` as 3rd output
- After redeploy, field indices shift: `bondAmount` reads `serviceName`, etc.
- **Must fix before redeploy or CRE simulation breaks**

### BUG: Potential double-breach in single scan
- `scanSLAs()` can call `recordBreach()` in the per-SLA loop (hard breach) AND in the tribunal verdict section (unanimous breach) for same SLA
- Provider could get slashed twice in one cycle
- **Low priority** — unlikely in demo, but note for judges Q&A

## Deployment Checklist (Redeploy SLAEnforcement)

### Must Update (operational)
1. `dashboard/.env.local` → `NEXT_PUBLIC_SLA_CONTRACT_ADDRESS`, `NEXT_PUBLIC_DEPLOY_BLOCK`
2. `miniapp/.env.local` → `NEXT_PUBLIC_SLA_CONTRACT_ADDRESS`
3. `workflow/.env` → `SLA_CONTRACT_ADDRESS`
4. `workflow/config.local.json` → `slaContractAddress`

### Should Update (documentation)
5. `CLAUDE.md` → Deployment section
6. `README.md` → Deployed Contracts table + Quick Test CLI example
7. `SUBMISSION_GUIDE.md` → Deployed Infrastructure table

### Also Fix
8. `workflow/workflow.ts` → Add `serviceName` to `slas()` ABI outputs

## Demo State Seeding (After Redeploy)

1. Fund wallet via Tenderly faucet
2. Register provider (World ID + compliance via impersonation if World ID still broken)
3. Create 3 SLAs with staggered thresholds:
   - "Cloud Hosting" — 99.9%, 4h response, 10% penalty, 1 ETH bond
   - "RPC Node Provider" — 99.5%, 1h response, 15% penalty, 0.5 ETH bond
   - "CDN / Edge Network" — 99.0%, 2h response, 8% penalty, 0.5 ETH bond
4. Run CRE simulation (healthy) → generates CLEAR tribunal verdicts
5. Drop uptime to 99.5% → Run CRE → Cloud Hosting breaches
6. Reset uptime → Run CRE → all CLEAR again
7. Dashboard should now show: 3 SLAs, breach history, tribunal history

## Execution Order (for /workflows:plan)

1. Fix workflow ABI (add `serviceName`) — 5 min
2. Redeploy SLAEnforcement — 5 min
3. Update all 7 config/doc files with new address — 10 min
4. Gate Demo Controls behind `?demo=true` — 5 min
5. Seed demo state (register, create SLAs, run scans) — 20 min
6. Test full flow end-to-end — 10 min
7. Push to GitHub + verify public — 5 min
8. Record video — user does this

**Estimated total: ~60 min of work before video recording.**

## Open Questions

None — all resolved in brainstorm.
