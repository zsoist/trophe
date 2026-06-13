# Contributing to Trophē

Trophē is **production-critical** (live coaches + clients on trophe.app). Bias to zero-risk, verified changes.

## Workflow
1. Branch from `main` (CI runs on PRs and on `main`).
2. Make the change; keep it focused. Match the surrounding code's style.
3. Run the gate locally before pushing: `npm run verify` (= `typecheck` + `lint` + `test` + `build`).
4. Open a PR — the template prompts for what/why, how-verified, risk. CI (`verify` job) is the hard gate.
5. Deploy is manual (`vercel --prod`) after merge — Vercel git auto-deploy is intentionally disconnected.

## Non-negotiables
- **`tsc` must pass before push.** Duplicate keys / type drift have hit prod before.
- **Migrations:** every `drizzle/NNNN_*.sql` needs a matching entry in `drizzle/meta/_journal.json`
  (unique `idx` + `when`), or the migration-journal test reds CI. Applying via the Supabase MCP does
  **not** update the journal — add it by hand or use `drizzle-kit generate`. A fast CI guard catches drift.
- **`db:push` is disabled** (it reverts RLS to `TO public`). Use `db:generate` + `db:migrate`.
- **No auth/RLS change without explicit sign-off.** RLS is `TO authenticated`, fail-closed.
- **LLM text = 100% DeepSeek** (cost mandate). Anthropic Haiku is vision-only; never route text to Gemini/Anthropic.
- **Food-parse pipeline is sensitive** — accuracy changes must pass the benchmark A/B (a prior "added-oil" prompt regressed fat-MAPE and was reverted).

## Layout
- `app/` routes · `components/<domain>/` (food, charts, meals, habits, summary, progress, health, workout, shared, admin, coach, ui)
- `lib/` (security, utils, food, fitness, habits + central singletons at root) · `agents/` (AI) · `db/` + `drizzle/`
- `docs/` — see [`docs/README.md`](docs/README.md). Canonical state = the latest `docs/STATUS-*.md`.

## Commits
Conventional-ish (`feat(scope):`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`). End commits with the Co-Authored-By trailer when pair-built.
