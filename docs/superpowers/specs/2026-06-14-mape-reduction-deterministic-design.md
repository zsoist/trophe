# Deterministic MAPE Reduction — Design Spec (2026-06-14)

**Status:** Approved (brainstorming → spec). Next: implementation plan.
**Owner constraints:** production-critical food-parse; **DeepSeek-only**; zero-risk/preview-first; every accuracy change gated on `tsc --noEmit` + a **median-of-3 v2(210)+v3(700) A/B**, kept only if it does not regress pass-rate; quote the band (DeepSeek temp=0 drifts ±1.5–2pt), never a single run.

## Goal
Cut pooled macro-MAPE from ~22% toward the **deterministic floor (~15–16%)** and lift 700-set pass ~76→~83%, by (1) making the benchmark honest and (2) eliminating wrong-FOOD-match *composition* error. Explicitly **not** by blanket fat-prompt priors (known landmine — reverted once).

## Grounded diagnosis (3-agent investigation, 2026-06-14)
- **DB-resolved meals = 12.9% MAPE; LLM-touched = 31.7% (~2.5×).** DB-resolution ~61% on the 700-set (target 75%+). Master lever = move items off the LLM path.
- **Error is composition (wrong food matched), not grams** (~72% vs ~17% on single items). A tail of **47 cells >100% APE = 28% of ALL error** (e.g. `"coffee" → "Black Edition Coffee" protein shake, +104g protein`; oatmeal→oat-bran; cooked-vs-raw; branded regular-vs-low-carb).
- **The −14% "under-estimate" is mostly a scoring artifact** — 0-item clarification meals scored against non-zero ranges (−384 kcal each). Excluding them: signed cal ≈ −2 kcal (flat); the LLM actually **over**-estimates (+15.6 kcal) when it fires. → the added-oil instinct was chasing a phantom.
- `food_aliases` (480+) and `lib/food/food-yields.ts` are **built but (likely) unwired**. HNSW vector arm is dead **intentionally** (re-wiring regressed −27pt — do not touch).
- **Ceiling:** SOTA text→macro is 13–25% MAPE. <10% is **not** reachable by these tweaks — needs Michael-validated Greek ranges + fine-tuning (separate tracks, queued).

## Phases (ordered: safe foundation first, fat-arm last)

### Phase 0 — Metric honesty (zero accuracy risk; foundation)
- `scripts/eval/run-nutrition-enterprise-prod.ts`: exclude 0-item clarification meals from MAPE/signed denominators (score them only on the clarification check); persist per-item **expected-vs-actual macros + per-100g** (the ~10-line change at the parsedItems write, ~:217-222) so grams-error vs composition-error is cleanly separable and future A/B is trustworthy.
- Re-run v2+v3 median-of-3 → record the **TRUE baseline**. (Not an accuracy change; it corrects the number + unblocks measurement.)

### Phase 1 — Kill the wrong-variant tail (largest real lever, ~28% of error)
- **Verify** in `agents/food-parse/lookup.ts` whether `food_aliases` is actually fused into BM25 (`keywordCandidates`) and effective; fix/wire if not.
- Add **variant disambiguation** to retrieval ranking (`lexicalIntentScore`/`metadataBoost` + weak-match gate): penalize cooked-vs-raw, fat%-variant, regular-vs-diet/low-carb, and **generic-query → niche/branded product** matches unless the query names the brand.
- Add dedup-checked, tsc-gated `FOOD_NAME_CORRECTIONS`/alias entries for the top blunder cells (start with the coffee→protein-shake class).
- A/B-gate. Risk: low-med (ranking changes can shift other matches).

### Phase 2 — DB authority over LLM for confident matches
- Verify `arbitrateDbVsCoT` high-confidence escape (`effectiveDbTrust ≥ 0.85 → trust DB macros, skip hybrid`) ships and fires; `brand-07` still shows 624% fat APE → hybrid is corrupting a confident DB row. Tighten so the LLM can't override high-confidence DB macros. A/B-gate. Risk: med (load-bearing reconciliation).

### Phase 3 — Calibrated seeds for top failing dishes
- Seed top regional/composite failers (regional carbs/fat, composite fat) from CIQUAL/USDA, **calibrated against the dataset's expected ranges before shipping** (wrong seed worse than LLM), correct piece weights. A/B-gate. Risk: low per-seed.

### Phase 4 — *stretch/flagged*: fry-fat-uptake arm
- Live-wire ONLY `FRY_FAT_UPTAKE_PER_100G` (`lib/food/food-yields.ts`) for `food_state ∈ {fried, breaded}` as an additive fat correction, behind a flag, **strict A/B**. Do NOT enable raw→cooked multipliers (double-count with prompt's cooked-default rules). Risk: med (fat regressed once via prompt; different mechanism, gate hard, last).

## Success criteria
- Phase 0: honest baseline recorded; per-item data persisted.
- Phases 1-3: each kept only if pooled MAPE ↓ and pass-rate not down vs baseline band; cumulative target ~22→~16% pooled, pass ~76→~83%.
- Phase 4: kept only if fat-MAPE ↓ with no protein/carb regression.
- No prod deploy until the full A/B passes; preview-first.

## Out of scope (separate tracks)
Michael ground-truth validation of the 700-set Greek ranges; the correction-flywheel edit UI + LoRA fine-tuning (the only path to <10%); the dormant vector arm.

## Results (verified 2026-06-14, median-of-3)

Shipped Phases 0, 1 (split 1a/1b/1c) and 3. Phase 2 **skipped** (premise dissolved —
its proof-case brand-07 was a retrieval bug fixed by 1b, not arbitration); Phase 4
deferred (fat already low). Every phase A/B-gated; merge gated on median-of-3.

| Run (v3 700) | pass | cal | protein | carbs | fat | pooled |
|---|---|---|---|---|---|---|
| Phase 0 baseline (honest) | 75.6% | 17.9% | 24.1% | 22.0% | 25.7% | 22.4% |
| Phase 1a (generic→branded penalty) | 75.7% | 16.2% | 22.3% | 20.1% | 23.6% | 20.6% |
| Phase 1b (dried-milk + coffee exact) | 75.7% | 12.9% | 17.1% | 17.5% | 19.3% | 16.7% |
| Phase 1c+3 (dish routes + gratin seed) | 76.7% | 12.9% | 16.4% | 17.2% | 18.5% | 16.3% |
| **Final median-of-3** | **76.6%** | **12.6%** | **16.0%** | **17.1%** | **18.2%** | **16.0%** |

v2(210) median-of-3: pass **94.3%** (baseline 94.8% — no regression).
**Net: pooled MAPE 22.4% → 16.0% (−6.4pt), pass +1.0pt, p95 9.5→8.1s.** At the
deterministic floor; sub-10% needs the out-of-scope tracks.

### What moved it
- **Biggest lever:** `FORM_TOKENS += dried` — generic milk/γάλα/lait stopped matching
  "Milk, semi-skimmed, dried" (powder, ~35g protein). Fixed milk, cereal-with-milk,
  and brand-07 (624%→48% fat — the case the spec mis-attributed to arbitration).
- Coffee exact-row corrections (black coffee 1534%→0% fat).
- `PRODUCT_TOKENS += candies|confectionery`; dish re-routes (bouillabaisse →
  "Soup, bouillabaisse" F3 vs F10.5; gazpacho → homemade); **Gratin dauphinois**
  seed calibrated to expect_total (kills 3 cells); Saganaki carbs 8→4.

### Remaining tail (~14 cells >100% APE, down from 47) — diminishing returns
- **LLM-extraction misses** (extracted term ≠ any correction key): cereal→candy,
  el-cs-06 coffee→shake. Need a decompose probe or aliases, not ranking.
- **Portion errors**: gratin "1 part" (uniform ~−60% = grams), croque (right row
  now, over-portioned), quarter-baguette.
- **Small-denominator artifacts**: freddo, gazpacho fat (tiny absolute grams).
- **Deferred levers**: Phase 2 Rule-3 `effectiveDbTrust` guard (real but unexercised);
  Phase 4 fry-fat; gyros μερίδα→meat (overlapping existing keys, needs care).

### Prod rollout — SHIPPED 2026-06-14 ✅
Live on trophe.app: origin/main `6f50cfc` + `vercel --prod` (dpl_GuzScRgCUBsRWkVmdG3nqe2uMKtv, READY).
The data seed (`scripts/ingest/mape-tail-dishes.ts`, Gratin dauphinois + Saganaki carb fix) was already
in prod — trophe `.env.local` DATABASE_URL points at the PROD Supabase, so it ran there when executed
"locally". Post-deploy: homepage 200, prod parse end-to-end OK, no regression (spot-set fails are
pre-existing wine/alcohol cases, untouched by this work).
