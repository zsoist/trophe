# Testing & CI

## Layout
| Where | What | Runner |
|---|---|---|
| `tests/agents/` | food-parse, RAG, nutrition gates, memory, router/runtime | vitest |
| `tests/api/` | route contract tests (input/guard) | vitest |
| `tests/db/` | RLS (role impersonation), RAG-RLS, **migration-journal**, compliance | vitest |
| `tests/lib/` | pure logic — api-guard, rate-limit, calorie-equations, shopping-list, food-yields | vitest |
| `tests/auth/`, `tests/components/`, `tests/spike/` | role gates, key components, wearable | vitest |
| `e2e/` | end-to-end flows (login, authed roles) | Playwright (chromium) |
| `agents/evals/` | nutrition + RAG benchmarks (Acc@7.5, MAPE) | `npm run evals*` |

## Run
```bash
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint
npm test                     # vitest (unit + integration)
npm run test:e2e             # Playwright
npm run build                # next build --webpack
npm run verify               # all of the above (pre-push gate)
npm run evals                # agent eval smoke (40% gate)
npm run evals:nutrition:enterprise   # prod benchmark (EVAL_DATASET=v2|v3)
```

## CI (`.github/workflows/ci.yml`)
Single `verify` job on a Postgres service: audit → gitleaks → migration/hardcode guards →
**migration-journal sync guard** → db bootstrap → typecheck → lint → unit → nutrition+RAG gates →
readiness → eval smoke → cost gates → Playwright E2E → build. Concurrency-cancels superseded runs.

## Benchmark
Official = **v2 (210 cases)**; backup = **v3 (700, Greek-weighted)**. Metrics: pass-rate, MAPE per macro,
Acc@7.5 (all 4 macros within ±7.5%). See `docs/benchmark/methodology.md`. Fat is the hardest macro.

## Conventions
- Pure logic → `tests/lib/` (no mocks, fast). DB/RLS → `tests/db/` (real Postgres in CI).
- New `app/api/*` route → add at least an input-validation/guard test.
- Accuracy-affecting food-parse changes must pass the benchmark A/B before merge.
