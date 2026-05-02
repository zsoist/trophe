# TODO-NEXT — Working tree status as of 2026-05-02

All items below are in the working tree but NOT yet committed.
Read this at the start of the next session before touching anything.

---

## CI state (run 25251519709 on commit 4609077)

| Step | Status |
|---|---|
| Guard (fixture self-test) | ✅ |
| Guard (real source scan) | ✅ |
| Bootstrap | ✅ |
| Verify DB | ✅ |
| Explain plans | ✅ |
| Typecheck | ✅ |
| Lint | ✅ |
| Unit + integration tests | ✅ |
| Enterprise readiness | ✅ |
| Agent eval smoke | ✅ |
| Playwright install | ✅ |
| E2E smoke tests | ✅ (8 passed) |
| Production build | ✅ |

**Third consecutive fully green CI run on `v0.3-overhaul`.**

---

## EVAL-GATED — meal_suggest model upgrade (deadline: 2026-05-09)

The `meal_suggest` policy is currently `google/gemini-2.0-flash` (documenting
what HEAD's route already used). The proposed upgrade to `gemini-2.5-flash`
requires a 15-prompt eval comparing both models on meal suggestion quality.

**Action**: Build the eval, run it, commit the `policies.ts` change if quality
parity is confirmed. If not built by **2026-05-09**, accept `gemini-2.0-flash`
permanently and delete this entry.

| File | Change |
|---|---|
| `agents/router/policies.ts` | `meal_suggest.model`: `gemini-2.0-flash` -> `gemini-2.5-flash` |
| `agents/router/pricing.ts` | Update pricing entry from 2.0-flash to 2.5-flash rates |

---

## TRACKED FOLLOW-UPS

### Accuracy test silent DB fallback (priority: medium)

`tests/agents/food-parse.accuracy.test.ts` defaults `DATABASE_URL` to
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` (Supabase
local) when unset. This caused inconsistent gate results across
sessions: earlier runs against 54322 (different `food_unit_conversions`
data) failed 21/23 (91.3%); runs against 5433 pass 27/27. Fix options:

1. Require `DATABASE_URL` explicitly (no fallback) — hard failure if unset
2. Verify the `foods` table has expected reference rows before computing the gate
3. Log the connection target prominently so divergence is visible

Pick one. The test should fail loudly if it can't trust its data source.

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
