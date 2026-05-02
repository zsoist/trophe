# TODO-NEXT — Production readiness follow-ups as of 2026-05-02

Read this at the start of the next session before touching branch, deploy, or production data.

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

## ✅ COMPLETED — meal_suggest model migration (was deadline: 2026-05-09)

**Completed 2026-05-02.** Migrated to `anthropic/claude-haiku-4-5-20251001`.

Research showed gemini-2.0-flash deprecated (hard-shutdown June 1, 2026).
Production was already silently returning FALLBACK_SUGGESTIONS (3 hardcoded meals).
Gemini 2.5 Flash had thinking-mode latency tax + markdown-fence JSON issues.

Haiku 4.5 with `tool_choice` scored 50/50 (100%) on 10-prompt eval.
Avg latency 4.2s, $0.004/call. Route refactored from Gemini REST to Anthropic SDK.
Cost logging via `agent_runs` (Drizzle) verified end-to-end.

Also fixed: Haiku 4.5 pricing was wrong ($0.25/$1.25 → $1.00/$5.00).

| Commit | Change |
|---|---|
| `fe0ad58` | Eval suite: `agents/evals/run-meal-suggest.ts` |
| `61cda79` | Route refactor: Gemini REST → Anthropic SDK + tool_choice |
| `c2baee8` | Policy + pricing update |

Production now serves `https://trophe.app` from the v0.3 stack. `main` is still the GitHub default branch, but `v0.3-overhaul` remains the temporary production truth until the final local gates, production canary, and branch merge are completed.

## CURRENT BLOCKERS / FOLLOW-UPS

1. Make `main` the production source of truth after `npm run typecheck && npm run lint && npm test && npm run readiness && npm run build && npm run test:e2e && npm run canary:prod` are green.
2. Confirm Vercel production branch setting after merge so production no longer depends on `v0.3-overhaul`.
3. Keep `agent_runs` as the canonical AI cost table. Treat `api_usage_log` as legacy compatibility only.
4. Keep production writes read-only unless a migration or deploy step explicitly requires them.

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
