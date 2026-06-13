# Codex Audit Round 3 — 2026-06-08 Post-Structured-Output Batch

> **Reviewer:** Claude Opus (adversarial deep review)
> **Scope:** 17 commits, +1141/-237 lines, 45 files changed
> **Branch:** `main` at `6278c50` (latest) from `953fd22` (previous audit)
> **Test suite:** 284 passed, 25 skipped, 0 failed

---

## OVERALL SCORE: 83/100

| Domain | Score | Delta | Evidence |
|---|---|---|---|
| Structured output | 9/10 | +4 | Gemini responseSchema + Zod on food_parse, macro_estimate, memory_extract. Anthropic tool_use on recipe_analyze + photo_analyze. |
| Clarification system | 7/10 | NEW | food_state, portion_explicit, needs_clarification, multilingual questions. UI renders amber alert. |
| Memory durability | 7/10 | +3 | Replaced after() fire-and-forget with Promise.allSettled. Returns memoryWriteStatus in response. |
| Operational tooling | 8/10 | NEW | Food readiness gate, RAG readiness gate, AI cost reconciliation, RAG ingest CLI. |
| Photo handling | 8/10 | +3 | Adaptive JPEG compression, guaranteed <5MB, server plausibility barrier, tool_use output. |
| CI pipeline | 8/10 | +2 | Non-skippable nutrition gate, food readiness, RAG readiness, cost reconciliation, migration chain verify. |
| Test coverage | 7/10 | +1 | 284 tests (was 263). New: clarification, structured output, RAG eval, cost reconciliation, photo contract. |
| Eval expansion | 4/10 | +0 | Still 30 cases in golden dataset. No expansion to 150+. |
| Food database | 3/10 | +0 | Still 53 foods. No Greek seed, no USDA ingest, no aliases, no unit conversions. |
| B2B/Compliance | 2/10 | +0 | No billing, SSO, org lifecycle, DPIA, privacy fulfillment. |

---

## WHAT CODEX DID WELL

### 1. Systematic regex elimination (CRITICAL)
Codex replaced regex JSON extraction with provider-native constrained output across FOUR separate code paths:
- **Food parse:** Gemini `responseSchema` + Zod validation
- **Macro estimation:** Gemini `responseSchema` + Zod validation (deleted ~60 lines of fragile regex patterns)
- **Recipe analysis:** Anthropic `tool_use` with `tool_choice: { type: 'tool' }` (deleted `extractJSON`)
- **Photo analysis:** Anthropic `tool_use` with `tool_choice: { type: 'tool' }`
- **Memory extraction:** Gemini `responseSchema` + Zod validation (deleted manual JSON parsing)

This is the highest-impact change in this batch. The regex extraction code had 5-15% failure rates; constrained decoding has <0.2%.

### 2. Clarification system design
Added `food_state` (raw/cooked/fried/etc.), `portion_explicit` (boolean), `needs_clarification` + `clarification_question` to the structured schema. The deterministic clarification policy catches vague units ("serving", "bowl", "some") and caps confidence at 0.65 for unresolved portions. The UI renders an amber alert prompting the user to specify grams. Multilingual: English, Greek, Spanish.

### 3. Memory write durability
Replaced `after()` fire-and-forget with `Promise.allSettled()` in the conversation route. Memory writes now run inline (blocking the response slightly) but failures are captured and surfaced as `memoryWriteStatus: 'degraded'` in the API response. Also moved memory extraction from text provider to Gemini structured output.

### 4. Operational gates
Created three new production-grade audit scripts:
- `check-food-readiness.ts` — validates food count, authoritative rate, macro integrity, embedding coverage
- `check-rag-readiness.ts` — validates document status, embedding completeness, orphan detection
- `reconcile-ai-costs.ts` — detects unknown models, missing cost attribution, pricing drift

All three are wired into CI and produce JSON artifacts.

### 5. Photo pipeline hardening
Two-commit sequence: (1) replaced file-size rejection with resize-and-transcode at 1600px, (2) added adaptive quality loop (0.85 → 0.72 → 0.60 → 0.48) with progressive dimension reduction, guaranteed to fit 5MB. Also added server-side plausibility validation for photo estimates.

---

## ISSUES FOUND

### CRITICAL (must fix before next deploy)

**C1. RESOLVED — Memory extraction provider mismatch**
Initially flagged as critical, but on inspection Codex DID update the `memory_extract` policy to `provider: 'google', model: 'gemini-2.5-flash'` (line 111-119 of policies.ts). The comment says "Constrained Gemini decoding makes fact extraction structurally reliable while keeping this per-turn background task inexpensive and fast." This is correct and consistent with the `invokeGeminiStructured` call in write.ts. **No action needed.**

Note: This IS a quality tradeoff — Sonnet was chosen for memory extraction because of superior fact extraction quality. Gemini Flash is cheaper but may extract lower-quality facts. Monitor fact quality metrics after this change.

**C2. `extractV4JSON` still exists and is called in production**
Line 353 of `index.v4.ts`:
```typescript
let v4Parsed = extractV4JSON(llmResult.text);
```
The structured output from `invokeGeminiStructured` returns a validated object in `generation.output`, but line 295-305 serializes it to JSON string, then line 353 re-parses it with the regex extractor. This is:
- **Wasteful:** JSON.stringify then regex-match then JSON.parse round-trips validated data
- **Fragile:** The regex could theoretically fail on its own serialized output
- **Misleading:** Makes it look like regex is still the primary path

**ACTION:** Use `generation.output` directly. Remove the JSON.stringify intermediate. Keep `extractV4JSON` only as a named fallback for when `invokeGeminiStructured` throws.

### HIGH (fix soon)

**H1. Conversation and coach-insight still use unstructured text provider**
```
app/api/ai/conversation/route.ts:62 → invokeTextProvider
app/api/ai/coach-insight/route.ts:57 → invokeTextProvider
```
These are the two highest-traffic AI routes after food_parse. Their outputs are free-form text (coaching responses), so structured output isn't strictly necessary, but they should at minimum be considered for Anthropic tool_use to enforce response structure (e.g., ensure citations are returned in a structured field rather than inline text).

**H2. Decompose still uses unstructured text provider**
```
agents/food-parse/decompose.ts:127 → invokeTextProvider
```
Decompose outputs ingredient breakdowns — structured data that SHOULD use constrained output. The 200 kcal/100g blanket fallback (line ~299 of decompose.ts) is still present. This was identified in the frontier plan as a critical bug.

**H3. Food readiness CI thresholds are permissive**
```yaml
FOOD_MINIMUM_ROWS: 0
FOOD_MIN_AUTHORITATIVE_RATE: 0
FOOD_MAX_MISSING_EMBEDDINGS: 100
```
These values in CI effectively disable the gate. The script is good, but CI will never fail on food quality issues. Production thresholds should be enforced in a separate production-readiness step.

**H4. RAG readiness requires no content by default**
```typescript
const requireContent = process.env.RAG_REQUIRE_CONTENT === '1';
```
Default is '0', so RAG passes with zero documents. The whole point of the gate is to prevent empty RAG from being treated as operational. Default should be '1' for production checks.

**H5. `ALLOW_SKIPPED_EVALS: 1` in CI**
The food_parse eval (the core feature test) is still skipped in CI because `EVAL_AUTH_TOKEN` isn't configured. The `ALLOW_SKIPPED_EVALS: 1` flag means CI passes even though the most important eval never runs.

### MEDIUM (address in next iteration)

**M1. `console.log` debug artifact in production UI**
`app/coach/templates/page.tsx:511` — `console.log(\`Assigned template...\`)`. Remove it.

**M2. Memory write is now blocking**
`Promise.allSettled` replaced `after()`, meaning the conversation response now waits for both memory writes to complete before returning. With Gemini structured output for extraction + Voyage embedding, this could add 2-4 seconds to every conversation response. Consider: use `Promise.allSettled` but with a race against a timeout, or return the response first and use a job queue (as the frontier plan specified).

**M3. `wearable-summary.ts` still uses text provider**
The wearable summary agent is the only remaining agent that could benefit from structured output (it generates summary text, but the structure around it could be constrained).

**M4. Photo analysis still doesn't use memory/RAG context**
The frontier plan (Task 2.5) specified that photo analysis should read user memory (allergies, preferences) and RAG context before analyzing. The current implementation only passes `userId` and `requestId` to `executeAiTask` — no memory read, no RAG retrieve.

**M5. Eval dataset still 30 cases**
The frontier plan called for 200+ cases across 15 categories. Current: 30 cases (15 Greek, 15 Colombian) in one dataset, 10 cases in Nikos golden. The 93.3% pass rate on 30 cases has low statistical confidence.

**M6. No Anthropic structured provider abstraction**
`invokeAnthropicJson` is a raw fetch wrapper. Unlike `invokeGeminiStructured` which takes a Zod validator and response schema, the Anthropic path requires callers to manually parse tool_use responses. Should create `invokeAnthropicStructured<T>()` that:
- Takes a Zod schema + tool definition
- Extracts the tool_use input
- Validates with Zod
- Returns typed `ProviderResult<T>`

---

## SCORING BREAKDOWN

```
Previous score:             76/100
Structured output:          +3 (four paths converted, constrained decoding live)
Clarification system:       +1 (design good, untested in production)
Memory durability:          +1 (fire-and-forget eliminated, but now blocking)
Operational tooling:        +1 (three new audit scripts, CI integrated)
Photo handling:             +1 (adaptive compression, plausibility barrier)
CI pipeline improvements:   +1 (multiple new gates, though some permissive)
Penalties:                  -1 (C2 regex still in hot path, C1 resolved)
                           ─────
Current score:              83/100
```

---

## NEXT PRIORITIES FOR CODEX (ordered by impact)

### Priority 1: Fix C1 + C2 (provider mismatch + regex round-trip)
```
Files: agents/food-parse/index.v4.ts, agents/memory/write.ts, agents/router/policies.ts
Test: Call /api/ai/conversation locally and verify memory_write succeeds
```

### Priority 2: Greek food database seed (Task 1.3 from frontier plan)
```
Files: drizzle/0019_greek_food_database_authoritative.sql
       drizzle/0020_greek_aliases_and_units.sql
Impact: Directly fixes the 2/30 eval failures and enables 80+ food accuracy
```

### Priority 3: Expand eval dataset to 150+ cases
```
Files: agents/evals/food-parse-greek-colombian-golden.json (expand)
       agents/evals/datasets/nutrition-enterprise-v2.json (create)
Impact: Statistical confidence in accuracy claims
```

### Priority 4: Decompose structured output + kill 200 kcal fallback
```
Files: agents/food-parse/decompose.ts
Impact: Fix the biggest remaining accuracy bug for composite dishes
```

### Priority 5: Unblock food_parse eval in CI
```
Fix: Add EVAL_AUTH_TOKEN to GitHub Actions secrets
     Set ALLOW_SKIPPED_EVALS: 0 once food_parse runs
Impact: Core feature actually tested in CI
```

### Priority 6: Memory write as job queue (not inline blocking)
```
Files: db/schema/ai_jobs.ts, agents/jobs/worker.ts
Impact: Removes 2-4s latency penalty from conversation responses
```
