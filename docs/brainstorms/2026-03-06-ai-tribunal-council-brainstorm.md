# AI Tribunal Council — Multi-Agent Breach Determination

**Date:** 2026-03-06
**Status:** Brainstorm complete
**Next:** `/workflows:plan` when ready to implement

---

## What We're Building

Replace the single Gemini Flash agent with a **3-Agent Tribunal** that deliberates before issuing breach warnings or triggering slashing. Each agent has a distinct role and bias, and decisions require majority vote.

### The Problem

Current system: one AI call → one riskScore → if > 70, slash. A single model hallucination or prompt misfire can wrongfully slash a provider's bond. No adversarial check, no second opinion, no defense.

### The Tribunal

| Agent | Role | Bias | Input |
|-------|------|------|-------|
| **Risk Analyst** | Evaluates raw metrics against SLA thresholds, identifies trends | Data-driven, neutral | Raw uptime metrics, SLA parameters |
| **Provider Advocate** | Argues for the provider — finds mitigating factors, temporary dips, false positive indicators | Defensive — biased toward protecting providers | Risk Analyst's assessment + raw metrics |
| **Enforcement Judge** | Final arbiter — weighs both arguments, casts deciding vote with confidence score | Balanced, precedent-aware | Risk Analyst assessment + Provider Advocate rebuttal |

### Decision Flow

```
Cron fires → fetch uptime metrics (unchanged)
    ↓
Risk Analyst: "SLA #3 is at 94.5% vs 99% target. riskScore: 82. Likely breach within 24h."
    ↓ (parallel)
Provider Advocate: "94.5% is a 2-hour dip during scheduled maintenance window. Similar dip on day 3 recovered. Score should be 45."
Enforcement Judge: "Analyst flagged real degradation but Advocate's maintenance argument is plausible. Vote: WARNING not BREACH. Confidence: 0.6"
    ↓
Tally: Analyst=BREACH, Advocate=NO_BREACH, Judge=WARNING
    → Majority: no unanimous breach → downgrade to warning
    ↓
Submit recordBreachWarning() with council summary
```

### Voting Rules

- **Unanimous BREACH (3/3):** `recordBreach()` — immediate slashing
- **Majority BREACH (2/3):** `recordBreachWarning()` with high confidence
- **Split or majority NO_BREACH:** `recordBreachWarning()` with low confidence, or skip
- **Unanimous NO_BREACH:** No on-chain action

### Confidence Scoring

Each agent returns: `{ vote: "BREACH" | "WARNING" | "NO_BREACH", confidence: 0-1, reasoning: string }`

The workflow aggregates into a **council confidence score** = weighted average (Judge gets 1.5x weight as tiebreaker).

## Why This Approach

1. **Adversarial structure catches false positives** — the Provider Advocate's job is literally to argue against slashing
2. **Odd number = no ties** — 3 agents always produce a majority
3. **Narrative is compelling** — "AI tribunal for SLA enforcement" is a strong pitch to judges
4. **Minimal overhead** — only 3 sequential-ish API calls per scan cycle (Analyst → Advocate + Judge in parallel)
5. **Groq (Llama 3.3 70B) for demo** — better rate limits than Gemini, integration pattern reused from PhasmaPay. Architecture supports swapping to any provider (Gemini, Anthropic, etc.) in production

## Key Decisions

- **3 agents** (Risk Analyst, Provider Advocate, Enforcement Judge) — sweet spot of complexity vs feasibility
- **Groq (Llama 3.3 70B) for demo** — better quota than Gemini, reuse PhasmaPay integration pattern. Same system prompt differentiation per role. Production narrative: swap to multi-provider
- **Off-chain consensus in CRE workflow** — agents deliberate in the workflow, single aggregated tx submitted on-chain
- **Monorepo stays** — no repo split for hackathon. Can split later for production org
- **Git cleanup** — split commits by module folder, merge feature branch first

## On-Chain Impact

Minimal contract changes needed:
- `recordBreachWarning()` already accepts `riskScore` and `prediction` string — prediction string can include council summary
- `recordBreach()` unchanged
- Optionally: add `councilVotes` field to BreachWarning event (e.g. "2-1 BREACH" or "3-0 WARNING")

## Resolved Questions

1. **Should the Provider Advocate have access to historical breach data?** **Yes** — add a `/history` endpoint to the mock API. Richer Advocate arguments make the tribunal demo more convincing.
2. **Should council deliberation details be stored on-chain or off-chain?** **Summary + tally on-chain.** Short string like `"2-1 BREACH: Analyst+Judge flagged sustained degradation; Advocate cited maintenance window"` (< 200 chars). Full reasoning in event logs. Balances transparency vs gas cost, and gives judges something readable on-chain during demo.
3. **What happens when the model rate-limits mid-tribunal?** **Graceful degradation.** If 2/3 agents respond, use those votes. If only 1 responds, fall back to single-agent mode (current behavior). Using Groq instead of Gemini largely mitigates this — Groq has better rate limits for the demo.

## Future Evolution (Post-Hackathon)

- Swap agents to different providers (Gemini, Groq/Llama, Anthropic) for true model diversity
- CRE DON consensus on each agent's vote (`consensusMedianAggregation` on confidence scores)
- On-chain governance: token holders vote to adjust tribunal weights or add/remove agent roles
- Historical pattern learning: Historian agent (Approach C) added as 4th member
- Agent reputation tracking: agents that produce more accurate predictions get higher vote weight over time
