# AGENTS.md — AI agent guidance for this repo

> **Note**: this file is guidance for **AI coding agents** (Claude Code, Cursor, Copilot) working in this repo.
> For the application's **runtime LLM architecture** (prompts, clients, evals, pipelines), see [`/agents/README.md`](./agents/README.md) instead — that folder owns the "agents" name for our production AI features. These two things share a name but are unrelated.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project conventions

- Read [`CLAUDE.md`](./CLAUDE.md) first — project rules + pitfalls, supersedes general conventions.
- Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the system map and the `/agents/` runtime pattern.
- Follow coding conventions in CLAUDE.md § Theme system + § `/agents/` architecture pattern.
- **Mobile-first**: design and verify at 390×844 before desktop.
- **No new `bg-stone-9xx` / `bg-neutral-9xx` / `bg-zinc-9xx`** on themed pages — use CSS variables (`var(--bg-primary)`) or `.glass`/`.glass-elevated` utility classes. ESLint rule enforces on `app/dashboard/**` + `app/onboarding/**`.
- **Any new LLM feature** goes through `/agents/<name>/` with a versioned prompt file, typed schema, and the `run(input) → { ok, output, telemetry }` contract. Route becomes a thin adapter.
- **Any new `lib/*.ts` business logic** gets a matching `tests/*.test.ts` file — the nutrition engine has 25 golden-case tests for a reason.
- **Before declaring work complete**: run `npm run typecheck && npm run lint && npm test`.
