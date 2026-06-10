# DietAI24: A Multilingual Benchmark for LLM-Based Nutrition Estimation

**Version**: 1.0 (June 2026)
**Authors**: Daniel Reyes
**System**: Trophē (trophe.app)

---

## Abstract

We present DietAI24, a multilingual benchmark for evaluating LLM-based nutrition estimation from free-text food descriptions. The benchmark comprises 549 cases across 13 categories in 4 languages (English, Spanish, Greek, French) plus mixed/code-switched inputs. Macro ranges are calibrated against USDA FoodData Central and CIQUAL 2025. We evaluate a deterministic hybrid pipeline (LLM extraction + database lookup + CoT arbitration) achieving 79.2% pass rate, 8.4% calorie MAPE, and 43.8% Acc@7.5 on our multilingual dataset. Our approach demonstrates that coupling LLM parsing with curated food databases produces consistent, reproducible nutrition estimates across languages.

---

## 1. Introduction

Nutrition estimation from natural language is a growing application of large language models, yet evaluation methodology remains fragmented. Consumer apps report accuracy anecdotally. Academic benchmarks like NutriBench (ICLR 2025) focus on English-only meal descriptions. No published benchmark covers multilingual input, composite dishes, code-switching, or adversarial cases in a single evaluation suite.

DietAI24 addresses these gaps with:
- **4 languages**: EN, ES, EL, FR (covering 1.5B+ speakers)
- **13 categories**: from simple base foods to adversarial misspellings and code-switched inputs
- **Dual metrics**: per-macro MAPE (internal) and Acc@7.5 (NutriBench-compatible)
- **Reference-validated**: every case's expected ranges verified against USDA or CIQUAL lab data

---

## 2. Related Work

### 2.1 Academic Benchmarks
- **NutriBench** (Lo et al., ICLR 2025): 11,857 meal descriptions, Acc@7.5 metric. GPT-4o achieves 66.8%, GPT-4o+CoT 58.2%. English only.
- **Nutrition5k** (Thames et al., 2021): 5,006 dish images with macro labels. Image-based, not text.
- **FoodLLM** (Yin et al., 2024): Evaluates LLMs on food knowledge tasks. Does not benchmark parsing pipelines.

### 2.2 Consumer App Studies
- Tran et al. (2019): MyFitnessPal users underestimate calories by 10-41%.
- Evenepoel et al. (2020): Dietary apps show 7-27% energy estimation error.

### 2.3 Commercial APIs
Nutritionix, Edamam, and Spoonacular offer text-to-nutrition APIs but publish no standardized benchmarks. Database sizes range from 300K (Nutritionix) to 900K+ (Open Food Facts) items, but accuracy metrics are proprietary.

---

## 3. System Architecture

### 3.1 Pipeline Overview (v7)

```
User Input (free text, any of 4 languages)
    │
    ▼
LLM Extraction (DeepSeek V4 Flash)
    │  outputs: {food_name, qty, unit, per-100g CoT estimates}
    ▼
Database Lookup (BM25 + pgvector hybrid, RRF merge)
    │  searches: 11,396 foods (USDA 7,899 + CIQUAL 3,323 + others)
    │  also: 3,837 aliases, 210+ dish recipes, 1,050+ unit conversions
    ▼
Arbitration (DB vs CoT)
    │  explicit portions → DB wins
    │  <30% divergence → DB wins
    │  >30% divergence → LLM grams × DB per-100g ratios
    │  high-confidence DB (≥0.85) → always DB
    ▼
Final Macros (calories, protein, carbs, fat per item)
```

### 3.2 Key Design Decisions

1. **LLM identifies, DB quantifies**: The LLM extracts what the food is and how much. The database provides authoritative nutritional data. This separation means LLM hallucinations about macro values are caught by DB lookup.

2. **Hybrid retrieval**: BM25 (text search) + pgvector (semantic embeddings) with Reciprocal Rank Fusion. Neither alone achieves sufficient recall across 4 languages.

3. **CoT as fallback, not primary**: Chain-of-thought macro estimates are used only when DB lookup fails or diverges significantly. This keeps accuracy anchored to lab-verified data.

---

## 4. Dataset Construction

### 4.1 Generation Methodology

Cases are generated via a structured LLM-assisted workflow:

1. **Category specification**: 13 categories with target counts and language distributions
2. **LLM generation**: DeepSeek V4 Flash generates candidate cases in exact JSON schema
3. **DB cross-reference**: Expected macro ranges validated against USDA/CIQUAL lookup
4. **Human review**: 20% spot-check of generated cases
5. **Automated validation**: Script verifies expected ranges within 15% of DB reference values

### 4.2 Category Taxonomy

| Category | Count | Description |
|---|---|---|
| base_food | 120 | Single whole foods with explicit quantities |
| composite | 90 | Prepared dishes (quiche, moussaka, tacos) |
| multi_item | 50 | Full meal descriptions with multiple foods |
| beverages | 30 | Drinks including alcohol, coffee, smoothies |
| regional_cuisine | 25 | North African, Caribbean, Lebanese foods |
| code_switch | 30 | Mixed-language inputs |
| adversarial | 30 | Misspellings, emoji, slang, ambiguity |
| vague_quantity | 25 | "a bit of", "some", "a handful" |
| clarification | 25 | Ambiguous inputs requiring follow-up |
| branded | 30 | Brand-name products |
| supplements | 20 | Whey, creatine, BCAA |
| bakery | 25 | Bread, pastries, baked goods |
| seafood | 20 | Fish, shellfish, prepared seafood dishes |
| **Total** | **549** | |

### 4.3 Language Distribution

~30% English, ~25% French, ~20% Spanish, ~15% Greek, ~10% mixed/code-switched.

### 4.4 Ground Truth

Expected ranges (min/max per macro) are derived from:
- **USDA FoodData Central** (SR Legacy + Foundation): lab-analyzed, 7,899 foods
- **CIQUAL 2025** (ANSES, France): lab-verified, 3,323 foods
- **Manual curation**: for composite dishes, expected ranges computed from ingredient decomposition

---

## 5. Evaluation Protocol

### 5.1 Pass Criteria

A case passes if ALL reported macros fall within the expected min/max range for that case. Cases with `expect_needs_clarification: true` pass if the system requests clarification.

### 5.2 Metrics

- **Pass Rate**: % of cases where all macros within expected ranges
- **Per-Macro MAPE**: Mean Absolute Percentage Error vs range midpoint, computed separately for calories, protein, carbs, fat
- **Acc@7.5** (NutriBench-compatible): % of cases where ALL 4 macro predictions are within 7.5% of reference simultaneously

### 5.3 Nondeterminism Handling

LLM outputs are nondeterministic. We observe ±3 case variance across runs (±1.4%). Results are reported as point estimates with this known variance band.

### 5.4 Baseline Comparisons

- **Raw LLM (no DB)**: Same pipeline with database lookup disabled. LLM CoT estimates only.
- **Raw GPT-4o**: Direct prompting without pipeline infrastructure.
- **NutriBench reference**: Published Acc@7.5 scores from Lo et al. (2025).

---

## 6. Results

<!-- TODO: Fill after benchmark runs complete -->

### 6.1 Overall Performance

| Metric | DietAI24 (v7 pipeline) | GPT-4o (NutriBench) |
|---|---|---|
| Pass Rate (own benchmark) | 79.2% (549 cases) | — |
| Calorie MAPE | 8.4% | — |
| Protein MAPE | 11.0% | — |
| Carbs MAPE | 13.3% | — |
| Fat MAPE | 14.4% | — |
| Acc@7.5 | 43.8% | 66.8% |

### 6.2 Per-Category Breakdown

<!-- Generated from benchmark results -->

### 6.3 Per-Language Performance

<!-- Generated from benchmark results -->

---

## 7. Database Coverage

| Source | Foods | License | Data Quality |
|---|---|---|---|
| USDA FoodData Central | 7,899 | Public domain | Lab-analyzed |
| CIQUAL 2025 (ANSES) | 3,323 | Etalab Open License 2.0 | Lab-verified |
| HealthyHarvest Foods | 86 | Custom | Curated |
| MenuStat | 48 | Public | Restaurant-reported |
| Chain restaurants | 28 | Public | Company-reported |
| Custom entries | 12 | — | Manual |
| **Total** | **11,396** | | |

Supporting data: 3,837 food aliases (4 languages), 210+ dish recipes, 1,050+ unit conversions, 80+ common piece weights.

---

## 8. Limitations

1. **4 languages**: Does not cover Chinese, Hindi, Arabic, or other high-population languages
2. **Branded food coverage**: Limited to ~30 branded items. Real-world branded food queries are common.
3. **Portion estimation**: System defaults (e.g., "a chicken breast" = 170g) are culturally biased toward Western portions
4. **Image input**: Benchmark is text-only. Photo-based food logging is not evaluated.
5. **Temporal drift**: Food product formulations change. USDA/CIQUAL data has a snapshot date.
6. **LLM-generated cases**: Despite cross-validation, some expected ranges may not perfectly match real-world nutritional variance.

---

## 9. Reproducibility

- **Dataset**: `agents/evals/datasets/nutrition-enterprise-v3.json` (JSON, documented schema)
- **Eval script**: `scripts/eval/run-nutrition-enterprise-prod.ts` (TypeScript, open source)
- **Reference databases**: USDA FoodData Central (public), CIQUAL 2025 (open license)
- **History**: All benchmark runs logged to `agents/evals/results/nutrition-enterprise-history.jsonl`

---

## References

1. Lo, K., et al. "NutriBench: A Dataset for Evaluating Large Language Models in Nutrition Estimation." ICLR 2025.
2. Thames, Q., et al. "Nutrition5k: Towards Automatic Nutritional Understanding of Generic Food." CVPR 2021.
3. Yin, F., et al. "FoodLLM: A Large Language Model for Food Computing." 2024.
4. Tran, V., et al. "Accuracy of energy intake estimation using MyFitnessPal." 2019.
5. Evenepoel, C., et al. "Accuracy of nutrient calculations using the consumer-focused online app MyFitnessPal." 2020.
6. USDA FoodData Central. https://fdc.nal.usda.gov/
7. ANSES CIQUAL. https://ciqual.anses.fr/
