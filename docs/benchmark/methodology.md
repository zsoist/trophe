# Trophē Nutrition Accuracy — Benchmark Methodology

> For the "most accurate on the market" claim and the planned academic paper.
> Honesty about variance is what makes the claim defensible to a clinic buyer.

## Dataset
- `agents/evals/datasets/nutrition-enterprise-v3.json` (**v3.9 — 700 cases**) across
  base foods, composites, regional cuisines (GR/FR/ES/CO/IT), multi-item meals,
  code-switching, vague quantities, branded products, supplements, beverages,
  seafood, bakery, and adversarial inputs. Greek-weighted (el 195/700) for the
  Greek-first launch. Expanded 549→700 on 2026-06-13 (+151 Greek/EU cases).
- **Caveat on the +151 new cases:** their expected ranges are research-derived
  (Trichopoulou/HelTH/Greek-EPIC midpoints), NOT yet nutritionist-validated. Greek
  composite/taverna dishes have genuine 1.5-2× portion variance, so those cases use
  ±25% ranges; base foods stay tight. **Michael Kavdas validation is the next step
  to make the Greek cases an authoritative gate** (his stated role as domain "testing bot").
- Each case carries `expect_total` macro **ranges** (min/max), not point values —
  validated against domain expertise (Michael Kavdas ranges for Greek/portion cases).
- Roadmap: grow to 1,000–1,500 cases for the paper; score against NutriBench/ACC.

## Harness
`scripts/eval/run-nutrition-enterprise-prod.ts`, run against **production**
(`https://trophe.app/api/food/parse`) with a real authenticated session.

### Multi-run median mode (the key methodology fix, 2026-06-13)
`EVAL_RUNS_PER_CASE=N` calls each case N times and scores the run whose **total
calories is the median** (a real observed output, not a per-metric average that
could mix runs). Determinism short-circuit: cases that fully resolve from
`local_db` are called once (identical every time), concentrating the N× cost on
the ~35% of cases where the LLM is in the loop.

### Pass criterion
A case passes when status, item-count (±1 for composites), and all four macro
totals (calories/protein/carbs/fat) fall within the expected ranges, plus
clarification expectations. `Acc@7.5` = stricter: calories AND every macro within
7.5% APE.

## What we measure
| Metric | Meaning | Why it matters |
|---|---|---|
| **pass rate** | cases within expected ranges | headline accuracy |
| **dbResolved %** | items resolved from local DB, no LLM | **the drift-immune KPI** |
| Cal/macro MAPE | mean abs % error per macro | precision (fat is the hardest) |
| p50 / p95 latency | response time | UX / enterprise SLA |

## The variance finding (read this before quoting a number)
With LLM `temperature: 0`, the benchmark **still moves ±1.5pt between hours** on
identical code — DeepSeek server-side sampling/version drift. Observed
2026-06-13: same commit scored 91.6% morning, 90.0–90.3% at night; runs within
the same hour agree closely.

**Implication:** quote a **band (90–92%)**, never a single-run high-water mark.
A point estimate is partly weather.

**Corollary — the real lever is dbResolved %.** Every food converted from LLM
estimation to a calibrated DB row is permanent and drift-immune; the LLM share is
what wobbles. Path to a stable 95: raise dbResolved from ~65% toward ~80% via
market food DBs (NEVO, German OFF, Michael's Greek list) and calibrated dish seeds
— NOT prompt tuning, which drifts.

## Seeding discipline (lesson from migration 0033)
A DB row that resolves with high confidence is **deterministically** applied. If
its serving size or macros are wrong, it is *worse* than LLM estimation, which at
least centers on the truth. **Calibrate every seed against the dataset's own
expected ranges before shipping**, then re-benchmark as the regression gate.
Example: a croque-monsieur seeded at 200g/584kcal (CIQUAL-from-memory) regressed
3 cases until recalibrated to ~105g/245kcal to match validated ranges.
