# Frontier AI food-macro estimation — research brief (2026-06-13)

Distilled from 2024–2026 literature to push Trophē's nutrition model to best-in-market. All
numbers from primary sources; use as the bar to beat and the levers to pull.

## Measured prod baseline (2026-06-13, 100% DeepSeek)
Datasets in repo: **v2 = 210 cases**, **v3 = 700 cases** (no 500-case file exists yet — "official
500" must be built, ideally from Michael's validated Greek list).
- **v2 (210):** pass **94.8%** · cal-MAPE **13.2%** (signed −10.7%) · protein 16.6% · carbs 16.4% ·
  **fat 21.3%** · Acc@7.5(all-4-macros) 8.7% · dbResolved 71% · p50 4.2s / p95 6.8s. Sources: 190 local_db + 52 llm_cot (zero Anthropic — confirms DeepSeek-only).
- **v3 (700, backup):** pass **75.6%** (529/700) · cal-MAPE 17.9% · protein 24.1% · carbs 22.0% · **fat 25.7%** · dbResolved 60.9% · p95 7.0s. The official(210)→backup(700) gap is the Greek-weighted difficulty + research-derived (not-yet-Michael-validated) ranges on the +490 harder cases.
- NOTE: our Acc@7.5 = *all 4 macros simultaneously within ±7.5%* (much stricter than NutriBench's carbs-only Acc@7.5 of ~67%). Not directly comparable — report the metric definition.

## The bar (benchmarks to score against)
- **NutriBench** (ICLR 2025) — 11,857 NL meal descriptions, 24 countries (v2). Metric =
  **Acc@7.5g** (within ±7.5g carbs), plus MAE(g) and **Answer Rate**. *Published eval scores carbs only.*
  - SOTA: **GPT-4o + CoT = 66.8% Acc@7.5, MAE 8.61g, AR 99%.** Fine-tuned Gemma-2-27B: 61.7%, MAE 9.57g.
  - Naive **RAG gave minor/inconsistent gains** (helped some models, hurt others) — matches our reverted vector-arm result. Gate RAG on retrieval confidence.
  - LLMs beat human nutritionists on the 72-meal subset, far faster.
- **FoodBench-QA 2026** (recipe text, EU 1169/2011 tolerance bands): **fat is the hardest macro
  from text** — 40–54% vs protein 64–68%. Hybrid (TF-IDF+LLM) ≈ pure LLM.
- **Food-photo VLMs** (PMC 2025, MAPE): ChatGPT-4o/Claude ~36% energy, but **protein is hardest
  from images** (60–110% MAPE) — driven by food *mis-identification* (falafel→meatballs = +360%).
- **Few-shot / fine-tune** (arXiv 2509.13268): energy MAE 652 → ~180 kcal with 10-shot — ~3.4× cut.
- **Context injection** (ACETADA 2507.07048): cuisine/meal-type/region in prompt measurably lowers MAE/MAPE.

**Adopt:** Acc@7.5 / Acc@10 / Acc@15 + MAE + MAPE + Answer Rate, per macro. Benchmark against the
NutriBench dataset for a credible "most accurate" claim + academic paper (target 1,000–1,500 cases).

## The hard macro
- **Fat = hardest from text; protein = hardest from images.** Both fixed by the SAME mechanism:
  **decompose to ingredients → DB-ground each → sum**, because fat/protein hide in components
  (cooking oil, fatty cuts, cheese, tahini) a holistic guess misses.
- **Fat specifically:** explicitly prompt for *added cooking oil/fat* and reconcile via Atwater —
  added oil is the single largest fat-estimation error in home/restaurant dishes.

## Levers (ranked by evidence)
1. **Ingredient decomposition → per-ingredient grams → DB lookup → sum.** LLM decomposition is
   strong (Llama-3-70B F1 0.89); *quantity* assignment is the weak link — emit per-ingredient grams and reconcile to a stated total.
2. **RAG/DB grounding — gated on retrieval-match confidence.** Fall back to LLM-only when no high-similarity hit (naive RAG can hurt).
3. **Atwater 4/4/9 (+7 alcohol) consistency check** — flag/repair when stated kcal diverges >~10% from macro-implied. Use a tolerance band (Atwater is itself ±).
4. **Contextual metadata** — pass region=Greek, typical portions, meal-type.
5. **Few-shot with local dishes** — high ROI even without fine-tuning.
6. **Confidence calibration / abstention** — track Answer Rate; prefer a range or clarifying Q over a confident wrong number.

## Raw→cooked YIELD factors (USDA + FAO/Bognár) — the dominant cooked-vs-raw correction
Macros are ~conserved (retention 0.90–1.00; default 1.0); the big correction is **weight yield**.
- **Meat** roast/grill/fry: cooked = raw × **0.70–0.75** (default 0.72). Braised/boiled × **0.62–0.65**. Ground-beef patties 0.69–0.77.
- **Fish** fried/steamed × **0.80**; whole boiled × 0.55–0.60.
- **Rice** dry × **~3.0**; **pasta** dry × **~2.5**; **dry legumes** × **~2.6**.
- **Veg** mostly 0.85–0.99 (carrot 0.94, spinach 0.95; onion caramelized 0.42–0.83).
- **Fried/breaded:** add explicit **fat-uptake** (g per 100g raw), don't model as a retention multiplier.
Sources: USDA Cooking Yields for Meat & Poultry (2012); FAO/Bognár weight-yield + retention tables.

## Portion → grams backbone
- **Precision Nutrition hand portions** (coach UX, ±~50% on grams): protein = 1 palm ≈ 20–30g protein (~85–115g cooked meat); carbs = 1 cupped hand ≈ 20–30g carb (~½–⅔ cup cooked grain); fat = 1 thumb ≈ 7–12g fat (~1 tbsp); veg = 1 fist ≈ 1 cup.
- **USDA FNDDS Portion file** (precision, 35k+ portion→gram entries) — license/encode as backbone.
- Concrete defaults: cooked rice ~200g/cup; cooked pasta ~140g/cup; bread slice ~25–28g; large egg ~50g; raw chicken breast ~174g; medium apple ~182g; medium banana ~118g; generic medium fruit ~150g.
- **Michael's heuristics** (encode + confidence-flag): 1 fruit = palm-fit ≈ 60 kcal (banana=2, melon≈4, 2 kiwis=1); beef patty = palm ≈ 200g raw / 170–180g cooked.

## Greek dish sanity bands (validate vs USDA FDC / Greek table before encoding)
- **Fakés (lentil soup)** bowl: ~186–263 kcal, C 33–43 / P 11–16 / F 1–4 (+1 tbsp EVOO ≈ +14g fat).
- **Gigantes plaki** serving (~1 cup): ~196 kcal, P ~4 / C ~13 / **F ~14** (oil-heavy).
- **Fava** ½-cup served: ~180–220 kcal, C ~22–28 / P ~9–11 / F ~8–12 (oil-dependent). Raw split peas/100g: 341 kcal, C 60 / P 25 / F 1.
- **Moussaka** /100g: ~169 kcal, P 7 / F 8 / C ~10; serving ~500–600 kcal.
- **Horiátiki** serving (~250g): ~230–280 kcal, C ~10 / P ~6–8 / **F ~20** (feta + EVOO — fat underestimated if not decomposed).
- **Souvlaki** (chicken, meat only ~150g): ~200 kcal, P 30 / F 8; wrap (pita+tzatziki+fries) ~600–800 kcal — decompose.

## Bottom line for the build (Wave 3 — frontier accuracy)
Encode yield factors + portion heuristics into `food_unit_conversions.qualifier` + a new
`lib/food-yields.ts` / `lib/portion-heuristics.ts`; add few-shot Greek exemplars; gate the vector
arm on confidence; add Atwater reconciliation + an explicit added-oil prompt in food-parse; expand
the benchmark toward 1,000–1,500 and add a NutriBench-scored run for the "most accurate" claim.
