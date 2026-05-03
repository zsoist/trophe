# TODO-NEXT — Production follow-ups as of 2026-05-03

Read this at the start of the next session before touching branch, deploy, or production data.

---

## ✅ COMPLETED — Branch governance (2026-05-03)

v0.3-overhaul (82 commits) merged into main. Vercel auto-deploys from main confirmed working.
Tag: `archive/v0.3-overhaul-2026-05-03`. Branch kept alive until 2026-05-10.

## ✅ COMPLETED — meal_suggest model migration (2026-05-02)

Migrated to `anthropic/claude-haiku-4-5-20251001` with `tool_choice`.
100% eval pass rate, $0.004/call. Cost logging via `agent_runs`.

## CURRENT BLOCKERS / FOLLOW-UPS

### P1

1. **CI lint inconsistency**: `index.v4.ts` line 162 `any` type passed CI on
   every v0.3-overhaul push but failed on the first main push. Either the CI
   config differs by branch (check `.github/workflows/ci.yml` for branch-specific
   lint flags), or eslint cache was masking the error. False-confidence CI gates
   are worse than no CI gates. Investigate and fix.

2. Keep `agent_runs` as the canonical AI cost table. Treat `api_usage_log` as legacy compatibility only.

3. Keep production writes read-only unless a migration or deploy step explicitly requires them.

### P2

4. **Schedule v0.3-overhaul branch deletion**: tagged at
   `archive/v0.3-overhaul-2026-05-03`. Delete branch after 2026-05-10 if
   no rollback needed: `git push origin --delete v0.3-overhaul`

5. **Phase 3 eval improvements (Greek + Colombian)**:
   - AI fallback 0-kcal for 5 regional dishes (bandeja paisa, sancocho, lulo, changua, caldo de costilla)
   - Greek salad portion fix (`default_serving_grams`)
   - Handful unit conversion
   - Fried egg cooking oil macro adjustment
   - Code-switched parse failures (mixed Greek/English input)
   - Reference: `agents/evals/baseline-greek-colombian-2026-05-03.json`
   - Current: 13/30 (43.3%) all-pass, target: 80%+

---

## FOOD-PARSE ACCURACY — P1 follow-ups (2026-05-02)

Current gate: 38/48 = 79.2% (threshold: 75%). Canonical foods seeded: 127/129.

### Must-fix (next session)

1. **Query specificity**: BM25 for generic queries ("eggs", "oats", "whole milk")
   matches wrong USDA entries despite canonical injection + metadataBoost.
   Root cause: lexical ambiguity. "eggs" → "Egg, whole, cooked, hard-boiled"
   instead of "Egg, whole, raw, fresh". Need to investigate why metadataBoost
   canonical +5 isn't overriding — possibly the boiled egg IS canonical
   (egg_chicken_whole_boiled). Fix: review golden expected values or add
   query-to-canonical-key direct mapping.

2. **Golden macro alignment**: 3 cases fail on tight tolerances (<10% off)
   because golden expected values were hand-calculated, not from actual DB.
   Fix: query actual `kcal_per_100g` etc. from seeded foods and update goldens.

3. **127 vs 129 canonical foods**: `cheddar_cheese` and `white_cheese_cheddar`
   both map to FDC ID 170899. Dedup needed — pick one canonical key.

4. **CI gate enforcement**: Accuracy tests skip in CI (no canonical foods
   seeded in CI Postgres). Need: seed canonical foods in CI bootstrap, or
   accept local-only gate for now.

### Nice-to-have (later)

5. **Fuzzy fallback path**: canonical injection covers the main BM25 path
   but not the ILIKE fuzzy fallback. Low priority — fuzzy path only fires
   when BM25 returns zero results.

6. **HTTP eval runner**: extend `agents/evals/food-parse-nikos-golden.json`
   with the 20 new cases from the Vitest golden set.

---

## TRACKED FOLLOW-UPS

### Accuracy test silent DB fallback (resolved 2026-05-02)

Root cause was lookup precedence: generic universal `slice/piece` conversions beat the food's curated default serving for feta and spanakopita when no food-specific conversion row existed. `lookupFood()` now lets matching `default_serving_unit/default_serving_grams` win before universal fallbacks. Gate result: 27/27.

### rls.test.ts requires superuser (priority: low)

`tests/db/rls.test.ts` inserts into `auth.users` and uses `SET LOCAL ROLE`,
both requiring superuser. Works in CI (`postgres` role) but fails locally
as `trophe_user`. Fix: introduce `RLS_TEST_DATABASE_URL` env var for the
test's superuser needs, fall back to `DATABASE_URL` for CI. Until fixed,
locally run as: `DATABASE_URL=postgresql://brain_user:...@5433/trophe_dev
npx vitest run tests/db/rls.test.ts` (or skip; CI covers it).

### OpenBrain credential audit (priority: low — separate repos)

`forge-discord-bot/src/services/dashboard.ts` and other repos hardcode
`brain_user`/`jDehquqo1...`. Same pattern Trophe just fixed. Sweep:

```bash
grep -rn 'brain_user\|jDehquqo1' \
  /Volumes/SSD/work/forge-projects/ \
  /Volumes/SSD/servers/ \
  /Volumes/SSD/work/openBrain/ \
  --include='*.ts' --include='*.py' --include='*.sh' \
  2>/dev/null | grep -v node_modules | grep -v __pycache__
```

Each hit needs the same treatment Trophe got: route through env var
with a hard failure if unset. This is separate-repo work, not Trophe.

---

## brain_user architectural note

`brain_user` is OpenBrain's system account, shared across 7+ Mac Mini services.
Trophe's ingest scripts used it as a convenience. Status after Phase 4:

- ✅ Created `trophe_user` on `open_brain_postgres` with least-privilege grants
- ✅ Updated Trophe's `DATABASE_URL` to use `trophe_user`
- ✅ Removed literal password from 4 source files (commit 4609077)
- ✅ `brain_user` and OpenBrain verified untouched (2016 rows, 3 checkpoints)
- Separate audit: `forge-discord-bot` and other repos still hardcode `brain_user`
