# AGENTS.md — AI Agent Guidance for This Repository

> **This file is guidance for AI coding agents** (Claude Code, Codex, Cursor, Copilot) working in this codebase.
> For the application's runtime LLM architecture (prompts, clients, evals, memory), see [`/agents/README.md`](./agents/README.md).
> For full project context and operator handoff, see [`CODEX.md`](./CODEX.md).

---

## Start here — reading order

1. **`CODEX.md`** — Complete handoff: production state, all 30+ tables, LLM capabilities, UX system, deploy, what's missing. Read this first for full context.
2. **`CLAUDE.md`** — Coding rules: pitfalls, invariants, design rules, deploy commands. Read before writing any code.
3. **`ARCHITECTURE.md`** — System diagram, request lifecycle, data model overview.
4. **`agents/README.md`** — LLM runtime: agent inventory, router, prompts, observability, how to add an agent.

---

## This is NOT the Next.js you know

This is **Next.js 16.2.2** with React 19. APIs, conventions, and file structure may differ from training data. Read relevant sections in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## Non-negotiable coding conventions

### Files and architecture
- **`proxy.ts`** is the Next.js middleware (renamed from `middleware.ts` in v0.3). Do not create a new `middleware.ts`.
- **Auth**: `@supabase/ssr` is installed and active. Sessions are in HTTP-only cookies. Do NOT use `localStorage` for auth tokens. Do NOT revert to the old `lib/supabase.ts` singleton for server-side auth.
- **Any new LLM feature** → `agents/<name>/` with versioned prompt, typed schema, and `run() → { ok, output, telemetry }` contract. Route is a thin adapter (<60 LOC).
- **Any new `lib/*.ts` business logic** → matching `tests/*.test.ts` (golden cases, like `nutrition-engine.test.ts`).
- **DB schema changes** → new file in `db/schema/`, then `npm run db:generate` to create migration SQL in `drizzle/`.

### Design and UI
- **CSS variables on themed surfaces**, not raw Tailwind dark colors. `var(--bg-primary)`, `.glass`, `.glass-elevated`. No `bg-stone-9xx / bg-neutral-9xx / bg-zinc-9xx` on `app/dashboard/**` or `app/onboarding/**` (ESLint warns).
- **No `dangerouslySetInnerHTML`** anywhere except the pre-paint theme script in `app/layout.tsx`.
- **No emoji as icons** — use Lucide icons or `<Icon name="i-*" />` from the sprite.
- **i18n for all user-visible strings** — `t('key')` via `useI18n()`. New keys go in `lib/i18n.tsx`.
- **Mobile-first**: design + verify at 390×844 before desktop.
- **All analytics accordions default closed**: `expanded = useState(false)`.

### Safety checks
- **Never `.single()`** on any Supabase query — always `.maybeSingle()`.
- **All dates via `lib/dates.ts`** — `localToday()`, `localDateStr()`. UTC causes day-boundary bugs.
- **Input caps on AI routes**: food-parse 500 chars, recipe-analyze 4000 chars. Strip control chars.
- **Service role key server-only** — never `NEXT_PUBLIC_`.
- **Framer Motion spring with 3+ keyframes will crash**. Use `type: 'tween', ease: 'easeOut'` instead.

---

## Before declaring work complete

```bash
npm run typecheck    # must be 0 errors
npm run lint         # must be 0 errors
npm test             # all suites green
npm run build        # must be clean
```

---

## Branch strategy

All v0.3 development on `v0.3-overhaul`. **Never commit directly to `main`**. Production cutover (Phase 9) is operator-gated.
