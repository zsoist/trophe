# Mission food-input-10 — Ship Runbook (2026-07-03)

Branch: `mission/food-input-10`. Prod = zero-risk: ordered gates below; nothing runs
against prod without the operator-approved sequence. Standing approval exists for this
mission (user, 2026-07-03) — sequence still executes in order with verification between steps.

## What ships (code)
1. **Migration 0051** — `food_log.sugar_g` (three quick-log paths INSERTed it for weeks;
   the column never existed; PostgREST PGRST204 failures were silently swallowed —
   favorites-chip / copy-yesterday / coach-rec quick-logs have been broken in prod).
2. **Loop fixes (Wave A)** — clarification conversation UI; voice repair; write-path truth
   (user-visible name, `natural_language` source, parse_confidence/qty_input/food_id/sugar
   persisted); friendly error taxonomy + Retry-After; 45s client budget; parallel decompose;
   photo per-item plausibility + accuracy_note; stale-photo-retry fix; barcode
   source='openfoodfacts'+sugar; warnings[]/calories_range/macro-warning surfaced.
   **+ Forensics levers**: L1 language enum accepts it/de/nl/pt (18 benchmark 400s → 0);
   L2a clarification-zod tolerance; L2b zero-gram supplements; L5 RAG anchor gate
   (relevance floor; flag `FOOD_RAG_GATE_DISABLED` reverts).
3. **Flywheel (Wave B)** — food.log.edit broadened (macros+name; capture-gate covers legacy
   AI rows); corrections.captureAdjustment; log.coachEdit (+audit); MealSlotCard compact
   editor via tRPC; coach pencil + AI-logged chips in MealPatternView.
4. **Woah Wave C** (after A+B integrate) — W5 stepper springs/rolling digits/haptics,
   W1 parse narration, W3 macro ribbons + protein pop, W9 badge micro-confetti,
   W10 next-slot invitation, filled-slot icon bug, branded skeletons, batch undo,
   recipe-analyzer button (unreachable feature ships).

## Order of operations at ship time
1. CI green on PR (typecheck/lint/tests incl. new corrections tests/build).
2. **Apply migration 0051 to prod** (additive one-liner) → verify column exists.
3. Merge → auto-deploy → smoke: qa-walk (8 routes) + one real parse round-trip
   ("2 αυγά και ένα γιαούρτι") verifying: localized food_name written, parse_confidence
   NOT NULL, source='natural_language', sugar_g present; favorites quick-log now inserts.
4. **Data step A (safe now)** — dedupe the identical-value duplicate clusters (SQL below).
5. **Data step B (gated on Michael)** — Greek dish canon: apply his table
   (docs/coach/michael-validation-request-2026-07-03.md) as an idempotent seed
   (pattern: scripts/ingest/mape-tail-dishes.ts) + retire the losing duplicate rows the
   same way as step A + FOOD_NAME_CORRECTIONS for γύρος-μερίδα/καλαμάκι +
   COMMON_PIECE_WEIGHTS moussaka/pastitsio 250→canon.
6. **Benchmark A/B** (on-demand, as eval-tester): expect L1 alone +2.0–2.6pp; watch
   multi_item/code_switch (L5 RAG gate) and base_food (must stay ≥90). Revert lever:
   set FOOD_RAG_GATE_DISABLED=1 (Vercel env) — no redeploy of code required if it reads env at runtime (verify; else revert commit).
7. Post-ship: corrections table should start accumulating — verify ≥1 row after first
   real edit; add a weekly count to the ops checklist.

### A/B VERDICT (executed 2026-07-03)
Three single runs: pre 77.0% (MAPE 12.1/15.0/16.8/17.6) · all-levers 76.7%
(13.2/16.4/18.5/20.0) · levers-minus-L5 76.6% (13.2/16.1/17.6/19.4). All within the
±1.5–2pp DeepSeek drift band — **no lever produced a NET aggregate change resolvable
by single runs** (house rule stands: only median-of-3 comparisons are decisions-grade).
- **L1 verified live** (it/de/nl/pt parse 200 w/ items — probe evidence) but parse≠pass:
  those cuisines lack DB coverage (NEVO not ingested; gap seeds pending) so recovered
  parses land on LLM estimates. L1's pass-rate payoff arrives WITH coverage (levers 6+9).
- **L5 (RAG anchor gate): FOOD_RAG_GATE_DISABLED=1 left SET in prod** (legacy behavior).
  Isolation showed no measurable benefit and no measurable harm; the catastrophic-anchor
  class it targets is real but rare. Revisit with a targeted-id median-of-3 A/B inside
  the accuracy program, not full-set single runs.
- The pass-rate unlock remains **Michael's canonical table (levers 3+4) + coverage (6+9)**
  — exactly as the forensics ranked. Prediction miss logged: +2.5–4pp assumed language
  parses convert to passes without coverage; they don't.

## Data step A — duplicate merge (identical/near-identical rows; prod-confirmed 2026-07-03)
Reviewable, run in a transaction; re-points ALL FKs then deletes the losers.
Clusters (keep the hhf row where one exists; kcal identical or ≤2% apart):
graviera cheese ×3, extra virgin olive oil ×2, pita bread ×2, halloumi ×2, kasseri ×2,
baklava ×2, kouign-amann ×2, tabbouleh ×2, galaktoboureko ×2.
DEFERRED to step B (values conflict — Michael decides canon): moussaka, pastitsio,
tiropita, croque-monsieur (233 vs 135 kcal/100g!), greek salad, manouri, blanquette de veau.

```sql
BEGIN;
CREATE TEMP TABLE dup_map(loser uuid PRIMARY KEY, winner uuid NOT NULL);
-- populate: for each safe cluster, winner = chosen id, losers = the rest
-- (ids inventoried 2026-07-03; RE-RUN the inventory SELECT before executing —
--  see overhaul-2026-07-02-ship-runbook.md §c pattern)
INSERT INTO dup_map(loser, winner) VALUES
  -- graviera: keep 8ab0b7a2…, retire 8cf5218b…, c5b9dc7e…
  -- (fill full uuids from the fresh inventory)
  ('<loser-uuid>', '<winner-uuid>');

UPDATE food_log fl SET food_id = m.winner FROM dup_map m WHERE fl.food_id = m.loser;
UPDATE food_unit_conversions c SET food_id = m.winner FROM dup_map m WHERE c.food_id = m.loser
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions w WHERE w.food_id = m.winner AND w.unit = c.unit);
DELETE FROM food_unit_conversions c USING dup_map m WHERE c.food_id = m.loser; -- remaining dups
UPDATE food_aliases a SET food_id = m.winner FROM dup_map m WHERE a.food_id = m.loser
  AND NOT EXISTS (SELECT 1 FROM food_aliases w WHERE w.food_id = m.winner AND lower(w.alias)=lower(a.alias));
DELETE FROM food_aliases a USING dup_map m WHERE a.food_id = m.loser;
UPDATE dish_recipes dr SET ingredients = (
  SELECT jsonb_agg(CASE WHEN (ing->>'food_id')::uuid = m.loser
                        THEN jsonb_set(ing, '{food_id}', to_jsonb(m.winner::text)) ELSE ing END)
  FROM jsonb_array_elements(dr.ingredients) ing LEFT JOIN dup_map m ON (ing->>'food_id')::uuid = m.loser
) WHERE jsonb_typeof(ingredients)='array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(dr.ingredients) i JOIN dup_map m2 ON (i->>'food_id')::uuid = m2.loser);
DELETE FROM foods f USING dup_map m WHERE f.id = m.loser;
COMMIT;
```

## Deferred (tracked, not this PR)
- Lever 6 Greek gap seeds (freddo cappuccino, Mythos, Creta Farms, kalamaki…) — needs
  label-sourced values; folds into step B's seed. Never invent macros without provenance.
- Lever 7 OFF GR serving_quantity backfill script (real container sizes vs 100g fiction).
- Lever 9 NEVO ingest (data/nevo_2023.csv absent — download from RIVM first).
- Waves 2–4 woah (W6 pill morph, W12 barcode snap, flagships W2/W11, W4 passport).
- Offline capture queue (L); pre-save alternate-match picker (M); coach-nav i18n;
  fr/de/it/pt/nl translations for the new keys.

## Rollback
- Code: revert squash commit (auto-deploys). RAG gate: FOOD_RAG_GATE_DISABLED env.
- 0051: additive; leave in place.
- Dedupe: restore losers from a pre-run `CREATE TABLE foods_dedupe_backup AS SELECT * FROM foods WHERE id IN (losers)` (add to step A execution).
