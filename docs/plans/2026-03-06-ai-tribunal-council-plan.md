# AI Tribunal Council — Implementation Plan

**Date:** 2026-03-06
**Brainstorm:** `docs/brainstorms/2026-03-06-ai-tribunal-council-brainstorm.md`
**Branch:** `feat/ai-tribunal-council`
**Status:** In progress
**Agent ordering:** Sequential (Analyst → Advocate → Judge) — Judge sees both arguments
**Contract:** No changes — pack tally into prediction string

---

## Overview

Replace the single Gemini Flash call in `scanSLAs()` (workflow.ts lines 272-367) with a 3-Agent Tribunal using Groq (Llama 3.3 70B). Add a `/history` endpoint to the mock API. Update the dashboard to display tribunal deliberation details. Minimal contract changes — reuse existing `BreachWarning` event with enriched prediction string.

## Implementation Steps

### Step 1: Mock API — Add `/history` endpoint

**File:** `workflow/mock-api/server.ts`

Add a new GET endpoint `/provider/:address/history` that returns simulated historical uptime data for the Provider Advocate to reference.

**Response shape:**
```json
{
  "provider": "0x...",
  "history": [
    { "timestamp": "2026-03-05T00:00:00Z", "uptimePercent": 99.8 },
    { "timestamp": "2026-03-04T00:00:00Z", "uptimePercent": 94.2 },
    { "timestamp": "2026-03-03T00:00:00Z", "uptimePercent": 99.9 }
  ]
}
```

**Logic:** Generate 7 days of fake history. If provider has a current override (low uptime), sprinkle 1-2 dips in history to make the Advocate's job interesting. Otherwise, stable ~99.5-99.9%.

**No auth** (same as other GET endpoints).

### Step 2: Workflow — Tribunal Agent System

**File:** `workflow/workflow.ts`

#### 2a. Add Groq API helper function

Replace the Gemini `ConfidentialHTTPClient` call with a Groq-compatible one. The CRE `ConfidentialHTTPClient` works with any HTTP endpoint — just change the URL, headers, and body format.

**New function:** `callTribunalAgent(runtime, role, systemPrompt, userPrompt) → AgentVote`

```typescript
type AgentVote = {
  vote: "BREACH" | "WARNING" | "NO_BREACH";
  confidence: number; // 0-1
  reasoning: string;  // max 100 chars
};

type TribunalVerdict = {
  votes: AgentVote[];
  tally: string;           // e.g. "2-1 BREACH"
  councilConfidence: number;
  summary: string;         // < 200 chars for on-chain
  action: "BREACH" | "WARNING" | "NONE";
};
```

**Groq via ConfidentialHTTPClient:**
- URL: `https://api.groq.com/openai/v1/chat/completions`
- Headers: `Authorization: Bearer ${groqKey}`, `Content-Type: application/json`
- Body: OpenAI-compatible `messages[]` format with `response_format: { type: "json_object" }`
- Model: `llama-3.3-70b-versatile`
- Temperature: 0 for Risk Analyst and Judge, 0.3 for Provider Advocate (slight creativity for defense arguments)

**Secret:** Add `GROQ_API_KEY` via `cre secrets create` (replaces `GEMINI_API_KEY` usage in this block).

#### 2b. Define system prompts for each agent

**Risk Analyst:**
```
You are a Risk Analyst for an SLA enforcement system. Analyze uptime metrics
and predict breach probability. Be data-driven and objective. Consider current
metrics against SLA thresholds. Respond with JSON:
{"vote":"BREACH"|"WARNING"|"NO_BREACH", "confidence":0.0-1.0, "reasoning":"<max 100 chars>"}
```

**Provider Advocate:**
```
You are a Provider Advocate defending infrastructure providers against wrongful
SLA penalties. Given the Risk Analyst's assessment and historical data, find
mitigating factors: temporary dips, maintenance windows, recovery trends,
measurement errors. Your bias is to PROTECT providers from false slashing.
Respond with JSON:
{"vote":"BREACH"|"WARNING"|"NO_BREACH", "confidence":0.0-1.0, "reasoning":"<max 100 chars>"}
```

**Enforcement Judge:**
```
You are the Enforcement Judge in an SLA tribunal. You receive the Risk Analyst's
assessment and the Provider Advocate's defense. Weigh both arguments fairly.
Only vote BREACH if evidence is overwhelming despite the defense. Your vote
breaks ties. Respond with JSON:
{"vote":"BREACH"|"WARNING"|"NO_BREACH", "confidence":0.0-1.0, "reasoning":"<max 100 chars>"}
```

#### 2c. Replace Gemini block in scanSLAs

Replace lines 272-367 (the entire Gemini block) with:

1. **Fetch history** for each active SLA provider via `runtime.runInNodeMode()` + consensus GET to `/provider/{addr}/history`
2. **Call Risk Analyst** with current metrics + SLA thresholds (batched for all active SLAs)
3. **Call Provider Advocate** with Risk Analyst's output + historical data (batched)
4. **Call Enforcement Judge** with both previous outputs (batched)
5. **Tally votes** per SLA:
   - Count BREACH/WARNING/NO_BREACH votes
   - Apply voting rules from brainstorm
   - Calculate `councilConfidence` = weighted average (Judge weight 1.5x)
   - Build summary string < 200 chars
6. **Submit on-chain:**
   - Unanimous BREACH → `recordBreach(slaId, uptimeBps)`
   - Majority BREACH or any WARNING votes → `recordBreachWarning(slaId, councilConfidence * 100, summary)`
   - Unanimous NO_BREACH → skip

**Batching strategy:** Same as current — all SLA metrics in one prompt per agent. Each agent call handles all active SLAs at once and returns an array of votes.

**Graceful degradation:** If an agent call fails (try/catch per agent), proceed with available votes. 2/3 agents = use those votes. 1/3 = fall back to single-agent mode. 0/3 = skip (current behavior).

#### 2d. Update ABI constants

Add `recordBreachWarning` to `SLA_ABI` if not already there (currently in `RELAY_ABI` at line 85). No contract changes needed — we're reusing the existing function signature.

### Step 3: Contract — Optional Enhancement

**File:** `contracts/src/SLAEnforcement.sol`

**Minimal change:** Update the `BreachWarning` event to include a `councilTally` field:

```solidity
event BreachWarning(uint256 indexed slaId, uint256 riskScore, string prediction, string councilTally);
```

Update `recordBreachWarning` signature:
```solidity
function recordBreachWarning(uint256 slaId, uint256 riskScore, string calldata prediction, string calldata councilTally) external onlyCREForwarder {
```

**Alternative (simpler):** Don't change the contract at all. Pack the tally into the `prediction` string: `"[2-1 BREACH] Analyst+Judge: sustained degradation below 99% SLA; Advocate: temporary maintenance dip"`. The dashboard can parse this prefix.

**Recommendation:** Use the simpler approach — pack tally into prediction string. Avoids redeployment.

### Step 4: Dashboard — Display Tribunal Details

**File:** `dashboard/src/app/dashboard/page.tsx`

#### 4a. Parse tribunal summary from prediction string

Add a utility to extract tally from the `[X-Y VERDICT]` prefix in the prediction string:

```typescript
function parseTribunalPrediction(prediction: string): { tally: string; summary: string } {
  const match = prediction.match(/^\[(\d-\d \w+)\]\s*(.*)/);
  if (match) return { tally: match[1], summary: match[2] };
  return { tally: "", summary: prediction }; // backwards compat with old single-agent predictions
}
```

#### 4b. Update breach warning cards

In the "AI Breach Predictions" section (lines 227-251), add the tally badge next to the risk score:

- Show `[2-1 BREACH]` as a colored badge (red for BREACH majority, amber for WARNING, green for NO_BREACH)
- Show the summary text below
- Keep the RiskBadge showing the council confidence score

#### 4c. Update section header

Change "AI Breach Predictions" → "AI Tribunal Predictions" to reflect the new architecture.

### Step 5: CRE Secrets Update

Run `cre secrets create` to add `GROQ_API_KEY`. Keep `GEMINI_API_KEY` for now (other parts of the system may reference it), but the tribunal block will use `GROQ_API_KEY`.

### Step 6: Mock API — Add admin endpoint for demo

**File:** `workflow/mock-api/server.ts`

Add `POST /set-history` admin endpoint to let the demo operator inject specific historical patterns (e.g., "gradual degradation over 3 days" or "single spike then recovery") to showcase different tribunal outcomes.

---

## Dependency Order

```
Step 1 (mock API /history) ─────────────────────────┐
Step 5 (GROQ_API_KEY secret) ───────────────────────┤
                                                     ├──→ Step 2 (workflow tribunal) ──→ Step 4 (dashboard)
Step 3 (contract - optional, skip if packing tally) ─┘
Step 6 (mock API /set-history) ── independent, anytime
```

Steps 1, 3, 5, 6 can all be done in parallel. Step 2 depends on 1 and 5. Step 4 depends on 2.

## Files Changed

| File | Change Type | Scope |
|------|-------------|-------|
| `workflow/mock-api/server.ts` | Edit | Add `/history` + `/set-history` endpoints |
| `workflow/workflow.ts` | Edit | Replace Gemini block with Tribunal system |
| `dashboard/src/app/dashboard/page.tsx` | Edit | Parse tribunal tally, update UI |
| `contracts/src/SLAEnforcement.sol` | None | Pack tally into prediction string (no contract change) |

## Testing Strategy

1. **Mock API:** `curl` test the `/history` endpoint
2. **Workflow:** `cre workflow simulate --verbose` — verify all 3 agents are called and votes are tallied correctly
3. **Dashboard:** Visual check — set mock uptime low via `/set-uptime`, wait for cron, verify tribunal cards appear with tally badges
4. **Degradation:** Kill Groq API key temporarily, verify graceful fallback

## Demo Script Addition

1. Set provider uptime to 94% via `POST /set-uptime`
2. Wait for cron cycle (15 min) or trigger manually
3. Show dashboard — tribunal card shows `[2-1 BREACH]` with Risk Analyst and Judge voting breach, Provider Advocate defending
4. Set uptime to 99.5% (borderline)
5. Wait for next cycle — tribunal shows `[1-2 NO_BREACH]` with only Risk Analyst flagging, Advocate and Judge dismissing
6. Highlight: "Single-agent would have missed this nuance"

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Groq rate limit hit during demo | Tribunal degrades to single-agent | Groq has generous free tier; pre-warm with test calls |
| Llama 3.3 doesn't follow JSON schema reliably | Broken votes | Use `response_format: { type: "json_object" }` + JSON parse with fallback |
| 3 sequential API calls add latency to cron cycle | Cron takes longer | Risk Analyst is batched; Advocate + Judge can potentially run in parallel since Judge input is defined |
| ConfidentialHTTPClient rejects Groq endpoint | Can't call Groq from CRE TEE | Test with `cre workflow simulate` first; fallback to Gemini if needed |
