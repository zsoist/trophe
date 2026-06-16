> ⚠️ SUPERSEDED (2026-06-15): point-in-time plan from 2026-06-08. The 76/210 (36.2%) baseline and Phase 0-6 plan are obsolete. Current state — validated 549-set ~90% pass / 700-set 76.7% / v2 210-set ~94-95% / pooled MAPE 16.0%; work now tracked as Enterprise Remediation WP0-WP7 (WP0-WP3 LIVE). See docs/nutrition-engine-roadmap.md, SPEC.md, docs/superpowers/specs/2026-06-14-mape-reduction-deterministic-design.md, and docs/audits/remediation-status-2026-06-15.md.

# Trophē Nutrition Frontier Plan

Date: 2026-06-08

## Current Evidence

Production benchmark: 76/210 cases pass (36.2%), p50 1.56s, p95 3.79s.

| Failure cluster | Failed cases | Dominant issue |
|---|---:|---|
| Composite dishes | 41/55 | Recipe identity, decomposition, regional portions |
| Base foods | 31/65 | Food matching and household-unit conversions |
| Multi-item meals | 13/15 | Per-item portions accumulate into large overestimates |
| Code-switch | 10/15 | Cross-language identity and portion mapping |
| Branded | 9/10 | Missing label/serving records and bad generic fallbacks |
| Bakery | 7/10 | Missing food-specific piece weights |
| Vague/clarification | 14/20 | Provisional estimates are too confident or too large |
| Adversarial | 5/15 | Repetition and extreme-quantity policy gaps |

Across 129 failing cases with expected calorie ranges:

- 46 are overestimated by more than 1.5x.
- 19 are underestimated below 0.67x.
- 64 are near the expected center but fail one or more strict checks.

This is primarily an ontology, portion, and retrieval problem. It is not primarily
an extraction-model problem.

## Evidence-Based Principles

1. **Use food-specific measured portions.** USDA FoodData Central states that
   portion weights are specific to each food/data type and should be used to
   calculate nutrients from values per 100 g.
2. **Prefer the correct USDA data type.** Use Foundation/SR for basic foods,
   FNDDS for foods as consumed and reported in dietary recalls, and Branded
   Foods for current product labels. Branded data updates monthly.
3. **Treat portion uncertainty as uncertainty.** Research consistently identifies
   portion estimation as a major source of dietary-assessment error. Amorphous
   foods, liquids, and mixed meals are harder than single-unit foods.
4. **Require user verification for uncertain portions.** Reviews of automated
   dietary assessment conclude that reliable fully automated portion estimation
   is not yet achievable without some user feedback.
5. **Report error distributions, not one pass rate.** NIST guidance warns that
   benchmark summaries can conflate different performance concepts and hide
   uncertainty.

## Target Metrics

The release gate must report these separately:

| Metric | Initial production target | Frontier target |
|---|---:|---:|
| Food identity top-1 accuracy | >=95% | >=98% |
| Explicit quantity/unit parse accuracy | >=98% | >=99.5% |
| Base-food calorie MAPE | <=12% | <=7% |
| Composite calorie MAPE | <=20% | <=12% |
| Macro MAPE by nutrient | <=20% | <=12% |
| Unsafe/non-food rejection recall | >=98% | >=99.5% |
| Clarification recall on ambiguous portions | >=95% | >=98% |
| High-confidence calibration error | <=5% | <=3% |
| p95 parse latency | <=4s | <=2.5s |
| DB-resolved parse rate | >=85% | >=95% |

A case-level all-or-nothing pass rate remains useful, but cannot be the only
quality measure.

## Execution Plan

### Phase 0: Make Evaluation Statistically Honest

Expected impact: prevents regressions and makes all later gains measurable.

1. Split the 210 cases into immutable development, validation, and holdout sets.
2. Run each stochastic case at least three times; report mean, variance, and
   worst-run behavior.
3. Add food identity, grams, source, confidence, MAPE, signed bias, and
   clarification metrics.
4. Validate expected ranges with a registered dietitian or documented USDA/FNDDS
   references; record provenance per case.
5. Add a non-skippable production canary subset and a nightly full-suite run.

Acceptance:

- No skipped authenticated nutrition gate.
- Every case has ground-truth provenance.
- Reports distinguish extraction, identity, portion, nutrient, and safety errors.

### Phase 1: Portion Ontology and Provenance

Expected impact: +35 to +50 cases, primarily base foods, bakery, seafood, vague
quantities, and multi-item meals.

1. Import USDA `food_portion` rows and retain FDC ID, gram weight, amount,
   measure, data type, and acquisition year.
2. Create a versioned `food_portions` table instead of mixing universal and
   food-specific conversions without provenance.
3. Add regional measured portions for Greek and Colombian foods from documented
   sources; require reviewer/source metadata.
4. Replace generic `piece=80g` and `serving=100g` with category-specific
   conservative priors only when no measured portion exists.
5. Introduce dense-food safeguards: inferred oil, butter, sauces, nuts, and
   spreads use small provisional portions and always request clarification.

Acceptance:

- No ambiguous pure-fat estimate exceeds 2 tbsp without explicit quantity.
- No countable food uses a universal piece weight when a food-specific portion exists.
- Portion provenance is visible in parse telemetry.

### Phase 2: Retrieval as Typed Entity Resolution

Expected impact: +20 to +30 cases and lower catastrophic mismatch risk.

1. Classify query intent before retrieval: base food, composite, brand/product,
   restaurant item, ingredient, or non-food.
2. Use hard compatibility constraints for state, brand, food class, and
   preparation before ranking.
3. Store aliases as typed relations rather than broad substring corrections.
4. Require a minimum lexical/entity score; weak matches route to clarification
   or governed estimation instead of selecting an unrelated DB row.
5. Build a curated hard-negative retrieval suite, including:
   milk vs mozzarella, salad vs dressing, tuna vs tuna salad, rice vs rice dish,
   bacon vs bacon bits, and Oreo vs McFlurry.

Acceptance:

- >=98% top-1 identity accuracy on the hard-negative suite.
- Zero known catastrophic semantic substitutions.

### Phase 3: Composite Dish and Multi-Item Architecture

Expected impact: +30 to +45 cases.

1. Normalize every cached recipe to one explicit serving with provenance.
2. Store serving-weight distributions, not a single unqualified serving number.
3. Separate dish identity from ingredient decomposition and portion scaling.
4. Retrieve curated regional recipes first; use LLM decomposition only on cache
   miss and never cache without plausibility/provenance checks.
5. For multi-item meals, apply a meal-level plausibility pass that detects
   accumulated default portions and asks one targeted clarification.

Acceptance:

- Composite calorie MAPE <=20%.
- No ordinary single meal exceeds 1,500 kcal without explicit quantities or a
  clarification warning.
- Repeated parses of the same explicit meal vary by <=5%.

### Phase 4: Branded Food Pipeline

Expected impact: +7 to +9 branded cases.

1. Sync current USDA Branded Foods monthly.
2. Match barcode/brand/product/serving label as a distinct retrieval path.
3. Add label serving weights and package-unit conversions.
4. Never map a branded product to a restaurant dessert or generic category when
   brand identity is unresolved.

Acceptance:

- >=95% branded top-1 match accuracy.
- All branded results expose label source and serving date/version.

### Phase 5: Confidence and Clarification UX

Expected impact: materially improves safety and user experience even before all
raw estimates are perfect.

1. Calibrate confidence from observed error by food class and source.
2. Return ranges for uncertain portions instead of false-precision point values.
3. Ask targeted questions with selectable answers: cup, bowl, grams, pieces,
   small/medium/large, or photo.
4. Persist user corrections as personal portion preferences with reviewable
   provenance.

Acceptance:

- >=95% clarification recall for ambiguous portions.
- High-confidence outputs meet the high-confidence calibration target.
- Median clarification completion requires one tap.

### Phase 6: Model and Cost Optimization

Expected impact: lower cost/latency after deterministic accuracy is established.

1. Keep structured extraction on the cheapest provider that meets extraction
   accuracy, latency, and reliability gates.
2. Use deterministic DB resolution for macros; prohibit LLM-invented macros on
   high-confidence results.
3. Route only unresolved composite decomposition to a stronger model.
4. Cache normalized entity/decomposition results with source/version keys.
5. Track cost per successful parse, clarification, DB hit, and fallback.

Acceptance:

- >=95% DB-resolved parse rate.
- Cost per successful parse decreases without lowering holdout metrics.
- Provider changes require paired holdout evaluation.

## Recommended Order

1. Evaluation redesign and provenance audit.
2. USDA/FNDDS food-specific portion ingestion.
3. Typed retrieval and hard-negative gate.
4. Composite/multi-item architecture.
5. Branded pipeline.
6. Confidence UX and personalized correction loop.
7. Provider/cost optimization.

Do not spend the next cycle tuning individual benchmark expectations or changing
models. The fastest evidence-based route from 76/210 is measured portions plus
typed entity resolution.

## Sources

- USDA FoodData Central Foundation Foods documentation:
  https://fdc.nal.usda.gov/Foundation_Foods_Documentation/
- USDA FoodData Central data type documentation:
  https://fdc.nal.usda.gov/data-documentation/
- USDA FoodData Central API guide:
  https://fdc.nal.usda.gov/api-guide/
- USDA FoodData Central field descriptions:
  https://fdc.nal.usda.gov/portal-data/external/dataDictionary
- EFSA FoodEx2 classification:
  https://www.efsa.europa.eu/en/supporting/pub/en-804
- Portion-size estimation study:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9291996/
- AI dietary assessment systematic review:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10836267/
- Image-assisted dietary assessment review:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7686022/
- NIST statistical AI evaluation guidance:
  https://www.nist.gov/node/1906641
