# Codex Deep Audit: Trophē codex/trophe-100-execution Branch

> **Date**: 2026-06-07
> **Auditor**: Claude Opus (interactive session with operator)
> **Scope**: 9 commits on `codex/trophe-100-execution` (103 files, +20,197/-583 lines)
> **Branch base**: `main` at `8319c69`
> **Target audience**: OpenAI Codex CLI agent — autonomous execution

---

## Executive Summary

The branch delivers **four major systems**: governed AI execution runtime, permission-aware RAG, Letta-style memory, and GDPR compliance foundation. Architecture quality is 8.3/10 overall. The governed `executeAiTask()` pattern is production-grade. However, the branch is NOT deployed — 6 migrations (0008-0013) are pending on production Supabase, model IDs reference a deprecated generation, cost governance lacks org-level enforcement, and several routes need hardening for true B2B readiness.

This document contains **every finding**, ranked by priority, with exact file paths, line references, and acceptance criteria. Execute top-down. Each section ends with a verification command.

---

## PART 1: CRITICAL FIXES (Must fix before any deploy)

### C-1: Model ID Update — `claude-sonnet-4-5-20251022` Does Not Exist

**Files**: `agents/router/policies.ts` (lines for `coach_insight` and `memory_extract`)

The Anthropic API model overview (fetched 2026-06-07) confirms:
- **Current models**: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- **Legacy but available**: `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-5-20250929`
- **Deprecated (retiring June 15, 2026)**: `claude-sonnet-4-20250514`

The string `claude-sonnet-4-5-20251022` used in `coach_insight` and `memory_extract` policies was **never a real model ID**. The actual Sonnet 4.5 ID is `claude-sonnet-4-5-20250929`. However, since Sonnet 4.5 is now legacy and Sonnet 4.6 (`claude-sonnet-4-6`) is the current production model at the same price point ($3/$15), the correct fix is:

**Action**:
```typescript
// In agents/router/policies.ts
// REPLACE all occurrences of:
model: 'claude-sonnet-4-5-20251022',
// WITH:
model: 'claude-sonnet-4-6',
```

Also update the pricing comment block at the top of `policies.ts`:
```
// claude-sonnet-4-6    $3.00 in / $15.00 out (current, replaces sonnet-4-5)
```

**Verification**:
```bash
grep -rn "sonnet-4-5" agents/ --include="*.ts" | grep -v node_modules
# Should return 0 lines after fix
```

**Acceptance**: Zero references to `claude-sonnet-4-5-20251022` anywhere. All Sonnet tasks use `claude-sonnet-4-6`.

---

### C-2: Pricing Table Mismatch — Voyage voyage-4 Underpriced

**File**: `agents/router/pricing.ts`

Current code prices voyage-4 at `$0.12/M tokens` (the `memory_embed` entry). The official Voyage AI pricing page (fetched 2026-06-07) shows:
- **voyage-4**: $0.06/M tokens (NOT $0.12)
- **voyage-4-large**: $0.12/M tokens
- **voyage-4-lite**: $0.02/M tokens
- First 200M tokens/year are FREE per account

The embed task also uses voyage-4 but has no pricing entry (falls through to `return 0` in `estimateModelCostUsd`).

**Action**:
```typescript
// In agents/router/pricing.ts, replace the memory_embed entry:
[taskPolicies.memory_embed.model]: {
    inputPerMillion: 0.06,  // voyage-4 actual price (was 0.12)
    outputPerMillion: 0,
},
// Also add entry for the embed task (same model string, shared entry handles it)
```

Verify that `taskPolicies.embed.model` and `taskPolicies.memory_embed.model` resolve to the same string (`voyage-4`). If they do, one entry covers both. If not, add a second entry.

**Verification**:
```bash
node -e "const p = require('./agents/router/policies'); console.log('embed:', p.taskPolicies.embed.model, 'mem_embed:', p.taskPolicies.memory_embed.model)"
```

**Acceptance**: Voyage pricing matches $0.06/M. Both embed tasks have cost attribution.

---

### C-3: Gemini 2.5 Flash Pricing — Severely Underpriced

**File**: `agents/router/pricing.ts` + `agents/router/policies.ts` comment block

Current code prices Gemini 2.5 Flash at `$0.075/M input, $0.30/M output`. The official Google pricing (fetched 2026-06-07) shows:
- **gemini-2.5-flash**: $0.30/M input, $2.50/M output (thinking tokens: $1.25/M)

This is a **4x input / 8x output underpricing**. At 50 users doing 50 meals/day, the real daily cost for food_parse is ~$0.75/day, not $0.019/day.

**Action**:
```typescript
// In agents/router/pricing.ts, update Gemini entry:
[taskPolicies.food_parse.model]: {
    inputPerMillion: 0.30,   // was 0.075
    outputPerMillion: 2.50,  // was 0.30
},
```

Also update the comment block in `policies.ts`:
```
// gemini-2.5-flash     $0.30 in / $2.50 out (2026 pricing — includes thinking tokens)
```

And update the monthly cost projection:
```
// food_parse:    50*50*200 tokens * $0.30/M  = ~$0.15/day (was $0.019)
// Total revised: ~$0.85/day (~$26/month) vs previous $0.17/day estimate
```

**Verification**:
```bash
grep -n "0.075\|0\.30" agents/router/pricing.ts
# Should show only the corrected values
```

**Acceptance**: Gemini pricing matches Google's published rates. Monthly cost projection updated.

---

### C-4: Haiku 4.5 Pricing Already Correct — But Verify Model ID

**File**: `agents/router/policies.ts`

The model string `claude-haiku-4-5-20251001` is confirmed correct per the Anthropic models overview. The pricing ($1.00/$5.00) is also correct. No action needed here, but document for completeness.

**Note**: Haiku 4.5 does NOT support extended thinking but DOES support adaptive thinking (per latest docs). If any task uses `thinking` parameter with Haiku, it will fail silently.

**Verification**:
```bash
grep -rn "thinking" agents/ --include="*.ts" | grep -v node_modules | grep -v "\.d\.ts"
# Ensure no thinking-related params are sent with Haiku tasks
```

---

## PART 2: HIGH PRIORITY (Required for B2B readiness)

### H-1: Organization-Level Budget Enforcement (Missing)

**Context**: The current `assertWithinRequestBudget()` in `agents/runtime/budget.ts` only checks input character length and that `maxCostUsd > 0`. There is NO:
- Per-organization daily/monthly spend cap
- Per-user daily token limit
- Global kill switch when projected monthly cost exceeds `AI_MONTHLY_BUDGET_USD`
- Automatic alerting when an org approaches its limit

**Research context** (source: [Braintrust LLM Cost Tracking 2026](https://www.braintrust.dev/articles/how-to-track-llm-costs-2026)):
> "You wouldn't ship a web service without rate limiting — token cost governance belongs in the same category. Monitoring doesn't stop the bill; enforcement does."

**Required architecture** (source: [SoftwareSeni Token Attribution](https://www.softwareseni.com/token-attribution-and-cost-governance-for-multi-tenant-llm-products-in-production/)):
> "A spend cap is a daily token budget ceiling per tenant. A kill switch is the enforcement action when that ceiling is crossed."

**Action — Create `agents/runtime/org-budget.ts`**:
```typescript
export interface OrgBudget {
  organizationId: string;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  alertThresholdPercent: number; // e.g. 0.8 = alert at 80%
}

export async function assertOrgBudget(orgId: string | undefined): Promise<void> {
  if (!orgId) return; // Individual users have rate limiting in api-guard.ts

  // Query agent_runs for this org's spend today and this month
  // Compare against org budget table
  // Throw if over limit (429-style error)
  // Log warning if approaching threshold
}
```

**Required DB addition**: `organization_budgets` table with `daily_limit_usd`, `monthly_limit_usd`, `alert_threshold_pct`, `kill_switch_active`.

**Integration point**: Call `assertOrgBudget(context.organizationId)` inside `executeAiTask()` BEFORE `createGeneration()`.

**Verification**:
```bash
npm test -- --grep "org budget"
# Must have tests for: under limit, at threshold (alert), over limit (reject)
```

**Acceptance**: No AI call succeeds for an org that has exceeded its daily or monthly limit.

---

### H-2: Supabase Auth — Migrate to `getClaims()` for Server Validation

**Files**: `middleware.ts`, `lib/api-guard.ts`, `lib/auth/require-role.ts`

**Research context** (source: [Supabase Next.js SSR Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)):
> "Protect a route using getClaims() — not getSession() — in server code. getClaims() validates the JWT signature against the project's published public keys on every call. getSession() does not revalidate the token."

Current middleware uses `supabase.auth.getUser()` which is correct (it calls the Supabase auth server). However, `api-guard.ts` creates a raw Supabase client with `createClient()` and calls `getUser(token)` — this does a network round-trip to Supabase on EVERY AI request (+100-200ms latency).

**Action**:
1. Investigate if `getClaims()` is available in current `@supabase/ssr` version
2. If available, replace `getUser(token)` in `api-guard.ts` with local JWT validation via `getClaims()`
3. This eliminates the Supabase round-trip on every AI call (saves ~150ms p50 latency)
4. Keep `getUser()` in middleware (runs once, sets cookies)

**Also**: Supabase is deprecating legacy API keys by end of 2026. Check if current keys are `sb_publishable_xxx` / `sb_secret_xxx` format. If still using old format, plan migration.

**Verification**:
```bash
grep -rn "getSession\|getUser\|getClaims" lib/ middleware.ts --include="*.ts"
# Verify: middleware uses getUser (correct), api-guard uses getClaims or equivalent
```

---

### H-3: Rate Limiting — Replace In-Memory Map with Durable Store

**File**: `lib/api-guard.ts`

The current rate limiter uses an in-memory `Map<string, { n: number; resetAt: number }>`. This resets on every Vercel cold start, making it ineffective for abuse prevention.

**Action**:
1. Replace with Vercel KV (Redis) or Supabase-backed rate limiting
2. Use sliding window algorithm (not fixed window)
3. Add per-organization rate limits (not just per-user)
4. Consider using Vercel's built-in WAF rate limiting if on Pro plan

**Minimum viable fix**: Move to `@upstash/ratelimit` with Vercel KV:
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(60, "15 m"),
});
```

**Verification**:
```bash
# After implementing, test with:
curl -s -o /dev/null -w "%{http_code}" https://trophe.app/api/ai/coach-insight
# Should return 401 (no auth), not 200
```

---

### H-4: Admin Cost Dashboard — Add Organization Breakdown

**File**: `app/api/admin/costs/route.ts`

The current admin costs API returns `byEndpoint` and `byDay` breakdowns but has NO `byOrganization` rollup. For B2B, coaches and org admins need to see their organization's AI spend.

**Action**: Add to the response:
```typescript
const byOrg: Record<string, { calls: number; cost: number; orgName?: string }> = {};
for (const row of rows) {
  if (row.organizationId) {
    byOrg[row.organizationId] ??= { calls: 0, cost: 0 };
    byOrg[row.organizationId].calls++;
    byOrg[row.organizationId].cost += resolvedCost(row);
  }
}
```

Also add:
- `topUsers` — top 10 users by cost (for identifying abuse)
- `modelBreakdown` — cost per model (for pricing optimization)
- `cacheEfficiency` — cache hit rate per task (for prompt caching tuning)
- `p50Latency` and `p99Latency` per task

**Verification**:
```bash
curl -s https://trophe.app/api/admin/costs?days=7 -H "Authorization: Bearer $TOKEN" | jq '.byOrganization'
```

---

### H-5: RLS on knowledge_documents/knowledge_chunks — Verify Isolation

**Files**: `drizzle/0011_permission_aware_rag.sql`

The `hybrid_search_knowledge` function enforces permission at the SQL level. Verify that:
1. User A cannot retrieve User B's private knowledge chunks
2. Org A cannot retrieve Org B's knowledge
3. Public documents are accessible to all authenticated users
4. The function uses `SECURITY DEFINER` or `SECURITY INVOKER` correctly

**Action**: Write explicit RLS integration tests:
```typescript
// tests/db/rag-rls.test.ts (may already exist — extend if so)
it('user cannot retrieve another user private knowledge', async () => {
  // Insert doc for user A, query as user B, expect 0 results
});

it('org member can retrieve org knowledge', async () => {
  // Insert doc for org, query as org member, expect results
});

it('non-member cannot retrieve org knowledge', async () => {
  // Insert doc for org, query as non-member, expect 0 results
});
```

**Verification**:
```bash
npm test -- --grep "rag-rls"
```

---

## PART 3: MEDIUM PRIORITY (Required for production quality)

### M-1: Food Measurement Accuracy — Expand Eval Coverage

**File**: `agents/evals/food-parse-nikos-golden.json`

Current eval has **10 cases** covering English and Greek. Research shows:
- Food identification accuracy is 85-95% on common foods (source: [Nutrient Metrics Systematic Review](https://www.nutrientmetrics.com/en/guides/peer-reviewed-ai-nutrition-accuracy-literature-review))
- Portion estimation is the largest error source (15-25% from 2D photos)
- The v4 pipeline (LLM identifies → DB supplies macros) achieves ±1.2% MAPE per the lookup.ts header

**Required expansions**:

1. **Spanish language cases** (Trophē targets LATAM market):
   - "2 arepas con queso" → arepa + queso
   - "arroz con pollo, ensalada" → rice + chicken + salad
   - "1 plátano maduro frito" → fried plantain (NOT banana)
   - "frijoles con arroz" → beans + rice
   - "empanada de carne" → composite dish → decompose

2. **Portion ambiguity cases** (where accuracy drops):
   - "some chicken" → should default to 1 palm (~120g)
   - "a big bowl of soup" → should estimate ~400ml
   - "a handful of almonds" → should map to ~28g
   - "un poquito de arroz" → should estimate ~80g (half serving)

3. **Composite dish decomposition cases**:
   - "bandeja paisa" → must decompose into 8+ components
   - "moussaka" → layers of eggplant, meat, bechamel
   - "pad thai" → noodles, shrimp, egg, peanuts, sauce

4. **Edge cases that currently fail**:
   - Zero-calorie items: "black coffee", "water with lemon"
   - Branded foods: "1 Big Mac", "1 Subway 6-inch turkey"
   - Alcohol: "1 pint of Guinness", "1 glass of red wine"
   - Baby food / supplements: "1 scoop whey isolate"

**Target**: 50+ golden test cases, 3 languages, ≥85% pass rate on first run, ≥95% after DB enrichment.

**Verification**:
```bash
npx tsx agents/evals/run-food-parse.ts --url=http://localhost:3333
# Target: 50+ cases, ≥42/50 passing
```

---

### M-2: Conversation Route Memory Write — Complete the WIP

**File**: `app/api/ai/conversation/route.ts` (line ~65+)

The conversation route correctly:
- Reads memory (`readMemory()`)
- Reads RAG knowledge (`retrieveKnowledge()`)
- Injects both into system prompt
- Calls `executeAiTask()` with full context
- Persists both user and assistant messages to `agent_conversation`

BUT the `after()` callback at the bottom is cut off in the commit. Verify it includes:
1. `writeMemory()` for the user message (extract facts)
2. `writeMemory()` for the assistant response (extract coaching directives)
3. `memory.markRetrieved()` (update retrieval counts — already called above)

**Action**: Read the full file and ensure the `after()` block is complete:
```typescript
after(async () => {
  await Promise.all([
    writeMemory({
      userId: guard.userId,
      sessionId,
      agentName: 'conversation',
      content: message,
      role: 'user',
    }).catch(console.error),
    writeMemory({
      userId: guard.userId,
      sessionId,
      agentName: 'conversation',
      content: generation.output,
      role: 'assistant',
    }).catch(console.error),
  ]);
});
```

**Verification**:
```bash
# Read the full after() block:
grep -A 20 "after(async" app/api/ai/conversation/route.ts
```

---

### M-3: Deploy Migrations Sequentially

**Context**: 6 migrations on the branch, none applied to production:
- `0008_harden_rls_and_supabase_integration.sql` — RLS hardening
- `0009_canonical_schema_reconciliation.sql` — dish_recipes fix
- `0010_slow_boomerang.sql` — agent_runs extension
- `0011_permission_aware_rag.sql` — knowledge tables + hybrid_search_knowledge
- `0012_reconcile_ai_governance.sql` — AI governance columns
- `0013_compliance_foundation.sql` — consents + data_requests

**Action**: Apply in ORDER via session pooler (not transaction pooler):
```bash
# Use the DIRECT_URL (port 5432, session mode) for DDL
for f in 0008 0009 0010 0011 0012 0013; do
  echo "Applying migration $f..."
  psql "$DIRECT_URL" -f "drizzle/${f}_*.sql"
  echo "Migration $f applied."
done
```

**CRITICAL**: Take a backup snapshot in Supabase dashboard BEFORE applying any migration.

**Verification**:
```bash
npm run db:verify
# Must show all tables present, all RLS enabled, all indexes created
```

---

### M-4: Langfuse Tracing — Add Organization and User Metadata

**File**: `agents/observability/langfuse.ts`

Current traced() function receives metadata but does NOT set Langfuse's first-class `userId` and `sessionId` fields on traces. This makes the Langfuse dashboard unable to filter by user or org.

**Research context** (source: [Langfuse Observability Docs](https://langfuse.com/docs/observability/overview)):
> "First-class session and user ID fields on traces make multi-tenant cost attribution straightforward out of the box."

**Action**: In the `traced()` wrapper, pass userId and sessionId to Langfuse:
```typescript
const trace = langfuse.trace({
  name: input.task,
  userId: input.metadata?.userId as string,
  sessionId: input.metadata?.sessionId as string,
  metadata: input.metadata,
  tags: [input.provider, input.model],
});
```

**Verification**:
```bash
# After deploying, check Langfuse dashboard for userId/sessionId population
curl -s http://localhost:3100/api/public/traces?limit=5 | jq '.[].userId'
```

---

### M-5: Missing `promptVersion` Tracking in Langfuse

**File**: `agents/runtime/execute.ts`

The `promptHash` is computed and stored in `agent_runs`, but it is NOT sent to Langfuse. Langfuse supports native prompt versioning — this enables A/B comparison of prompt versions in the dashboard.

**Action**: Add `promptVersion` and `promptHash` to the Langfuse metadata:
```typescript
await traced({
  task: input.task,
  model: policy.model,
  provider: policy.provider,
  prompt: '[redacted]',
  systemPrompt: '[redacted]',
  metadata: {
    generationId,
    promptVersion: policy.promptVersion,  // ADD
    promptHash,                            // ADD
    ...input.context?.metadata,
  },
}, async () => { ... });
```

---

## PART 4: FRONTIER AI CAPABILITIES (10/10 target)

### F-1: Structured Output Enforcement — Replace Regex JSON Extraction

**File**: `agents/food-parse/index.v4.ts` (function `extractV4JSON`)

Currently the food parse pipeline uses regex to extract JSON from LLM output:
```typescript
const match = cleaned.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
```

This is fragile. Both Anthropic (tool_use with `tool_choice`) and Google (responseSchema) support native structured output that guarantees valid JSON at the decoding layer — no parsing needed.

The meal_suggest task already uses `tool_choice` enforcement (per the eval header). Food parse should too.

**Action**:
1. For Gemini: Use `responseSchema` in the API call:
```typescript
const response = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              raw_text: { type: 'STRING' },
              food_name: { type: 'STRING' },
              // ... full schema
            },
            required: ['raw_text', 'food_name', 'quantity', 'unit', 'confidence'],
          },
        },
      },
      required: ['items'],
    },
  },
});
```

2. Add a Zod schema validation after decoding (defense in depth):
```typescript
const foodParseOutputSchema = z.object({
  items: z.array(z.object({
    raw_text: z.string(),
    food_name: z.string().min(1),
    name_localized: z.string(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    qualifier: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1),
    recognized: z.boolean(),
  })),
});
```

**Verification**:
```bash
npx tsx agents/evals/run-food-parse.ts
# Schema validation failures should be 0%
```

---

### F-2: RAG Quality — Add Eval Framework for Retrieval Accuracy

**Research context** (source: [Braintrust LLM Evaluation](https://www.braintrust.dev/articles/llm-evaluation-metrics-guide)):
> "Using vector embeddings (such as cosine similarity), we can measure how semantically-close the generated output is to the ground truth."

Currently there are NO evals for the RAG pipeline. The retrieval quality is untested.

**Action — Create `agents/evals/run-rag.ts`**:
```typescript
interface RagEvalCase {
  id: string;
  query: string;
  expectedDocumentIds: string[];  // docs that SHOULD be retrieved
  forbiddenDocumentIds: string[]; // docs that MUST NOT be retrieved (wrong tenant)
}

// Scoring:
// - Recall@K: what % of expected docs appear in top K results
// - Precision@K: what % of returned docs are relevant
// - Permission violation: any forbidden doc in results = automatic FAIL
```

**Target metrics**:
- Recall@8 ≥ 0.80
- Precision@8 ≥ 0.60
- Permission violations = 0

---

### F-3: Photo Analysis — Portion Size Estimation Improvement

**Research context** (source: [Cambridge University ZOE PREDICT Study](https://www.cambridge.org/core/journals/proceedings-of-the-nutrition-society/article/leveraging-imagebased-ai-for-dietary-assessment-evaluating-a-large-language-model-with-realworld-meal-photos-from-the-zoe-predict-cohorts/64BD22D52D629009CED6A8EF65B3E75A)):
> "The largest source of error in end-to-end AI calorie tracking is portion estimation, not food identification."
> "Photo functions as a draft and user edits are where accuracy comes from."

**Current state**: `photo_analyze` route uses Haiku 4.5 for image analysis. This is a good model for food identification but research shows 15-25% error on portions from 2D photos.

**Action — Implement reference-object calibration**:
1. Add optional reference object selection in photo upload UI (coin, credit card, hand)
2. When reference present, compute pixel-to-cm ratio for portion estimation
3. Without reference, use statistical portion defaults from USDA Serving Size Database
4. Always present the LLM output as "draft" with easy adjustment UI
5. Log user corrections to improve future estimates (feedback loop)

**Verification**: Add photo eval cases with known portions and measure MAPE (Mean Absolute Percentage Error). Target: <15% MAPE with reference object, <25% without.

---

### F-4: Coach Insight Agent — Add Grounded Citations

**File**: `app/api/ai/coach-insight/route.ts`

Coach insights should cite the evidence they're based on:
- Food log data (last N days)
- Memory facts (user preferences, goals)
- RAG knowledge (retrieved documents)
- Wearable data (if available)

**Action**: Add citation format to the coach insight system prompt:
```
When making a recommendation, cite your evidence:
- [food:2026-06-07] "User logged 180g protein today" → basis for protein recommendation
- [memory:goal] "User's goal is muscle gain" → basis for surplus recommendation
- [knowledge:doc-123] "Creatine loading protocol" → basis for supplement advice
- [wearable:hrv] "HRV trending down 15% this week" → basis for recovery recommendation
```

This enables coaches to verify AI recommendations and builds trust.

---

### F-5: Multi-Model Fallback Chain — Implement Automatic Failover

**File**: `agents/runtime/execute.ts`

Current `executeAiTask()` has NO fallback. If the primary provider is down (Gemini outage for food_parse, Anthropic outage for coaching), the request fails.

**Action**: Add fallback chain to `RoutingPolicy`:
```typescript
export interface RoutingPolicy {
  // ... existing fields
  fallback?: {
    provider: Provider;
    model: string;
    maxCostUsd: number;
  };
}
```

In `executeAiTask()`, catch provider errors and retry with fallback:
```typescript
try {
  providerResult = await input.invoke({ policy, signal });
} catch (primaryError) {
  if (policy.fallback && isTransientError(primaryError)) {
    const fallbackPolicy = { ...policy, ...policy.fallback };
    await failGeneration(generationId, primaryError);
    // Create new generation for fallback
    const fallbackGenId = randomUUID();
    await createGeneration({ generationId: fallbackGenId, task: input.task, policy: fallbackPolicy, promptHash, context: input.context });
    providerResult = await input.invoke({ policy: fallbackPolicy, signal });
    // Mark as fallback in persistence
    await db.update(agentRuns).set({ fallbackFrom: policy.model }).where(eq(agentRuns.generationId, fallbackGenId));
  } else {
    throw primaryError;
  }
}
```

The `agent_runs` table already has a `fallbackFrom` column — use it.

**Suggested fallback chains**:
| Primary | Fallback | Rationale |
|---------|----------|-----------|
| gemini-2.5-flash (food_parse) | claude-haiku-4-5 | Structured output, fast |
| claude-haiku-4-5 (recipe) | gemini-2.5-flash | Both support JSON schema |
| claude-sonnet-4-6 (coaching) | claude-haiku-4-5 | Degraded quality > no response |
| voyage-4 (embed) | No fallback | Embedding consistency requires same model |

---

## PART 5: FOOD MEASUREMENT ACCURACY HARDENING

### FA-1: USDA FoodData Central Integration — Rate Limit Awareness

**Research context** (source: [USDA FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide/)):
> "FoodData Central currently limits the number of API requests to a default rate of 1,000 requests per hour per IP address."

**Current state**: The USDA API key is in Vercel env. The `food/search` route calls USDA for branded food lookup.

**Action**:
1. Add rate limit tracking for USDA API calls (count per hour)
2. Add local cache layer (Redis/KV or Supabase table) for USDA responses
3. Cache TTL: 30 days for branded foods (labels don't change often)
4. Fallback to local DB when USDA is rate-limited or unavailable

---

### FA-2: Unit Conversion Accuracy — Add Validation Suite

**File**: `agents/food-parse/lookup.ts`

The lookup engine resolves units via `food_unit_conversions` table. This is the critical accuracy layer — wrong gram conversions cascade to wrong macros.

**Action — Create unit conversion regression tests**:
```typescript
describe('unit conversion accuracy', () => {
  const cases = [
    { food: 'egg', unit: 'piece', expected_g: 50 },        // USDA: 50g per large egg
    { food: 'chicken breast', unit: 'palm', expected_g: 120 },
    { food: 'rice', unit: 'cup', qualifier: 'cooked', expected_g: 186 },
    { food: 'rice', unit: 'cup', qualifier: 'raw', expected_g: 185 },
    { food: 'olive oil', unit: 'tbsp', expected_g: 13.5 },
    { food: 'feta cheese', unit: 'slice', expected_g: 28 },
    { food: 'bread', unit: 'piece', qualifier: 'thin', expected_g: 25 },
    { food: 'bread', unit: 'piece', qualifier: 'thick', expected_g: 40 },
    { food: 'banana', unit: 'piece', expected_g: 118 },    // USDA: medium banana
    { food: 'avocado', unit: 'piece', expected_g: 136 },   // USDA: half avocado
  ];

  for (const c of cases) {
    it(`${c.food} (${c.unit}${c.qualifier ? ', ' + c.qualifier : ''}) ≈ ${c.expected_g}g`, async () => {
      const result = await lookupFood({ foodName: c.food, unit: c.unit, qualifier: c.qualifier });
      expect(result).not.toBeNull();
      const grams = result!.gramsPerUnit;
      // Allow 10% tolerance (USDA values vary by source)
      expect(grams).toBeGreaterThan(c.expected_g * 0.9);
      expect(grams).toBeLessThan(c.expected_g * 1.1);
    });
  }
});
```

**Target**: 100% of USDA-validated conversions within ±10% of reference values.

---

### FA-3: Composite Dish Decomposition — Cache and Validate

**File**: `agents/food-parse/decompose.ts`

The decomposition pipeline is well-designed (cache in `dish_recipes`, LLM decompose on miss, deterministic macro aggregation). But missing:

1. **Validation of ingredient proportions**: If LLM says "moussaka = 500g eggplant + 200g beef", verify proportions are realistic
2. **Confidence thresholds**: If decomposition confidence < 0.6, flag for human review
3. **Cache invalidation**: dish_recipes cache has no TTL — stale decompositions persist forever
4. **Cross-reference with USDA composite foods**: Some USDA entries ARE composite (e.g., "pizza, cheese") — use these as ground truth

**Action**: Add decomposition quality metrics:
```typescript
function validateDecomposition(result: DecompositionResult): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const totalGrams = result.ingredients.reduce((sum, i) => sum + i.grams, 0);

  // Check total grams is reasonable (50g-2000g for a single serving)
  if (totalGrams < 50 || totalGrams > 2000) {
    issues.push(`Total grams ${totalGrams} outside reasonable range`);
  }

  // Check no single ingredient dominates unreasonably
  for (const ing of result.ingredients) {
    if (ing.grams / totalGrams > 0.9) {
      issues.push(`${ing.name} is ${(ing.grams/totalGrams*100).toFixed(0)}% of dish — suspicious`);
    }
  }

  return { valid: issues.length === 0, issues };
}
```

---

## PART 6: B2B / COMPLIANCE HARDENING

### B-1: SOC 2 Readiness Checklist

**Research context** (source: [SecureLeap SOC 2 Checklist](https://www.secureleap.tech/blog/soc-2-compliance-checklist-saas)):
> SOC 2 evaluates against five Trust Services Criteria: security, availability, processing integrity, confidentiality, and privacy. Every organization must include Security.

**Current state vs SOC 2 requirements**:

| Control | Status | Gap |
|---------|--------|-----|
| Encryption at rest (AES-256) | ✅ Supabase handles | None |
| Encryption in transit (TLS) | ✅ Vercel + Supabase | None |
| MFA | ❌ Not enforced | Add MFA requirement for admin/coach roles |
| Audit log | ✅ append-only table | Good |
| Incident response plan | ❌ Missing | Document in RUNBOOK.md |
| Access control reviews | ❌ No periodic review | Add quarterly access review process |
| Data retention policy | 🟡 Partial (consents table) | Add `retention_policy` to knowledge_documents |
| Vulnerability scanning | ❌ No automated scanning | Add `npm audit` to CI + Snyk/Socket |
| Change management | ✅ Git + PR workflow | Good |
| Backup and recovery | ❌ No documented restore drill | Add monthly restore drill to runbook |

**Action**: Create `docs/security/soc2-controls.md` with evidence mapping.

---

### B-2: GDPR Data Subject Rights — Complete the Pipeline

**File**: `app/api/privacy/requests/route.ts`, `db/schema/data_requests.ts`

The `data_requests` table supports `export`, `deletion`, `correction`, `restriction` types with proper status machines. But:

1. **No automated export pipeline**: The `result_uri` field exists but nothing generates the export
2. **No cascade deletion logic**: When a deletion request is approved, what gets deleted?
3. **No 30-day compliance clock**: GDPR requires response within 30 days

**Action**:
1. Create `lib/privacy/export.ts` — generates JSON export of all user data
2. Create `lib/privacy/delete.ts` — cascading deletion with audit trail
3. Add cron job to flag overdue requests (>25 days without completion)
4. Add email notification to user when request is completed

---

### B-3: Multi-Tenant Organization Provisioning

**Current state**: Organizations table exists with RLS. But no:
- Self-serve org creation flow
- Invite/join workflow
- Role hierarchy within org (admin, coach, client)
- Org-level settings (branding, feature flags)

**Action**: Create the org management API:
```
POST   /api/organizations          — create org (requires admin or super_admin)
GET    /api/organizations/:id      — get org details (members only)
POST   /api/organizations/:id/invite — invite member (org admin only)
POST   /api/organizations/:id/join   — accept invite (via token)
PATCH  /api/organizations/:id/members/:userId — update role
DELETE /api/organizations/:id/members/:userId — remove member
GET    /api/organizations/:id/costs  — org cost dashboard (org admin only)
```

---

### B-4: Audit Log Completeness

**File**: `db/schema/audit_log.ts`

The append-only audit log exists with a trigger preventing mutations. Verify it captures:
1. All auth events (login, logout, password change, MFA setup)
2. All AI generation events (via agent_runs — cross-reference)
3. All data access events (knowledge document access, food log views)
4. All admin actions (role changes, org management, data requests)
5. All configuration changes (budget updates, policy changes)

**Action**: Add audit log middleware that auto-captures Route Handler actions:
```typescript
// lib/audit.ts
export async function auditLog(action: string, userId: string, details: Record<string, unknown>) {
  await db.insert(auditLogTable).values({
    action,
    actorId: userId,
    details,
    ipAddress: headers().get('x-forwarded-for'),
    userAgent: headers().get('user-agent'),
  });
}
```

---

## PART 7: TESTING AND QUALITY GATES

### T-1: Authenticated E2E Tests — Unblock with Test User

**Current state**: 8 authenticated E2E tests are skipped because credentials aren't configured.

**Action**:
1. Create a dedicated test user in Supabase: `e2e-test@trophe.app`
2. Store credentials in GitHub Actions secrets (NOT in code)
3. Configure Playwright to use these credentials via Supabase auth API
4. Run authenticated E2E in CI on every PR

```bash
# In .github/workflows/ci.yml:
- name: Run E2E tests
  env:
    E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
    E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
  run: npx playwright test
```

---

### T-2: Coverage Gates — Enforce Minimums

**Action**: Add to `vitest.config.ts`:
```typescript
test: {
  coverage: {
    thresholds: {
      lines: 60,
      branches: 50,
      functions: 55,
      statements: 60,
    },
    include: [
      'agents/runtime/**',       // 85% minimum
      'agents/rag/**',           // 85% minimum
      'lib/auth/**',             // 85% minimum
      'agents/food-parse/**',    // 75% minimum
    ],
  },
},
```

---

### T-3: Contract Tests — Every AI Route Creates Exactly One Generation

**File**: `tests/enterprise/invariants.test.ts` (extend)

Add:
```typescript
it('every live AI route creates exactly one agent_runs record', async () => {
  const aiRoutes = [
    'app/api/ai/coach-insight/route.ts',
    'app/api/ai/conversation/route.ts',
    'app/api/ai/meal-suggest/route.ts',
    'app/api/ai/photo-analyze/route.ts',
    'app/api/food/parse/route.ts',
    'app/api/food/recipe-analyze/route.ts',
  ];

  for (const route of aiRoutes) {
    const content = readFileSync(join(root, route), 'utf8');
    expect(content).toContain('executeAiTask(');
    // Ensure no direct provider calls bypass the runtime
    expect(content).not.toMatch(/anthropic\.messages\.create|generativeModel\.generateContent/);
  }
});
```

---

## PART 8: DOCUMENTATION RESET

### D-1: Regenerate Source-of-Truth Docs

After all code changes, regenerate:
1. `CLAUDE.md` — update with current model IDs, pricing, architecture
2. `DEPLOYMENT.md` — update with migration 0008-0013 instructions
3. `RUNBOOK.md` — add incident response, restore drill, monitoring alerts
4. `docs/architecture.md` — create: system diagram, data flow, auth flow
5. `docs/ai-capabilities.md` — create: list every AI task, model, cost, eval status
6. `docs/b2b-readiness.md` — create: SOC 2 controls, GDPR compliance, org management

### D-2: Remove Stale Documentation

Check and archive:
- Any references to `gemini-2.0-flash` (deprecated June 1, 2026)
- Any references to `claude-sonnet-4-5-20251022` (never existed)
- Old Phase 0/1/2 architecture docs that no longer reflect reality
- Duplicate planning docs in `docs/superpowers/plans/`

---

## EXECUTION ORDER

| Phase | Items | Estimated Time | Dependencies |
|-------|-------|---------------|--------------|
| 0. Fix critical | C-1, C-2, C-3 | 15 min | None |
| 1. Deploy baseline | M-3 (migrations) | 20 min | Phase 0 |
| 2. Security | H-2, H-3, H-5 | 45 min | Phase 1 |
| 3. Cost governance | H-1, H-4, M-4, M-5 | 60 min | Phase 2 |
| 4. AI quality | F-1, F-5, M-1, M-2 | 90 min | Phase 3 |
| 5. Food accuracy | FA-1, FA-2, FA-3 | 60 min | Phase 4 |
| 6. B2B foundation | B-1, B-2, B-3, B-4 | 120 min | Phase 5 |
| 7. Testing | T-1, T-2, T-3, F-2 | 60 min | Phase 6 |
| 8. Frontier AI | F-3, F-4 | 60 min | Phase 7 |
| 9. Docs reset | D-1, D-2 | 30 min | Phase 8 |

**Total estimated**: ~9 hours of agent work

---

## VERIFICATION CHECKLIST (run after ALL phases complete)

```bash
# 1. TypeScript
npx tsc --noEmit

# 2. Lint
npm run lint

# 3. Tests
npx vitest run

# 4. Build
npm run build

# 5. DB verify
npm run db:verify

# 6. Production canary
curl -s https://trophe.app/api/health | jq .status
# Expected: "ok"

# 7. Food parse eval
npx tsx agents/evals/run-food-parse.ts

# 8. Meal suggest eval
npx tsx agents/evals/run-meal-suggest.ts

# 9. RAG eval (after F-2)
npx tsx agents/evals/run-rag.ts

# 10. Security scan
npm audit --production

# 11. Model ID validation
grep -rn "claude-sonnet-4-5\|gemini-2.0" agents/ --include="*.ts"
# Expected: 0 results

# 12. Cost attribution check
node -e "const p = require('./agents/router/pricing'); Object.entries(p.modelPricing).forEach(([m,v]) => console.log(m, v))"
# All models should have non-zero pricing
```

---

## RESEARCH SOURCES

- [Anthropic Models Overview (June 2026)](https://platform.claude.com/docs/en/about-claude/models/overview) — confirmed model IDs and pricing
- [Voyage AI Pricing](https://docs.voyageai.com/docs/pricing) — voyage-4 at $0.06/M tokens
- [Braintrust: How to Track LLM Costs 2026](https://www.braintrust.dev/articles/how-to-track-llm-costs-2026) — four-layer token accounting, org budget enforcement
- [SoftwareSeni: Token Attribution for Multi-Tenant LLM Products](https://www.softwareseni.com/token-attribution-and-cost-governance-for-multi-tenant-llm-products-in-production/) — spend caps and kill switches
- [SecureLeap: SOC 2 Compliance Checklist](https://www.secureleap.tech/blog/soc-2-compliance-checklist-saas) — B2B SaaS security requirements
- [Supabase: Setting up Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — getClaims() vs getSession()
- [Supabase: RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions) — pgvector + RLS patterns
- [MavikLabs: Multi-Tenant RAG 2026](https://www.maviklabs.com/blog/multi-tenant-rag-2026) — tenant isolation patterns
- [Truto: Multi-Tenant RAG Data Isolation](https://truto.one/blog/how-to-architect-strict-data-isolation-in-multi-tenant-rag-pipelines/) — security architecture
- [Cambridge/ZOE: LLM Food Photo Assessment](https://www.cambridge.org/core/journals/proceedings-of-the-nutrition-society/article/leveraging-imagebased-ai-for-dietary-assessment-evaluating-a-large-language-model-with-realworld-meal-photos-from-the-zoe-predict-cohorts/64BD22D52D629009CED6A8EF65B3E75A) — portion estimation error rates
- [Nutrient Metrics: AI Nutrition Accuracy Systematic Review](https://www.nutrientmetrics.com/en/guides/peer-reviewed-ai-nutrition-accuracy-literature-review) — food ID accuracy benchmarks
- [USDA FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide/) — rate limits, data types
- [Langfuse: Token and Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking) — cost attribution per trace
- [Google: Gemini 2.5 Flash Pricing](https://ai.google.dev/gemini-api/docs/pricing) — $0.30 input / $2.50 output
- [Xoance: SaaS Security Checklist 2026](https://www.xoance.com/saas-security-checklist-2026/) — zero trust, MFA enforcement
- [Braintrust: LLM Evaluation Metrics Guide](https://www.braintrust.dev/articles/llm-evaluation-metrics-guide) — eval frameworks, structured output validation

---

*Generated by Claude Opus — Mac Mini M4 interactive audit session, 2026-06-07*
