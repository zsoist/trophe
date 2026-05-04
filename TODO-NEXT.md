# TODO-NEXT — Production follow-ups as of 2026-05-03 (evening)

Read this at the start of the next session before touching branch, deploy, or production data.

---

## Session 2026-05-03 evening — completed

- ✅ Composite dish decomposition pipeline built + 38 recipes cached
- ✅ Restaurant chain data seeded (76 items: MenuStat US + Colombian chains)
- ✅ Food logging UX fix: loading skeleton, Promise.all parallelization, timeouts
- ✅ Mobile session fix: visibilitychange refresh on foreground (>2min background)
- ✅ CI lint parity enforced (--no-cache + vercel.json buildCommand)

---

## P0 — Real-user bugs surfaced 2026-05-03 (Daniel's account, midnight test)

Screenshots saved by Daniel. Vercel logs analyzed — see root causes below.

### Bug 4: Hard parse failure on Spanish input [P0] ✅ FIXED
- Input: "2 huevos revueltos con envueltos"
- Error: `TypeError: Cannot read properties of null (reading 'toLowerCase')`
- **Fix (PR #2)**: Null safety + graceful error recovery in food-parse pipeline.

### Bug 2: AI fallback returning 0 kcal for branded items [P0] ✅ FIXED
- Input: "cokes original" (no volume specified)
- Result: 0 kcal, 0 protein, 0 carbs, 0 fat
- **Fix (PR #3)**: Strip markdown fences from LLM macro estimation response.

### ✅ Bug 3: Branded fast food portions massively wrong [FIXED — Wave 3, 2026-05-03]
- Fixed by: `feat/wave3-usda-branded-foods` branch
- 23 items seeded (15 fast food + 8 beverages), 98 unit conversions
- Big Mac now 215g/piece (553 kcal), McNuggets 17g/piece, Whopper 290g
- Coca-Cola, Sprite, Pepsi, Fanta, Red Bull, Starbucks, OJ, Beer all with
  correct container sizes (can=355ml, grande=473ml, etc.)
- Aliases seeded for common queries: "coke", "latte", "cerveza", "red bull"
- Tier 3 gaps (Colombian chains) documented in `docs/wave3-tier3-gaps.md`

### Bug 1: Volume input shown as grams [P1] ✅ FIXED
- Input: "cokes original 450ml" with quantity 2
- Display: "900 g" and "2 piece" simultaneously
- Math is approximately correct (900ml ≈ 900g for liquids) but UX is
  confusing — user typed ml, system shows g.
- **Fix (2026-05-03)**: ParsedFoodList.tsx now detects volume units
  (ml, L, cl, fl oz) and displays the volume quantity + unit instead of
  grams. Adjuster uses ±50ml steps for volumes (vs ±25g for solids).
  Internal macro calculations still use grams via density ratio.

### Cross-cutting: Langfuse traces failing on production ✅ FIXED
- All 8 requests show: `[Langfuse SDK] SyntaxError: Unexpected token '<'`
- Langfuse must use the configured production `LANGFUSE_HOST`; local dev may use `http://localhost:3002`.
- **Fix (2026-05-03, PR #8)**: Set up Cloudflare Tunnel at
  `langfuse.danielreyes.work` with path-specific CF Access bypass for
  `/api/public/*`. Vercel env var `LANGFUSE_HOST` points to tunnel URL.
  Tunnel health verified (200). Traces will appear on next authenticated parse.

**All P0 bugs resolved as of 2026-05-03.** PRs #2→#8 shipped same day.

---

## ✅ COMPLETED — Branch governance (2026-05-03)

v0.3-overhaul (82 commits) merged into main. Vercel auto-deploys from main confirmed working.
Tag: `archive/v0.3-overhaul-2026-05-03`. Current production work branches from `main`.

## ✅ COMPLETED — meal_suggest model migration (2026-05-02)

Migrated to `anthropic/claude-haiku-4-5-20251001` with `tool_choice`.
100% eval pass rate, $0.004/call. Cost logging via `agent_runs`.

## CURRENT BLOCKERS / FOLLOW-UPS

### P1

1. ~~**CI lint inconsistency**~~ ✅ FIXED (2026-05-03) — Added `--no-cache` to CI lint + explicit `buildCommand` in vercel.json. Parity guaranteed.

2. Keep `agent_runs` as the canonical AI cost table. Treat `api_usage_log` as legacy compatibility only.

3. Keep production writes read-only unless a migration or deploy step explicitly requires them.

### P2

4. **Keep branch governance normalized**: production work branches from `main`; historical
   v0.3 state is retained at `archive/v0.3-overhaul-2026-05-03`.

5. **Phase 3 eval improvements (Greek + Colombian)**:
   - AI fallback 0-kcal for 5 regional dishes (bandeja paisa, sancocho, lulo, changua, caldo de costilla)
   - Greek salad portion fix (`default_serving_grams`)
   - Handful unit conversion
   - Fried egg cooking oil macro adjustment
   - Code-switched parse failures (mixed Greek/English input)
   - Reference: `agents/evals/baseline-greek-colombian-2026-05-03.json`
   - Current: **20/30 (66.7%)** after Phase 3 fixes (was 13/30 at baseline, 18/30 pre-Phase3)

### Phase 3 deferred cases (post-2026-05-03)

**Lookup issues (category b):**

1. **gr-12** — "2 αυγά τηγανητά" (fried eggs) ✅ FIXED (2026-05-03)
   - Fix: canonical_food_key + popularity=40 + aliases (en/es/el) + prompt disambiguation
   - Fried egg now resolves correctly in all 3 languages
   - Eval still "fails" on tight bounds (protein 27.2 vs max 26, fat 30.3 vs max 30)
   - Remaining: add food-specific piece=50g conversion OR widen golden by ~5%

2. **co-04** — "1 taza de arroz blanco" (white rice)
   - Current: sometimes matches brown rice (195g/cup) vs white (158g/cup)
   - Needed: "blanco"/"white" in query should prefer white rice entry
   - Impact: marginal (240 vs 230 max — 10 kcal over). Consider widening golden.
   - Effort: low (alias or embedding fix)

**AI fallback issues (category c):**

3. **gr-05** — "1 σουβλάκι κοτόπουλο με πίτα" (souvlaki with pita)
   - Current: LLM treats "souvlaki + pita" as composite → AI estimate → 100g/160kcal
   - DB HAS souvlaki_chicken at 150g, but "with pita" triggers composite path
   - Needed: either teach LLM to decompose (souvlaki 150g + pita 60g), or seed
     a "souvlaki_with_pita" composite entry (~210g, ~320kcal)
   - Effort: medium (prompt or seed)

4. **gr-04** — "γιαούρτι με μέλι και καρύδια" (yogurt with honey and walnuts)
   - Current: fat=31.9g (above max 30). Items resolve OK but walnut portion large.
   - Needed: review walnut default quantity or golden tolerance
   - Effort: low (data adjustment)

---

## FOOD-PARSE ACCURACY — P1 follow-ups (2026-05-02)

Current gate: **48/48 = 100%** (threshold: 75%). Up from 79.2% pre-Wave 3. Canonical foods: 150 (no duplicates remaining — cheddar dedup confirmed resolved 2026-05-03).

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

3. ~~**127 vs 129 canonical foods**~~: ✅ RESOLVED 2026-05-03. Only one `cheddar_cheese`
   entry exists (FDC 170899). Zero duplicate FDC IDs among 150 canonical foods.

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
