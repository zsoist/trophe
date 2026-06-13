> ⚠️ **SUPERSEDED** (snapshot 2026-06-09). Live priorities & gaps: [`docs/STATUS-2026-06-13.md`](docs/STATUS-2026-06-13.md) ("Known gaps / pending"). Kept for history.

# TODO-NEXT — Current priorities as of 2026-06-09

Read this at the start of the next session before touching branch, deploy, or production data.

---

## 🔴 IMMEDIATE: Production promote pending

A preview deploy with 5 code fixes is ready. Auth tokens are domain-scoped so the benchmark
can only run against production. Promote with:

```bash
vercel promote trophe-6neurptj9-2p6y54z6w9-4465s-projects.vercel.app --yes
```

Then run benchmark:
```bash
npx tsx scripts/eval/run-nutrition-enterprise-prod.ts
```

**Code fixes in preview:**
1. `COMMON_PIECE_WEIGHTS` +20 composite entries (lookup.ts)
2. `getPieceWeight()` longest-key-match fix (decompose.ts)
3. `shouldRequestClarification()` vague input detection (index.v4.ts)
4. Zero-quantity guard "0 eggs" (index.v4.ts)
5. Hybrid source protection dbConfidence ≥ 0.85 (index.v4.ts)

**Expected: 155→163-175/210 (78-83%)**

---

## P1 — Next code fixes (need deploy)

### Wire food_aliases into BM25 search (+3-5 cases)
- File: `agents/food-parse/lookup.ts` — BM25 arm of hybrid retrieval
- 480+ aliases exist in `food_aliases` table but are NEVER queried
- JOIN or UNION `food_aliases.alias` into the tsvector search
- Schema: `id, food_id, lang, alias, preferred, created_at` (NOT `alias_text`)

### Multi-item parsing improvements (+3-5 cases)
- multi-01, multi-03, multi-12: "2 eggs, toast, juice" → 4 items instead of 3
- multi-05: "salmon, quinoa, salad" → 4 items instead of 3
- es-comp-12: "sopa de lentejas con platano" → 2 items instead of 1

### Status error handling edge cases
- en-base-16: "200g broccoli steamed" → intermittent API error
- adv-05: "10kg of rice" → system caps at 1500g instead of 10000g

---

## P2 — Further accuracy improvements

### Wrong food variant matched (retrieval quality)
- en-base-15: "oatmeal cooked" → matches "Oat bran" instead of instant oats
- en-base-10: "ground beef" → matches 85/15 crumbles cooked instead of raw
- es-base-06: "plátano maduro frito" → matches green plantain instead of ripe
- brand-10: "Monster energy drink" → matches low-carb variant (5 cal) instead of regular

### LLM portion estimation
- el-base-03: Greek yogurt 10% bowl → LLM says 300g (should be ~170g)
- clar-01/02: "chicken"/"pasta" → LLM overestimates default portions

---

## Benchmark State

| Metric | Value |
|--------|-------|
| Current score | 155/210 (73.8%) |
| DB-only ceiling | ~155±3/210 |
| Preview score (estimated) | 163-175/210 |
| DB state | ~8,064 foods, 1,050+ conversions, 210+ recipes, 480+ aliases |
| Branch | `feat/nutrition-phase1-usda-portions` |
| Deploys used this session | 1/3 (preview only) |

---

## ✅ COMPLETED (June 2026)

- ✅ DB seeding batches 3, 3B, 3C, 4, 4B, 4C (~175 operations)
- ✅ Score progression: 78 → 143 → 155/210
- ✅ BENCHMARK-STATUS.md comprehensive failure analysis
- ✅ DeepSeek V4 Flash integration (coach_insight, meal_suggest)
- ✅ RAG pre-search for food-parse
- ✅ Landing page overhaul
- ✅ All food-parse tests passing (104/104)

## ✅ COMPLETED (May 2026)

- ✅ v0.3-overhaul merged to main (2026-05-03)
- ✅ B2B readiness hardening
- ✅ Composite dish decomposition + restaurant chains
- ✅ All P0 bugs fixed (Spanish input, 0-kcal branded, wrong portions)
- ✅ Branch governance normalized

---

## Standing rules

- `agent_runs` is canonical AI cost table; `api_usage_log` is legacy compatibility only
- Production writes read-only unless migration/deploy explicitly requires them
- Production branch is `main` — push auto-deploys
- Trophē is production-critical — zero-risk deploys only, preview-first
