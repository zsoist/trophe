# Trophē Frontier Execution Plan — Codex Agent Brief

> **Generated:** 2026-06-08 | **Target:** True 100/100 Enterprise Frontier Grade
> **Branch:** `main` at `2a01bc0` | **Production:** `trophe.app`
> **Research basis:** 6 parallel deep-research agents across food databases, enterprise platforms, AI/RAG frontier, compliance, Greek nutrition data, and full codebase audit
> **Scope:** This is not a patch list. This is the blueprint to make Trophē the first platform that combines clinical-grade food data + frontier AI + enterprise compliance + personalized coaching in one product.

---

## WHY THIS MATTERS

The competitive landscape research confirms a massive market gap:

> **No single platform combines clinical food data + AI meal planning + wearable integration + coaching automation + enterprise compliance.** The market is fragmented: Nutritics owns food data (1M+ foods, 258 nutrients), Healthie owns compliance (SOC 2 + HIPAA), Noom owns scale (250 B2B partners, 300-400 users/coach), Foodvisor owns computer vision (87% accuracy). Nobody has all four.

Trophē's architecture already has the foundation: governed AI runtime, Letta-style memory, permission-aware RAG, DietAI24 food parse pipeline. The gap is execution depth, data coverage, and proof.

---

## CURRENT HONEST STATE

### What Works
```
✅ Governed AI runtime (executeAiTask) — all calls tracked, costed, traced
✅ Food parse v4 pipeline — LLM names → DB macros → deterministic
✅ Composite dish decomposition — cache-first, LLM fallback
✅ Permission-aware RAG — hybrid BM25 + vector, RLS-enforced
✅ Letta-style memory — 3-stage kNN, salience × recency scoring
✅ Conversation route — full memory + RAG + coaching + citations
✅ Org budgets — daily/monthly limits, kill switch
✅ Durable rate limiting — DB-backed, survives cold starts
✅ Audit log — immutable, append-only, 6 indexes
✅ GDPR tables — consents, data requests, privacy intake
✅ 260 tests passing, 18 enterprise invariant tests
✅ Security headers, safe redirect, RLS on all tables
```

### What's Broken or Missing
```
❌ Food parse eval SKIPPED in CI — gate passes without testing core feature
❌ Structured output is regex-only — 5-15% failure rate vs <0.2% with tool_use
❌ Memory write is fire-and-forget — facts silently lost on transient errors
❌ Greek food data: 21 items, no Greek names, no aliases, no unit conversions seeded
❌ Photo analysis ignores user memory — allergies/preferences invisible
❌ Zero B2B infrastructure — no billing, invitations, SSO, API keys, webhooks
❌ 4 E2E tests, none authenticated
❌ No RAG eval, no memory eval, no photo eval, no conversation eval
❌ 43.3% multilingual nutrition eval pass rate
❌ No Open Food Facts integration (barcode column exists, nothing queries it)
❌ No CGM/wearable integration beyond Spike
❌ Decompose fallback uses blanket 200 kcal/100g for unknown ingredients
❌ No Stripe billing, no subscription management
❌ No DPIA documented (required by GDPR for AI health data processing)
❌ Voyage AI has no BAA — embedding PHI-derived data is a compliance gap
```

---

## PROGRAM 1: FRONTIER FOOD DATABASE ENGINE

### The Vision
Transform Trophē from a 21-food Greek database to a **500,000+ food multi-source engine** with clinical-grade accuracy, multilingual support, and real-time branded food updates.

### Data Source Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TROPHĒ FOOD ENGINE                        │
├──────────────┬──────────────┬───────────────┬───────────────┤
│  Tier 1:     │  Tier 2:     │  Tier 3:      │  Tier 4:      │
│  CANONICAL   │  REGIONAL    │  BRANDED      │  CROWDSOURCED  │
│              │              │               │               │
│  USDA FDC    │  Trichopoulou│  Open Food    │  User-reported │
│  Foundation  │  Greek 2004  │  Facts API    │  corrections   │
│  ~500 foods  │  ~300 recipes│  3M+ products │               │
│  150 nutri.  │  60 nutri.   │  8.5K Greek   │               │
│              │              │               │               │
│  USDA SR     │  Colombian   │  FatSecret    │  Coach-curated │
│  Legacy      │  ICBF tables │  2.3M foods   │  recipes       │
│  ~7,800      │  ~200 foods  │  58 countries  │               │
│              │              │               │               │
│  USDA FNDDS  │  HelTH data  │  Barcode      │  LLM decomp   │
│  ~7,000      │  4,002 Greek │  scanning     │  (verified)    │
│  as consumed │  branded     │               │               │
└──────────────┴──────────────┴───────────────┴───────────────┘

Data Quality Hierarchy:
  lab_verified > label > reviewed_recipe > calculated > crowdsourced > ai_estimate
  
Provenance Rule: EVERY returned nutrition value must cite its source tier
```

**Research basis:**
- USDA FDC: 415,000+ foods across 5 data types, free API (1000 req/hr), public domain
- Open Food Facts: 3M+ products, ~8,500 Greek products, ODbL license, free API (100 req/min)
- FatSecret: 2.3M foods across 58 countries (including Greece), Premier tier for international
- HelTH: 4,002 Greek branded foods, 45 nutrients each, EuroFIR membership required
- HHF/Trichopoulou: 300 Greek foods/recipes, 60 nutrients, peer-reviewed canonical source
- FoodOn: 9,600+ food classes in OWL ontology for semantic food matching
- INFOODS: International tag names for nutrient identifiers (ENERC_KCAL, PROCNT, etc.)

### Task 1.1: USDA FDC Bulk Ingest Pipeline

**Impact:** +400,000 foods with clinical-grade nutrient data

**Files:**
- Create: `scripts/ingest/usda-fdc-ingest.ts`
- Create: `scripts/ingest/usda-fdc-types.ts`
- Create: `drizzle/0019_usda_fdc_ingest.sql`
- Modify: `db/schema/foods.ts` — add USDA-specific fields

**Requirements:**
- Download USDA FDC bulk CSV files (Foundation + SR Legacy + FNDDS): https://fdc.nal.usda.gov/download-datasets
- Map USDA FDC schema to Trophē `foods` table:
  - `fdc_id` → `source_id`, `data_type` → metadata
  - Map 150 USDA nutrient IDs to Trophē columns (kcal, protein, fat, carbs, fiber, sugar, plus micronutrients)
  - Use INFOODS tag names as canonical identifiers: `ENERC_KCAL`, `PROCNT`, `FAT`, `CHOCDF`, `FIBTG`, `SUGAR`
- Foundation foods get `data_quality: 'lab_verified'`
- SR Legacy gets `data_quality: 'label'`
- FNDDS gets `data_quality: 'calculated'` (as-consumed composites)
- Branded foods get `data_quality: 'label'`
- Generate `search_text` tsvector for BM25 matching
- Generate Voyage embeddings for vector search (batch, ~$0.06/1M tokens)
- Deduplicate against existing foods table entries
- Create `food_nutrient_details` table for the full 150-nutrient profile (beyond the core macros in `foods`)

**Verification:**
```bash
# After ingest:
psql $DATABASE_URL -c "SELECT data_type, count(*) FROM foods WHERE source = 'usda' GROUP BY data_type;"
# Expected: foundation ~500, sr_legacy ~7800, fndds ~7000, branded ~400000
```

### Task 1.2: Open Food Facts Real-Time Integration

**Impact:** 3M+ branded products, barcode scanning, Greek product coverage

**Files:**
- Create: `agents/food-parse/off-client.ts` — Open Food Facts API client
- Create: `app/api/food/barcode/route.ts` — barcode lookup endpoint
- Modify: `agents/food-parse/lookup.ts` — add OFF as third retrieval path
- Create: `scripts/ingest/off-greek-bulk.ts` — bulk import Greek products

**Requirements:**
- API client for Open Food Facts v2:
  ```
  GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json
  GET https://world.openfoodfacts.org/api/v2/search?countries_tags=en:greece&json=1
  ```
- Rate limit: respect 100 req/min (add exponential backoff)
- Cache OFF results in `foods` table with `source: 'off'`, `data_quality: 'crowdsourced'`
- Barcode endpoint: lookup local DB first → OFF API fallback → cache result
- Nutri-Score passthrough (OFF computes it automatically)
- Bulk import: download Greek products (~8,500), validate nutrient completeness, import complete entries
- Map OFF nutrients (energy_kcal_100g, proteins_100g, etc.) to Trophē schema
- Handle missing nutrients gracefully (OFF data is variable quality)

**Acceptance:** Barcode scan → nutrition result in <2 seconds for cached, <5 seconds for OFF lookup

### Task 1.3: Greek Food Database — Authoritative Seed

**Impact:** Transform Greek accuracy from 43% → target 90%+

**Files:**
- Create: `drizzle/0020_greek_food_database_authoritative.sql`
- Create: `drizzle/0021_greek_aliases_and_units.sql`
- Create: `drizzle/0022_greek_traditional_recipes_reviewed.sql`
- Create: `scripts/ingest/greek-trichopoulou-recipes.ts`

**Requirements:**

**Part A: 80+ Greek Base Foods** (in `foods` table, not just `dish_recipes`)
Greek staple ingredients with macros cross-referenced from USDA FDC + published Greek data:

| Category | Foods to Include | Source |
|---|---|---|
| Dairy | Feta (PDO), strained yogurt (10%, 2%, 0%), graviera, kefalotiri, halloumi, manouri, anthotyro, myzithra, kasseri | USDA + Trichopoulou |
| Oils | Extra virgin olive oil, olive oil, sesame oil (tahini base) | USDA Foundation |
| Bread/Grains | Pita bread, lagana, paximadi/dakos, koulouri Thessalonikis, phyllo dough, trahanas | USDA + Trichopoulou |
| Vegetables | Horta (wild greens), vlita (amaranth), stamnagathi, kolokithakia (zucchini), bamies (okra) | USDA + regional |
| Legumes | Fava (split peas), gigantes, fasolia (white beans), revithia (chickpeas), black-eyed peas | USDA SR |
| Seafood | Sardines, anchovies, octopus, calamari, shrimp, sea bream, swordfish, cod (bakaliaros) | USDA SR |
| Meat | Lamb (shoulder, leg, chops), pork gyros meat, souvlaki pork, chicken souvlaki, pastourma, loukaniko | USDA + Trichopoulou |
| Sweets | Halva (semolina + tahini), loukoumi, pasteli, baklava base, kataifi base | Trichopoulou |
| Beverages | Greek coffee, frappe (instant), freddo espresso, mountain tea (tsai tou vounou), tsipouro | Trichopoulou |
| Condiments | Tzatziki, taramosalata, skordalia, melitzanosalata, htipiti | Trichopoulou |

Each food MUST include:
- `name_en`, `name_el` (Greek), `name_es` (Spanish where applicable)
- Macros per 100g (kcal, protein, carbs, fat, fiber, sugar)
- `data_quality`: `lab_verified` for USDA Foundation, `reviewed_recipe` for Trichopoulou-sourced
- `source`: `usda` or `hhf`
- `region`: `['GR']`

**Part B: 150+ Greek Aliases** (in `food_aliases` table)
Greek colloquial names → canonical food_id:
```
ντομάτα → tomato | αγγούρι → cucumber | κρεμμύδι → onion
πιπεριά → bell pepper | μελιτζάνα → eggplant | κολοκύθι → zucchini
κοτόπουλο → chicken | χοιρινό → pork | μοσχάρι → beef
αρνί → lamb | ψάρι → fish | γαρίδες → shrimp
φέτα → feta | γιαούρτι → yogurt | γάλα → milk
ψωμί → bread | ρύζι → rice | μακαρόνια → pasta
ελιά/ελιές → olives | σκόρδο → garlic | λεμόνι → lemon
μέλι → honey | αυγό/αυγά → egg | πατάτα → potato
αλεύρι → flour | ζάχαρη → sugar | βούτυρο → butter
ελαιόλαδο → olive oil | ξίδι → vinegar | αλάτι → salt
```
Plus common misspellings, abbreviations, and diminutives.

**Part C: Greek Unit Conversions** (in `food_unit_conversions` table)
```
φλιτζάνι / φλ = cup = 240ml
κουταλιά / κ.σ. = tablespoon = 15ml
κουταλάκι / κ.τ. = teaspoon = 5ml
χούφτα = handful = 30g (nuts/olives), 15g (herbs)
παλάμη = palm = 120g (meat/fish)
φέτα = slice — FOOD-SPECIFIC: bread 30g, feta 28g, cheese 20g
κομμάτι = piece — FOOD-SPECIFIC: pie 150g, baklava 80g
ποτήρι = glass = 250ml
μερίδα = serving — FOOD-SPECIFIC (use dish_recipes.total_grams)
```
Vague quantifiers with defaults:
```
λίγο/λίγη = "a little" = 15g (solids), 30ml (liquids)
μερικά/μερικές = "some" = 3 pieces (countable), 50g (bulk)
αρκετό = "enough" = standard serving from food_unit_conversions
πολύ = "a lot" = 1.5x standard serving
```
Source column: `kavdas` for reviewed Greek anthropometric portions, `coach` for estimated.

**Part D: 25 Reviewed Traditional Greek Recipes** (in `dish_recipes` table)
Using published Trichopoulou 2004 data + cross-referenced modern measurements:

| Dish | Greek Name | Serving (g) | kcal | Protein | Fat | Carbs | Source |
|---|---|---|---|---|---|---|---|
| Moussaka | μουσακάς | 300 | 350 | 15 | 25 | 20 | Trichopoulou 2004 |
| Pastitsio | παστίτσιο | 300 | 420 | 18 | 22 | 38 | Trichopoulou 2004 |
| Souvlaki pork + pita | σουβλάκι χοιρινό πίτα | 250 | 450 | 30 | 20 | 40 | Trichopoulou + USDA |
| Souvlaki chicken + pita | σουβλάκι κοτόπουλο πίτα | 250 | 380 | 35 | 12 | 40 | Cross-referenced |
| Gyros pork wrapped | γύρος χοιρινός | 350 | 550 | 25 | 28 | 48 | Cross-referenced |
| Gyros chicken wrapped | γύρος κοτόπουλο | 350 | 450 | 30 | 15 | 45 | Cross-referenced |
| Spanakopita | σπανακόπιτα | 150 | 395 | 12 | 22 | 41 | Trichopoulou 2004 |
| Tiropita | τυρόπιτα | 100 | 233 | 7 | 13 | 20 | Trichopoulou 2004 |
| Horiatiki salad | χωριάτικη σαλάτα | 300 | 230 | 7 | 18 | 10 | Trichopoulou 2004 |
| Fasolada | φασολάδα | 350 | 280 | 14 | 8 | 40 | Trichopoulou 2004 |
| Gemista | γεμιστά | 250 | 200 | 5 | 5 | 30 | Trichopoulou 2004 |
| Dolmades | ντολμαδάκια | 200 | 300 | 6 | 10 | 40 | Cross-referenced |
| Stifado | στιφάδο | 300 | 380 | 30 | 18 | 22 | Trichopoulou 2004 |
| Giouvetsi | γιουβέτσι | 350 | 420 | 25 | 14 | 48 | Cross-referenced |
| Tzatziki | τζατζίκι | 100 | 75 | 4 | 5 | 4 | Trichopoulou 2004 |
| Baklava | μπακλαβάς | 100 | 456 | 7 | 24 | 55 | Trichopoulou 2004 |
| Loukoumades | λουκουμάδες | 100 | 350 | 5 | 15 | 48 | Cross-referenced |
| Galaktoboureko | γαλακτομπούρεκο | 150 | 380 | 8 | 16 | 52 | Cross-referenced |
| Bougatsa cream | μπουγάτσα κρέμα | 200 | 420 | 9 | 18 | 56 | Cross-referenced |
| Saganaki | σαγανάκι | 80 | 280 | 14 | 22 | 4 | Trichopoulou 2004 |
| Revithada | ρεβιθάδα | 350 | 310 | 15 | 10 | 42 | Cross-referenced |
| Kleftiko | κλέφτικο | 300 | 400 | 35 | 24 | 8 | Cross-referenced |
| Briam | μπριάμ | 300 | 180 | 4 | 8 | 24 | Trichopoulou 2004 |
| Kolokithokeftedes | κολοκυθοκεφτέδες | 150 | 280 | 8 | 16 | 28 | Cross-referenced |
| Dakos | ντάκος | 200 | 320 | 10 | 18 | 30 | Cross-referenced |

Set `confidence: 0.90` for Trichopoulou-sourced, `0.80` for cross-referenced.
ALL entries must have `dish_name_localized` with the Greek name.
ALL entries must have `ingredients` JSONB with component breakdown.

### Task 1.4: Category-Aware Decompose Fallback

**Problem:** `agents/food-parse/decompose.ts:299-314` uses blanket 200 kcal/100g for unknown ingredients. This is wrong by 2-10x depending on food category.

**File to modify:** `agents/food-parse/decompose.ts`

**Create:** `agents/food-parse/food-category-classifier.ts`

**Implementation:**
```typescript
// Food category defaults based on USDA averages per category
const CATEGORY_DEFAULTS = {
  vegetable:       { kcal: 35,  protein: 2,  carbs: 6,   fat: 0.5, fiber: 2.5 },
  fruit:           { kcal: 55,  protein: 0.8, carbs: 13,  fat: 0.3, fiber: 2   },
  grain_cereal:    { kcal: 340, protein: 10, carbs: 72,  fat: 2,   fiber: 4   },
  bread_baked:     { kcal: 265, protein: 9,  carbs: 49,  fat: 3.5, fiber: 2.5 },
  legume:          { kcal: 130, protein: 9,  carbs: 22,  fat: 0.5, fiber: 7   },
  meat_red:        { kcal: 250, protein: 26, carbs: 0,   fat: 16,  fiber: 0   },
  meat_poultry:    { kcal: 190, protein: 27, carbs: 0,   fat: 8,   fiber: 0   },
  fish_seafood:    { kcal: 130, protein: 22, carbs: 0,   fat: 4,   fiber: 0   },
  dairy_cheese:    { kcal: 300, protein: 20, carbs: 2,   fat: 24,  fiber: 0   },
  dairy_yogurt:    { kcal: 95,  protein: 5,  carbs: 12,  fat: 3,   fiber: 0   },
  dairy_milk:      { kcal: 62,  protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0  },
  egg:             { kcal: 155, protein: 13, carbs: 1,   fat: 11,  fiber: 0   },
  fat_oil:         { kcal: 884, protein: 0,  carbs: 0,   fat: 100, fiber: 0   },
  nut_seed:        { kcal: 600, protein: 18, carbs: 15,  fat: 52,  fiber: 8   },
  sauce_condiment: { kcal: 80,  protein: 1.5, carbs: 10,  fat: 3.5, fiber: 0.5 },
  sugar_sweet:     { kcal: 380, protein: 1,  carbs: 85,  fat: 3,   fiber: 0   },
  beverage:        { kcal: 40,  protein: 0,  carbs: 10,  fat: 0,   fiber: 0   },
  generic:         { kcal: 150, protein: 6,  carbs: 18,  fat: 6,   fiber: 2   },
};
```

The classifier function uses keyword matching + LLM fallback:
- "chicken", "pork", "beef", "lamb" → meat categories
- "oil", "olive oil", "butter" → fat_oil
- "bread", "pita", "phyllo" → bread_baked
- Ambiguous → ask the LLM in the decompose prompt to classify each ingredient

### Task 1.5: Structured Output — Eliminate Regex Extraction

**Impact:** Reduce parse failures from 5-15% to <0.2%

**Research basis:** Anthropic's tool_use achieves <0.2% failure rate across 300K calls. Gemini's response_schema uses constrained decoding (compiles JSON Schema into a CFG, masks logits) guaranteeing syntactically valid output.

**Files:**
- Create: `agents/runtime/providers/structured.ts`
- Modify: `agents/clients/google.ts` — add `responseSchema` parameter
- Modify: `agents/clients/anthropic.ts` — add `tool_use` with `tool_choice: { type: 'tool', name: 'parse_food' }`
- Modify: `agents/food-parse/index.v4.ts` — use structured provider, remove `extractV4JSON` from production path
- Modify: `agents/food-parse/decompose.ts` — use structured output for decomposition
- Create: `agents/schemas/food-parse-structured.ts` — Zod schema → JSON Schema converter
- Create: `tests/agents/food-parse-structured-output.test.ts`

**Zod schema for structured output:**
```typescript
const FoodParseItemSchema = z.object({
  raw_text: z.string(),
  food_name: z.string().min(1),
  name_localized: z.string(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  qualifier: z.string().nullable().optional(),
  food_state: z.enum(['raw', 'cooked', 'fried', 'grilled', 'baked', 'boiled', 'roasted', 'steamed', 'unknown']).default('unknown'),
  confidence: z.number().min(0).max(1),
  recognized: z.boolean(),
  needs_clarification: z.boolean().default(false),
  clarification_reason: z.string().nullable().optional(),
});

const FoodParseOutputSchema = z.object({
  items: z.array(FoodParseItemSchema),
  language_detected: z.enum(['en', 'el', 'es', 'mixed']),
});
```

**For Gemini (food_parse task):** Convert Zod → JSON Schema → pass as `response_schema` in `generationConfig`
**For Anthropic (decompose, coaching):** Convert Zod → tool definition → pass as `tools` with `tool_choice: { type: 'tool' }`

**Keep regex extraction as LAST fallback** (for edge cases where structured output fails):
```
Structured output → schema-repair retry → regex extraction → clarification request → safe failure
```

### Task 1.6: Retrieval Ranking Overhaul

**Impact:** Fix the root cause of wrong food matches (arepa con queso → wrong variant, etc.)

**Research basis:** ArXiv 2603.09704 shows three-tier fallback (strict filter → loose food-group → pure semantic) is optimal. BGE-M3 supports 100+ languages with unified dense+sparse+multi-vector, boosting nDCG@10 by 5-10%.

**Files:**
- Modify: `agents/food-parse/lookup.ts`
- Create: `agents/food-parse/confidence-router.ts`
- Create: `agents/food-parse/clarification.ts`
- Create: `tests/agents/food-confidence-routing.test.ts`

**Retrieval priority stack (in order):**
1. **Exact alias match** (food_aliases table, language-specific) → confidence 0.98
2. **Exact name match** (foods.name_en/name_el/name_es, case-insensitive) → confidence 0.95
3. **Recipe cache match** (dish_recipes.dish_name tsvector) → confidence per recipe
4. **BM25 + Vector hybrid** (current RRF, k=60) → confidence from similarity score
5. **Open Food Facts API** (barcode or text search) → confidence 0.70 (crowdsourced)
6. **LLM decomposition** (for composite dishes not in cache) → confidence 0.60-0.85
7. **LLM macro estimation** (last resort) → confidence 0.40-0.60

**New ranking signals:**
- **Food state match:** If query says "fried" (τηγανητό), penalize raw variants by -0.15
- **Regional match:** If language=el, boost GR-region foods by +0.10
- **Data quality boost:** lab_verified +0.10, label +0.05, crowdsourced +0.00
- **Freshness penalty:** Penalize frozen/processed/branded when query implies generic fresh food
- **Portion availability:** Boost foods that have unit conversions for the requested unit

**Confidence routing:**
```
confidence ≥ 0.85 → return result (high confidence)
confidence 0.60-0.84 → return with warning badge
confidence 0.40-0.59 → return but mark as ai_estimate
confidence < 0.40 → trigger clarification question
```

**Clarification system:**
When top candidates are within 0.1 confidence of each other AND materially different nutritionally (>20% kcal difference), return a clarification prompt:
```json
{
  "needs_clarification": true,
  "question": "Did you mean Greek yogurt (strained, 97 kcal) or regular yogurt (61 kcal)?",
  "options": [
    { "food_id": "xxx", "name": "Greek yogurt, strained, 10% fat", "kcal_per_100g": 97 },
    { "food_id": "yyy", "name": "Yogurt, plain, whole milk", "kcal_per_100g": 61 }
  ]
}
```

### Task 1.7: Enterprise Nutrition Eval — 200+ Cases

**Impact:** Prove accuracy with statistical confidence

**Research basis:** NutriBench (ICLR 2025) uses 11,857 meal descriptions across 24 countries. GPT-4o+CoT achieves 66.82% accuracy at 7.5g tolerance. Our target: ≥90% at similar tolerance.

**Files:**
- Create: `agents/evals/datasets/nutrition-enterprise-v2.json` — 200+ reviewed cases
- Modify: `agents/evals/nutrition-release-gate.ts` — add per-category metrics
- Modify: `agents/evals/run-food-parse.ts` — fix auth token issue
- Create: `agents/evals/run-nutrition-benchmark.ts` — comprehensive benchmark runner
- Modify: `package.json` — add `evals:nutrition` script

**Case distribution:**

| Category | Count | Languages | Description |
|---|---|---|---|
| Greek base foods | 25 | el | Feta, yogurt, olive oil, olives, bread, cheese varieties |
| Greek composites | 25 | el | All 25 recipes from Task 1.3 |
| Greek vague quantities | 10 | el | λίγο, μερικά, αρκετό, μια χούφτα, ένα κομμάτι |
| Greek code-switch | 10 | el+en | "I had μουσακά with some bread" |
| Greek bakery/street food | 10 | el | Koulouri, bougatsa, tiropita, loukoumades |
| Greek seafood | 5 | el | Χταπόδι, καλαμάρι, γαρίδες, σαρδέλες |
| Colombian base foods | 15 | es | Arepa, empanada, patacón, frijoles |
| Colombian composites | 15 | es | Bandeja paisa, ajiaco, sancocho, lechona |
| Colombian code-switch | 5 | es+en | "I ate una arepa with cheese" |
| English/USDA base | 25 | en | Standard USDA foods — eggs, chicken, rice, bread |
| English composites | 15 | en | Burgers, sandwiches, salads, stir-fry |
| Branded foods | 10 | en/el/es | Specific brands from OFF |
| Barcode lookups | 5 | - | EAN-13 barcodes for Greek products |
| Adversarial | 15 | mixed | Empty input, emoji, injection, impossible foods, huge quantities |
| Clarification triggers | 10 | mixed | Ambiguous inputs that SHOULD trigger clarification |

**Each case includes:**
```json
{
  "id": "gr-base-01",
  "input": "200γρ φέτα ΠΟΠ",
  "language": "el",
  "category": "base_food",
  "expect_item_count": 1,
  "expect_food_state": "raw",
  "expect_total": {
    "calories": { "min": 490, "max": 560 },
    "protein_g": { "min": 25, "max": 32 },
    "carbs_g": { "min": 0, "max": 8 },
    "fat_g": { "min": 38, "max": 48 }
  },
  "expect_source": ["local_db"],
  "expect_safety": true,
  "expect_provenance": "usda|hhf",
  "notes": "200g feta PDO. Macros from USDA 01019. kcal=264/100g, protein=14.2, fat=21.3, carbs=4.1"
}
```

**Release gates:**
```
Overall: ≥90% | Safety: 100% | Multilingual: ≥90%
Composite: ≥85% | Adversarial abstention: 100% | Clarification: ≥80%
```

---

## PROGRAM 2: FRONTIER AI ENGINE

### Task 2.1: Complete AI Eval Registry

**Impact:** Prove every AI capability works, not just food parse

**Files:**
- Create: `agents/evals/registry.ts` — central eval task registry
- Create: `agents/evals/datasets/rag-enterprise-v1.json` — 25 RAG cases
- Create: `agents/evals/datasets/memory-enterprise-v1.json` — 20 memory cases
- Create: `agents/evals/datasets/conversation-enterprise-v1.json` — 15 conversation cases
- Create: `agents/evals/datasets/photo-enterprise-v1.json` — 10 photo cases
- Create: `agents/evals/run-rag-eval.ts`
- Create: `agents/evals/run-memory-eval.ts`
- Create: `agents/evals/run-conversation-eval.ts`

**RAG eval cases (25):**
- Permission isolation (5): User A can't see User B's knowledge
- Retrieval relevance (5): Query → expected chunk in top 3
- Citation accuracy (5): Returned chunks have correct source attribution
- Groundedness (5): Coach response uses only RAG context, doesn't hallucinate
- No-answer (5): Unknown topic → graceful "I don't have that information"

**Memory eval cases (20):**
- Write extraction (5): Conversation → correct fact_type, confidence, scope
- Read retrieval (5): Query → relevant memory, allergy-first priority
- Supersedence (5): Contradicting fact → old fact deactivated
- Temporal decay (3): Old, unretrieved facts ranked lower
- Cross-session persistence (2): Facts survive session boundaries

**Conversation eval cases (15):**
- Memory integration (5): Coach references user's known preferences/allergies
- RAG integration (5): Coach cites knowledge sources
- Multi-turn coherence (3): Context maintained across turns
- Safety (2): Coach refuses medical diagnoses, refers to professionals

### Task 2.2: Durable Memory Write System

**Impact:** Zero silent fact loss

**Research basis:** Letta benchmarks at ~83.2% on LoCoMo. Current fire-and-forget approach means any DB error during the `after()` callback silently drops extracted facts.

**Files:**
- Create: `db/schema/ai_jobs.ts`
- Create: `drizzle/0023_ai_jobs_queue.sql`
- Create: `agents/jobs/worker.ts`
- Create: `agents/jobs/memory-write-job.ts`
- Modify: `app/api/ai/conversation/route.ts` — replace `after()` with job enqueue
- Create: `app/api/admin/jobs/route.ts` — job monitoring dashboard
- Create: `tests/agents/ai-jobs.test.ts`

**Schema:**
```typescript
export const aiJobs = pgTable('ai_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(), // 'memory_write', 'embedding_generate', 'rag_ingest'
  status: text('status').notNull().default('pending'),
  // pending → processing → completed | failed | dead_letter
  payload: jsonb('payload').notNull(),
  result: jsonb('result'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  userId: uuid('user_id'),
  organizationId: uuid('organization_id'),
  generationId: uuid('generation_id'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
```

**Worker:** Polls `ai_jobs` for pending jobs, processes with bounded retries, moves to `dead_letter` after max attempts. Observable via admin dashboard.

### Task 2.3: Memory Contradiction Detection

**Impact:** Correct user profile over time instead of accumulating contradictions

**Research basis:** Letta supports explicit `supersedes` relationships. LoCoMo benchmark shows contradiction handling is the hardest memory sub-task.

**File to modify:** `agents/memory/write.ts`

**Implementation:** Before inserting a new fact, run semantic similarity against existing active facts of the same `fact_type` for the same user. If cosine similarity > 0.85 AND the facts are semantically contradictory (detected via a lightweight LLM classification call), mark the old fact as `active: false, superseded_by: newFact.id`.

Example:
```
Old fact: "User is vegetarian" (fact_type: preference, confidence: 0.8)
New fact: "User ate grilled chicken today" (fact_type: observation, confidence: 0.9)
→ Old fact superseded, new observation recorded
→ System notes dietary change in coaching context
```

### Task 2.4: Multi-Model Fallback Chain

**Impact:** Zero downtime during provider outages, 85% cost reduction

**Research basis:** RouteLLM (ICLR 2025) achieves 85% cost reduction while maintaining 95% of GPT-4 quality. 37% of enterprises run 5+ models in production.

**Files:**
- Create: `agents/router/fallback-chain.ts`
- Modify: `agents/router/policies.ts` — add fallback model per task
- Modify: `agents/runtime/execute.ts` — implement fallback on provider error

**Fallback chains:**
```
food_parse:     Gemini 2.5 Flash → Claude Haiku → Claude Sonnet (escalation)
coach_insight:  Claude Sonnet → Gemini 2.5 Flash → Claude Haiku (degraded)
recipe_analyze: Claude Haiku → Gemini 2.5 Flash
meal_suggest:   Claude Haiku → Gemini 2.5 Flash
photo_analyze:  Claude Haiku → Gemini 2.5 Flash
embed:          Voyage 4 → (self-hosted fallback or queue for retry)
memory_extract: Claude Sonnet → Claude Haiku (degraded)
decompose:      Gemini 2.5 Flash → Claude Haiku
```

**Cost routing (based on RouteLLM pattern):**
- Simple food lookup/logging → Haiku ($1/$5 per M tokens)
- Meal planning, coaching → Sonnet ($3/$15 per M tokens)
- Complex protocol generation, contradiction resolution → escalate to Sonnet with extended thinking

### Task 2.5: Photo Analysis with Memory + RAG

**Problem:** `app/api/ai/photo-analyze/route.ts` passes only `userId` and `requestId`. User preferences/allergies from memory are invisible.

**Fix:** Mirror the conversation route pattern:
```typescript
const memory = await readMemory({ userId, queryText: 'photo food analysis', scopes: ['user'] });
const knowledge = await retrieveKnowledge({ requesterId: userId, subjectUserId: userId, queryText: 'food photo' });
const systemPrompt = [PHOTO_SYSTEM_PROMPT, memory.systemPromptBlock, knowledge.systemPromptBlock].join('\n\n');
```

### Task 2.6: CGM/Wearable Integration via Terra API

**Impact:** Personalized nutrition recommendations based on glucose response

**Research basis:** Terra API provides unified access to Dexcom, Abbott FreeStyle Libre, and 500+ devices. Levels ($199/mo), Nutrisense, January AI all use CGM for nutrition personalization.

**Files:**
- Create: `lib/integrations/terra-client.ts`
- Create: `app/api/integrations/terra/callback/route.ts`
- Create: `app/api/integrations/terra/webhook/route.ts`
- Modify: `db/schema/wearable_data.ts` — add CGM-specific fields
- Create: `agents/insights/glucose-response.ts`

**Scope:** Start with glucose data from Terra. When a user logs a meal AND has CGM connected, correlate the post-meal glucose curve with the meal composition. Over time, build personalized glycemic impact profiles.

---

## PROGRAM 3: ENTERPRISE B2B PLATFORM

### Task 3.1: Organization Lifecycle API

**Files:**
- Create: `db/schema/invitations.ts`
- Create: `drizzle/0024_organization_lifecycle.sql`
- Create: `app/api/organizations/route.ts` — POST (create), GET (list)
- Create: `app/api/organizations/[orgId]/route.ts` — GET, PATCH, DELETE
- Create: `app/api/organizations/[orgId]/members/route.ts`
- Create: `app/api/organizations/[orgId]/invitations/route.ts`
- Create: `e2e/b2b-organization-lifecycle.spec.ts`

**Operations:** create org, invite member (by email), accept invitation, revoke invitation, remove member, change role, suspend org, transfer ownership, delete org (with data handling).

### Task 3.2: Stripe SaaS Billing

**Research basis:** Stripe Tax covers 100+ countries (Greece, Colombia, US). Metered billing via Usage Records API for AI features.

**Files:**
- Create: `db/schema/subscriptions.ts`
- Create: `drizzle/0025_subscriptions.sql`
- Create: `app/api/billing/checkout/route.ts`
- Create: `app/api/billing/portal/route.ts`
- Create: `app/api/billing/webhooks/route.ts`
- Create: `lib/billing/entitlements.ts` — plan → limits mapping
- Create: `e2e/billing-test-mode.spec.ts`

**Plan tiers:**
```
Starter:     5 coaches, 50 clients, 1000 AI calls/mo,  5GB storage  — $49/mo
Professional: 20 coaches, 200 clients, 5000 AI calls/mo, 25GB storage — $199/mo
Enterprise:  unlimited coaches/clients, unlimited AI,   100GB storage — $499/mo
Custom:      negotiated limits, SSO, DPA, dedicated support — custom
```

**Metered billing:** Track AI calls per org in `agent_runs`. Report usage to Stripe via Usage Records. Overage charges for Starter/Professional plans.

### Task 3.3: Privacy Request Fulfillment Pipeline

**Files:**
- Create: `lib/privacy/export.ts` — gather all user data → JSON → encrypted zip → presigned URL
- Create: `lib/privacy/delete.ts` — cascade-safe deletion with FK respect
- Create: `lib/privacy/retention.ts` — automatic retention policy enforcement
- Create: `app/api/privacy/process/route.ts` — fulfillment endpoint (admin)
- Create: `tests/privacy/fulfillment.test.ts`

**Export pipeline:** profiles + food_logs + conversations + memories + knowledge + wearable_data + agent_runs + consents → JSON per table → encrypted zip → Supabase Storage (signed URL, 7-day expiry) → email notification → audit trail

**Deletion pipeline:** Mark all user data for deletion → cascade through FKs → verify counts → anonymize audit_log entries → confirm completion → audit trail

**GDPR compliance clock:** 30 days from request. Alert at day 20. Escalate at day 25.

### Task 3.4: SSO/SAML for Enterprise

**Research basis:** 80% of B2B deals >$100K ARR require SSO. Supabase supports SAML 2.0 on Pro plan.

**Files:**
- Create: `db/schema/sso_configs.ts`
- Create: `drizzle/0026_sso_configs.sql`
- Create: `app/api/organizations/[orgId]/sso/route.ts`
- Create: `lib/auth/sso-handler.ts`

**Implementation:** Use Supabase's built-in SAML 2.0 support. Each org gets a unique `sso_provider_id` in JWT claims, usable in RLS policies. Support Okta, Azure AD, Google Workspace.

### Task 3.5: B2B Partner API & Webhooks

**Files:**
- Create: `db/schema/api_keys.ts`
- Create: `db/schema/webhooks.ts`
- Create: `drizzle/0027_api_keys_webhooks.sql`
- Create: `app/api/v1/` — versioned public API
- Create: `lib/webhooks/dispatcher.ts`

**API endpoints for partners:**
```
POST /api/v1/food/parse     — parse food text
POST /api/v1/food/barcode   — barcode lookup
GET  /api/v1/users/:id/logs — food log history
POST /api/v1/coaching/message — send coaching message
GET  /api/v1/org/usage      — usage analytics
```

**Webhooks:**
```
food.logged, meal.planned, coaching.message.sent,
member.invited, member.joined, subscription.updated
```

### Task 3.6: DPIA & Compliance Documentation

**Research basis:** GDPR requires DPIA for large-scale AI processing of health data (Article 35). EU AI Act requires transparency (Article 52).

**Files:**
- Create: `docs/compliance/dpia-ai-processing.md`
- Create: `docs/compliance/hipaa-scope-decision.md`
- Create: `docs/compliance/vendor-baa-matrix.md`
- Create: `docs/compliance/data-residency-policy.md`
- Create: `docs/compliance/ai-transparency-notice.md`

**Vendor BAA matrix (current status):**
| Vendor | BAA Available | Status |
|---|---|---|
| Supabase | ✅ Yes (HIPAA add-on, Pro plan) | Need to activate |
| Anthropic | ✅ Yes (Enterprise/API with DPA) | Need to execute |
| Google Cloud | ✅ Yes (org-level BAA) | Need to execute |
| Vercel | ✅ Yes (Pro/Enterprise) | Need to activate |
| Voyage AI | ❌ No public BAA | **CRITICAL GAP** — must self-host or switch to Anthropic embeddings |

**CRITICAL:** Voyage AI has no BAA. If embeddings touch identifiable health data, either:
1. Obtain BAA from Voyage (contact sales)
2. Self-host an embedding model (e.g., BGE-M3)
3. Switch to Anthropic's voyage-equivalent (when available)
4. Strip PII before embedding

---

## PROGRAM 4: PRODUCTION OPERATIONS

### Task 4.1: Staging Environment + Restore Drill

**Files:**
- Create: `.github/workflows/staging.yml`
- Create: `scripts/ops/backup-production.sh`
- Create: `scripts/ops/restore-drill.sh`
- Create: `RUNBOOK.md`

### Task 4.2: SLOs, Load Testing, Cost Reconciliation

**SLOs:**
```
Availability: 99.9% (8.7h downtime/year)
Food parse latency: p95 < 3s, p99 < 5s
Conversation latency: p95 < 5s, p99 < 8s
Safety: 100% (zero implausible nutrition values served)
Nutrition accuracy: ≥90% on enterprise eval
AI cost: ≤$0.03 per food parse, ≤$0.08 per conversation
```

**Load test:** 50 concurrent users, 500 food parse calls, 100 conversations, verify rate limiting and plan enforcement hold.

**Cost reconciliation:** Daily job comparing `agent_runs` totals with Anthropic/Google/Voyage billing dashboards.

### Task 4.3: Security Verification

**Files:**
- Create: `docs/threat-model-platform.md`
- Create: `docs/threat-model-ai.md`
- Create: `tests/security/tenant-isolation.test.ts` — cross-tenant data leak tests
- Create: `tests/security/prompt-injection.test.ts`
- Create: `tests/security/owasp-api.test.ts`

**OWASP API Top 10 verification:**
1. BOLA — test User A accessing User B's food_logs via ID manipulation
2. Broken Authentication — test expired tokens, invalid tokens, replay attacks
3. Excessive Data Exposure — verify API responses don't leak other users' data
4. Rate Limiting — verify 60 req/15min holds under load
5. BFLA — test coach accessing admin routes, client accessing coach routes
6. Mass Assignment — test adding fields not in request schema
7. SSRF — test if any API accepts URLs and follows them
8. Security Misconfiguration — verify security headers, CORS, CSP
9. Improper Inventory — document all API endpoints, verify no undocumented routes
10. Unsafe Consumption — verify all upstream API responses are validated

---

## PROGRAM 5: PRODUCT PROOF & DOCUMENTATION

### Task 5.1: Authenticated E2E Coverage

**Requirements:** Provision 4 E2E accounts (client, coach, admin, super_admin). Run all role flows in CI. Target: 60% line coverage overall, 85% on critical modules.

### Task 5.2: Admin Dashboard Enhancements

**Add to `app/api/admin/costs/route.ts`:**
- `byOrganization` — per-org cost, user count, AI call count
- `topUsers` — highest-cost users with per-task breakdown
- `modelBreakdown` — per-model spend, cache hit ratio, latency percentiles (p50, p95, p99)
- `nutritionQuality` — live accuracy tracking from eval results
- `memoryHealth` — facts written/read per day, supersedence rate
- Export to CSV for finance reporting

### Task 5.3: Documentation Reset

- `README.md` — accurate architecture diagram, quick start, API reference
- `DEPLOYMENT.md` — preview → staging → production workflow
- `RUNBOOK.md` — incident response, rollback, key rotation, provider outage
- `SECURITY.md` — controls inventory, penetration test schedule
- `docs/enterprise-readiness.md` — evidence packet for B2B sales
- `docs/api-reference.md` — complete v1 API documentation
- Archive all stale audit documents

---

## EXECUTION ORDER & CHECKPOINTS

```
PHASE 1: DATA FOUNDATION (Tasks 1.1-1.4) ─── 1 week
├── Gate: 80+ Greek foods in DB, 150+ aliases, unit conversions populated
├── Gate: USDA FDC ingest running (Foundation + SR minimum)
├── Gate: Decompose fallback uses category-aware defaults
└── Gate: All existing tests still passing

PHASE 2: AI RELIABILITY (Tasks 1.5-1.7, 2.1-2.2) ─── 1 week
├── Gate: Structured output replaces regex extraction
├── Gate: 200+ eval cases, ≥85% pass rate
├── Gate: RAG + Memory evals passing
├── Gate: Durable memory write system deployed
└── Gate: Food parse eval NO LONGER SKIPPED

PHASE 3: INTELLIGENCE (Tasks 1.2, 2.3-2.6) ─── 1 week
├── Gate: Open Food Facts integration live (barcode scanning)
├── Gate: Memory contradiction detection working
├── Gate: Multi-model fallback chain deployed
├── Gate: Photo analysis uses memory + RAG context
└── Gate: 200+ eval cases, ≥90% pass rate

PHASE 4: COMMERCIAL (Tasks 3.1-3.6) ─── 2 weeks
├── Gate: Org lifecycle E2E passing
├── Gate: Stripe test-mode checkout/portal/webhook passing
├── Gate: Privacy fulfillment (export + delete) E2E passing
├── Gate: SSO/SAML working with test IdP
├── Gate: DPIA documented, vendor BAA matrix complete
└── Gate: Voyage AI BAA gap resolved

PHASE 5: HARDENING (Tasks 4.1-4.3) ─── 1 week
├── Gate: Staging environment operational
├── Gate: Restore drill passes with documented RTO
├── Gate: Load test passes at 50 concurrent users
├── Gate: Tenant isolation tests passing
├── Gate: OWASP API security tests passing
└── Gate: Zero high/critical findings

PHASE 6: PROOF (Tasks 5.1-5.3) ─── 1 week
├── Gate: Authenticated E2E all passing in CI
├── Gate: Admin dashboard with org/model/latency breakdowns
├── Gate: Documentation current and evidence-backed
└── FINAL: 200+ eval at ≥90%, all E2E green, all gates passed

PHASE 7: MARKET PROOF (cannot be automated) ─── 30 days
├── Gate: 5 design partners onboarded without DB intervention
├── Gate: ≥99.9% measured availability over 30 days
├── Gate: No unresolved severity-one incidents
└── 100/100 AWARDED
```

---

## SCORING PROJECTION

| After Phase | Score | Key Evidence |
|---|---|---|
| Current | 72/100 | 43% nutrition eval, no RAG/memory eval, no B2B |
| Phase 1 | 78/100 | Greek food data seeded, decompose fixed |
| Phase 2 | 85/100 | Structured output, 200+ evals, durable memory |
| Phase 3 | 89/100 | OFF integration, contradiction detection, fallback chains |
| Phase 4 | 94/100 | Full B2B lifecycle, billing, privacy, SSO, compliance docs |
| Phase 5 | 97/100 | Staging, load test, security verification, restore drill |
| Phase 6 | 98/100 | Full E2E, documentation, admin dashboard |
| Phase 7 | 100/100 | 5 design partners + 30-day soak |

---

## RESEARCH CITATIONS

### Food Databases
- USDA FDC: https://fdc.nal.usda.gov/ — 415K+ foods, 150 nutrients, public domain, 1000 req/hr
- Open Food Facts: https://world.openfoodfacts.org/ — 3M+ products, ODbL license, 100 req/min
- FatSecret: 2.3M foods, 58 countries, Premier tier for international
- Edamam: 900K foods, 160 nutrients via Vision API, $14-$299/mo
- HelTH: 4,002 Greek branded foods, 45 nutrients (Katidi et al., Food Chemistry 2021, DOI: 10.1016/j.foodchem.2021.129010)
- HHF: Trichopoulou 2004, ~300 Greek foods/recipes, 60 nutrients, canonical reference
- FoodOn: 9,600+ food classes, OWL ontology (foodon.org)
- FAO/INFOODS: International nutrient tag names standard

### AI/RAG
- ArXiv 2603.09704: LLM evaluation for food/nutrition RAG — Claude F1=0.450 on hard queries (best)
- NutriBench (ICLR 2025): 11,857 meals, GPT-4o+CoT 66.82% accuracy at 7.5g tolerance
- PlateLens: 94.3% food ID accuracy, ±1.2% MAPE portion estimation
- Anthropic structured output: <0.2% failure rate across 300K calls
- RouteLLM (ICLR 2025): 85% cost reduction maintaining 95% quality
- LoCoMo benchmark: Letta ~83.2%, Zep ~85%, Mem0 ~58-66%
- BGE-M3: 100+ languages, unified dense+sparse, nDCG@10 boost 5-10%

### Greek Nutrition
- Trichopoulou 2004: "Composition Tables of Foods and Greek Dishes" 3rd ed., Parisianou Publications
- HYDRIA survey (2013-2014, n=4,011): Canonical Greek portion size data
- HYDRIA digital food photography atlas: Validated at 90% portion identification (PubMed 26917048)
- Greek dietary guidelines: National Nutrition Guide for Greek Adults (1999, updated 2014)
- USDA Nutrient Retention Factors Release 6 for cooking method adjustments
- Trichopoulou micronutrient study: Springer 2009, DOI: 10.1007/s12349-009-0045-4

### Enterprise/Compliance
- GDPR Article 35: DPIA mandatory for large-scale AI processing of health data
- SOC 2 Type II: $20-60K, 9-month timeline, Security + Availability + Confidentiality + Privacy + Processing Integrity
- Voyage AI: No public BAA found — critical gap for PHI-derived embeddings
- Supabase HIPAA add-on: Available on Pro plan
- Anthropic BAA: Available for Enterprise/API with DPA
- Vercel BAA: Pro and Enterprise plans (self-serve click-through)
- EU AI Act: Nutrition AI likely NOT high-risk (Annex III), but transparency obligations apply
- Terra API: Unified CGM access (Dexcom, Abbott, 500+ devices)
- Stripe Tax: 100+ countries including Greece (VAT), Colombia (IVA), US (sales tax)

### Competitive Intelligence
- Nutritics: 1M+ foods, 258 nutrients, €30/mo+ — deepest food data
- Healthie: Only nutrition platform with SOC 2 + HIPAA — $19-$279/mo
- Noom: 250 B2B partners, 300-400 users/coach — largest scale
- Foodvisor: 87% food ID accuracy — best CV for food
- **Market gap confirmed: No platform combines all four capabilities**

---

## NOTES FOR CODEX

1. **Start with Task 1.3 (Greek food database).** It's the highest impact-to-effort ratio. Every Greek eval failure traces back to missing food data.
2. **Run `npx vitest run` after every change.** Current: 260 passing. Never let this number drop.
3. **Commit data seeds separately from code changes.** Benchmark drift must be reviewable.
4. **ALL nutrition values in seed data must cite a source.** USDA FDC ID, Trichopoulou page number, or cross-reference methodology.
5. **Do NOT deploy auth changes with any other change.** Dedicated preview cycle.
6. **Fix the eval auth token issue FIRST in Phase 2.** Food parse eval being SKIPPED means the core feature is untested.
7. **The conversation route (`app/api/ai/conversation/route.ts`) is the reference implementation.** Every other AI route should eventually mirror its memory + RAG + coaching pattern.
8. **Voyage AI BAA is a blocking compliance issue.** Research and resolve before Phase 4 compliance docs.
9. **Greek macro values: use Trichopoulou as primary, USDA as secondary.** When they conflict, Trichopoulou is more authoritative for Greek dishes.
10. **Max 3 Vercel deploys per session.** Local preview catches most issues.
11. **Production is live with real users.** Zero-risk deploys only. Preview → smoke → prod.
12. **The market gap is real.** No competitor has clinical data + AI + compliance + coaching. Execute with urgency.
