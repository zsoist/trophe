# Nutrition Accuracy Audit — 2026-05-02

## Bottom Line

Trophē should not claim that all nutrition numbers are "fully exact." The accurate production standard is:

1. Identify food and quantity from user input.
2. Resolve grams deterministically.
3. Compute macros from authoritative per-100g data.
4. Mark anything not database-backed as an estimate with lower confidence.

This pass tightened the code to match that standard.

## Evidence From Current Research

- USDA FoodData Central is the right primary data source for U.S. foods. The API exposes food search and food-detail endpoints and includes Foundation Foods, SR Legacy, Global Branded Foods, and FNDDS data.
- USDA notes that food values are a snapshot in time and vary by sampling, formulation, location, and analytical/computational method. Energy is physiologically available energy, and carbohydrate by difference is computed from other components.
- LLM-only macro estimation remains risky. NutriBench shows the field is improving, but LLMs are evaluated against human-verified macro labels because unaided estimation is not ground truth.
- A 2025 NHANES text-recall LLM experiment reported poor vanilla LLM results, including energy MAE of 652 kcal and Lin's CCC below 0.46; fine-tuning improved results but still does not replace a deterministic database pipeline.
- Image-based dietary assessment research consistently identifies portion-size estimation as the hard problem. Photo recognition can identify foods, but calorie accuracy depends on weight/volume, density, and preparation.

## Fixes Made

- Food parse fallback no longer promotes static fallback enrichment to `local_db` or inflates confidence to 0.9.
- Recipe analysis now recomputes recognized ingredient macros with `lookupFoodBatch()` and sums totals/per-serving from the recalculated ingredients.
- Unrecognized recipe ingredients remain `ai_estimate` and confidence is capped.
- Photo analysis now explicitly returns `source: "ai_estimate"`, caps confidence at 0.75, and includes an accuracy note.
- Added tests for these guardrails in `tests/agents/nutrition-accuracy.test.ts`.

## Current Accuracy Boundary

High confidence:
- Text food parse where the food is found in `foods`.
- Unit conversion resolved through `food_unit_conversions` or curated matching default serving.
- Recipe ingredients that resolve through `foods`.

Estimate only:
- Unknown foods not present in `foods`.
- Vague servings without grams.
- Photo-only macro estimates.
- Restaurant/composite dishes where recipe, oil, and serving weight are unknown.

## Required Next Improvements

1. Add UI copy/badges for `local_db` vs `ai_estimate`.
2. For `ai_estimate` entries, ask the user to confirm grams or serving size before saving to `food_log`.
3. Expand `food_unit_conversions` for common Greek, Colombian, and packaged foods actually used by testers.
4. Add a nutrition-data provenance view for coach/admin review: source, source_id, data_quality, grams, conversion row.
5. For photo logging, prefer "identify food + ask for weight" over direct macro save.

## References

- USDA FoodData Central API Guide: https://fdc.nal.usda.gov/api-guide
- USDA FoodData Central FAQ, energy and data variability: https://fdc.nal.usda.gov/faq/
- NutriBench, ICLR 2025 / arXiv 2407.12843: https://arxiv.org/abs/2407.12843
- LLMs for energy and macronutrients estimation from 24-hour recalls, arXiv 2509.13268: https://arxiv.org/abs/2509.13268
- AI-based digital image dietary assessment systematic review: https://pmc.ncbi.nlm.nih.gov/articles/PMC10836267/
- Portion size estimation systematic review: https://pubmed.ncbi.nlm.nih.gov/31999347/
