# TODO-NEXT — Working tree status as of 2026-05-02

All items below are in the working tree but NOT yet committed.
Read this at the start of the next session before touching anything.

---

## BLOCKED on Phase 4 (trophe_user creation)

These files must NOT be committed until `trophe_user` is created on
`open_brain_postgres` and `.env.local` is updated to use it.

| File | Change | Blocker |
|---|---|---|
| `scripts/ingest/usda.ts:154` | Remove `brain_user:jDehquqo1...@5433` literal | Rotate first |
| `scripts/ingest/hhf-dishes.ts:341` | Same | Rotate first |
| `scripts/ingest/embed-foods.ts:113` | Same | Rotate first |
| `scripts/db/migrate-production.sh:52,56` | Same | Rotate first |

Phase 4 plan: see `CLAUDE.md` (the block labelled "TOMORROW — phase 4 plan").
Short version:
1. `CREATE ROLE trophe_user WITH LOGIN PASSWORD '<new>';`
2. `GRANT CONNECT ON DATABASE trophe_dev TO trophe_user;` + table/seq grants
3. Update `.env.local` → `DATABASE_URL=postgresql://trophe_user:...@...`
4. Verify `npm test` still passes
5. Then edit these 4 files: replace literal with `process.env.DATABASE_URL` hard-fail
6. Commit: "security: migrate Trophē from shared brain_user to trophe_user"

---

## HOLD — needs meal_suggest eval before committing

| File | Change |
|---|---|
| `agents/router/policies.ts` | `meal_suggest`: `anthropic/haiku-4.5` → `google/gemini-2.5-flash` (autonomous Codex change, unevaluated) |
| `app/api/ai/meal-suggest/route.ts` | Router-driven URL using `pick('meal_suggest')` |

Action: run a 15-prompt eval set comparing Haiku vs Gemini 2.5 Flash for
meal suggestions. Only commit after quality parity is confirmed or risk is
explicitly accepted.

---

## READY — commit in dependency order

### Commit A: pricing centralization (dependency for B and C)
| File | Change |
|---|---|
| `agents/router/pricing.ts` *(untracked)* | New: centralized model pricing table |
| `agents/observability/otel.ts` | Use `estimateModelCostUsd` from pricing.ts |
| `lib/api-cost-logger.ts` | Remove local PRICING table → use pricing.ts |
| `tests/agents/router.test.ts` | Add pricing-coverage test |

### Commit B: router compliance fixes (depends on A — pricing.ts must exist)
| File | Change |
|---|---|
| `agents/memory/read.ts` | `'voyage-3-large'` → `pick('memory_embed').model` |
| `agents/memory/write.ts` | Same + adds `pick` import |
| `agents/evals/run-all.ts` | Honors `EVAL_REPORT_DIR` env var |
| `app/api/ai/photo-analyze/route.ts` | Hardcoded model → `pick('photo_analyze')` |
| `app/api/food/parse/route.ts` | Provider tag made conditional |
| `app/coach/client/[id]/plan/page.tsx` | `.single()` → `.maybeSingle()` bug fix |

### Commit C: food-parse v4 shim (depends on A — pricing.ts required for cost calc)
| File | Change |
|---|---|
| `agents/food-parse/index.ts` | 186-line v3 → 5-line re-export shim to index.v4 |

### Commit D: Playwright + invariant tests (untracked)
| File | Change |
|---|---|
| `playwright.config.ts` *(untracked)* | Playwright config — restricts to `e2e/` only (fixes current E2E CI failure) |
| `e2e/core-flows.spec.ts` *(untracked)* | Core E2E smoke tests |
| `tests/enterprise/invariants.test.ts` *(untracked)* | Enterprise invariant tests |

Note: `playwright.config.ts` MUST be committed before the E2E step passes.
The current CI failure is Playwright scanning `tests/` (Vitest files) with
CommonJS require because no config file restricts it to `e2e/`.

### Commit E: schema operator-class sync (no DB change needed)
| File | Change |
|---|---|
| `db/schema/food.ts` | `userId` index: `date_ops` → `uuid_ops` (sync with 0000.sql) |
| `db/schema/measurements.ts` | Same |
| `db/schema/supplements.ts` | Same |
| `db/schema/water_log.ts` | Same |
| `db/schema/workouts.ts` | Same |

Safe: `0000_complex_johnny_blaze.sql` already has `uuid_ops`. This is a
TypeScript-only sync, no migration needed.

### Commit F: docs (last)
| File | Change |
|---|---|
| `CODEX.md` | Updated |
| `DEPLOYMENT.md` | Updated |
| `README.md` | Updated |
| `RUNBOOK.md` | Updated |

---

## Current CI state (run 25243953832 on commit 1db4b6b)

| Step | Status |
|---|---|
| Guard (fixture self-test) | ✅ Passes for first time — grep works, fixture caught |
| Guard (real source scan) | ✅ Passes — no hits in tests/agents/lib/app/db |
| Bootstrap | ✅ |
| Verify DB | ✅ |
| Explain plans | ✅ |
| Typecheck | ✅ |
| Lint | ✅ |
| Unit + integration tests | ✅ |
| Enterprise readiness | ✅ Fixed by supabase/config.toml commit |
| Agent eval smoke | ✅ |
| Playwright install | ✅ |
| **E2E smoke tests** | ❌ Playwright scans `tests/` without a config, hits Vitest imports in CJS context |
| Production build | skipped (E2E failed) |

**E2E fix**: commit `playwright.config.ts` (Commit D above). Config restricts
Playwright to `e2e/` only, preventing it from loading Vitest test files.

---

## brain_user architectural note

`brain_user` is OpenBrain's system account, shared across 7+ Mac Mini services.
Trophē's ingest scripts used it as a convenience. The plan:

- Create `trophe_user` on `open_brain_postgres` with least-privilege grants on `trophe_dev`
- Update Trophē's `DATABASE_URL` to use `trophe_user`
- Remove literal password from 4 source files (Phase 4 commits above)
- Leave `brain_user` and OpenBrain untouched
- Separate audit: `forge-discord-bot` and other repos also hardcode `brain_user` — separate task
