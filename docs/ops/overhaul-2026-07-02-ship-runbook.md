# Overhaul 2026-07-02 — Ship Runbook (workout + branded + display-prefs + premium)

Branch: `overhaul/workout-branded-premium`. Prod is zero-risk-deploys: nothing here
runs against prod without explicit operator approval. This file is the ordered gate list.

## What ships (code)

1. **Workout assignment layer** — migrations 0049 (workout_programs + workout_program_days
   + client-reads-program-templates policy + sessions.template_id FK) and 0050
   (profiles.display_prefs + client_profiles.client_view_prefs). tRPC `workouts` router
   (templates.update / program.assign / program.archive / program.forClient / program.mine /
   logs.forClient). Coach program builder + client guided training UI.
2. **Branded-items fix** — `brandedOffAdjustment()` in lookup.ts (generic-query OFF demotion −5,
   foreign-market OFF −6, zero-macro −8; brand-named queries unpenalized — 16 unit tests in
   tests/agents/branded-ranking.test.ts), deterministic ORDER BY on the three capped candidate
   selects, barcode live-cache sanity gate, ingest sane() zero-macro hole closed, curated
   seeds upgraded 'estimated'→'label' (seed script), brand/source/data_quality passthrough
   + UI provenance chips in ParsedFoodList.
3. **Coach display preferences** — Essential presets (lib/display-prefs.ts), Customize mode,
   per-client client_view_prefs (calorie policy per coach, not hardcoded).
4. **Feature-overload cleanup** — duplicate/fabricated panels killed or gated (3-day fetch → 28d,
   mislabeled "Meals Logged", fake Compare-Clients, dead components deleted).
5. **Premium pass** — type scale (10px floor), emoji→Icon sweep, MACRO_COLORS token, z-ladder,
   micro-interactions (see task #69 scope).

## Order of operations at ship time (operator-gated)

1. **Merge gate**: CI green on the PR (typecheck, lint, full tests incl. new RLS +
   branded-ranking tests, migration-journal guard, build).
2. **Apply migrations 0049 + 0050 to prod** (additive-only; existing rows untouched;
   `workout_sessions.template_id` FK is safe — all 60 rows NULL). Verify:
   `SELECT count(*) FROM workout_programs;` → 0 rows, tables exist, RLS enabled.
   REMEMBER: both are already journaled in drizzle/meta/_journal.json (CI guard passes).
3. **Merge PR → auto-deploy** → prod smoke: /api/health 200, /dashboard/workout renders,
   /coach/templates assign flow creates a program row, client sees it.
4. **Prod data cleanup** (reviewable SQL below — run AFTER deploy, each is independent).
5. **Benchmark A/B** (~700 DeepSeek calls, on-demand workflow): run once post-deploy;
   compare vs 2026-06-14 baseline (pass 76.7%, branded ~65%, dbResolved ~62%, pooled MAPE 16.0%).
   Watch: `branded`, `base_food`, `code_switch`, `regional_cuisine` categories + dbResolvedRate.
   Expected: branded ↑ (junk shadowing gone), dbResolved may dip ≤2pts (junk hits → CoT).
   REGRESSION LEVER: all three penalties live in ONE function — `brandedOffAdjustment()`
   (agents/food-parse/lookup.ts); tune constants there, nothing else.

## Prod data cleanup SQL (operator-reviewed, run individually)

```sql
-- (a) Quarantine zero-macro OFF rows (demote, don't delete). Inventory first:
SELECT count(*) FROM foods WHERE source='off' AND protein_per_100g=0
  AND carb_per_100g=0 AND fat_per_100g=0 AND kcal_per_100g>20;
UPDATE foods SET macro_confidence=0.3, data_quality='estimated'
 WHERE source='off' AND protein_per_100g=0 AND carb_per_100g=0
   AND fat_per_100g=0 AND kcal_per_100g>20;

-- (b) Curated-seed quality uplift (pairs with the seed-script change):
UPDATE foods SET data_quality='label'
 WHERE source='custom' AND provenance_notes='Curated regional dish, USDA/CIQUAL-derived'
   AND data_quality='estimated';

-- (c) dish_recipes poisoned by OFF ingredients — REVIEW the list, then delete
-- flagged rows (cache regenerates on next parse; decompose.ts treats miss as OK):
SELECT DISTINCT dr.id, dr.dish_name, dr.total_kcal, dr.created_at
FROM dish_recipes dr, jsonb_array_elements(dr.ingredients) ing
JOIN foods f ON f.id = (ing->>'food_id')::uuid
WHERE f.source='off';
```

## Rollback

- Code: `git revert` the squash commit on main (auto-deploys the revert).
- Ranking only: set the three constants in `brandedOffAdjustment()` to 0 (one-line PR).
- Migrations: 0049/0050 are additive — leave in place on rollback (unused tables/columns
  are harmless); do NOT drop while any deployed code references them.
- Data cleanup (a)/(b) are UPDATEs on quality metadata — reversible by re-running ingest
  quality backfill; (c) deletions regenerate organically.

## Deferred / explicitly out of scope this PR

- NL/DE OFF row deletion (ranking gate makes them inert; deletion is a separate decision).
- search_text tsvector rebuild without brand tokens (needs migration + reindex — evaluate
  after A/B shows whether the ranking gate suffices).
- Fine-tuning / Michael range validation (accuracy program, unchanged).
