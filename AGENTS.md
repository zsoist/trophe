# AGENTS.md — Agent Guide for This Repository

> Short root guide for AI coding agents (Claude Code, Codex, Cursor, Copilot) working in this codebase.
> Read only what a task actually needs — there is no repo-wide must-read. Contextual reference docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`agents/README.md`](./agents/README.md), [`docs/TESTING.md`](./docs/TESTING.md), [`docs/rls-design.md`](./docs/rls-design.md), [`docs/ops/ask-trophe-live01-qa-evidence.md`](./docs/ops/ask-trophe-live01-qa-evidence.md), [`docs/ops/ask-trophe-live01-authority.md`](./docs/ops/ask-trophe-live01-authority.md). Dated evidence files are **historical — never current approval**.

---

## What Trophē is

Trophē (τροφή) is a precision-nutrition platform for **human coaches and their clients**: a coach assigns habits and reviews **nutrition, workout and evidence** data, while clients log food, workouts and daily check-ins. AI **proposes and assists**; it never replaces the human coach and never invents facts.

---

## Ownership and agents

- **One builder owns a complete task** end-to-end. Do not hand off half-finished work.
- **AG1** owns end-to-end delivery and release. **AG2** owns visual media production; AG1 owns application UI. **AG3** is reserve. **AG4** owns risk review and candidate evaluation. **DS** works independently. **AGG** dispatches work but does **not** approve each step — dispatch is not per-step approval.

## Working tree

Preserve WIP and worktrees. **Never** `git reset`, `git clean`, `git stash`, or force-push over another agent's work. History stays in Git. Work on a feature branch; never commit directly to `main`, which deploys production.

---

## Supabase and auth

- `@supabase/ssr` with **HTTP-only cookies**; never store auth tokens in `localStorage`.
- Resolve identity with **`getUser()`** for auth decisions — never trust a decoded JWT, never use `getSession()` for authorization.
- Enforce **RLS**; every query is scoped to the authenticated user — **client isolation** is mandatory.
- The **service role key is server-only**; never expose it as `NEXT_PUBLIC_*`. Never `.single()` — use `.maybeSingle()`.

## QA and test accounts

QA runs against an **isolated QA environment, separate from production** using **legitimate, designated accounts**. Never copy personal cookies between accounts. An email being **pre-confirmed** is not proof that **email delivery** works.

---

## AI behaviour

AI output flows **proposal → review → confirm → canonical writer → receipt → refetch**; the UI reads back the canonical record. Never invent **food identity or macros**. The **manual flow must survive with AI off**.

## Budgets

- **Product** AI budget is **$3/day (Bogota), shared**. The **DS startup** budget is **$1 total and separate** from product. Do not create new recurring budget. Reserve conservatively in the shared persistent authority before each call; preserve uncertain usage, disable hidden retries, and never reset counters, redeem quota resets or buy credits.
- **Luna** handles generation — **not Haiku**. Use **specialized STT** for speech-to-text.

## UI

Use **i18n** for all user-visible strings, **theme CSS variables** (not raw palette colors), sprite/Lucide **icons** (no emoji as icons), and respect **mobile safe areas**. Verify responsive layout; it does **not** certify a physical iPhone. Document one physical-device pass before the initial canary.

## Correctness rules

- The Next.js request gate is `proxy.ts`; preserve the existing verified auth path. Do not create a parallel root middleware.

- All dates via the **canonical date helper** (`lib/utils/dates.ts`) — never hand-roll UTC.
- Reuse the **existing input caps** on AI routes.
- **No `dangerouslySetInnerHTML`** except the existing pre-paint theme script in `app/layout.tsx`.
- **No 3-keyframe Framer Motion spring** — use a tween instead.

---

## Verification

Verified scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run db:doctor`, `npm run db:generate`, `npm run db:migrate`.

**Commands are not automatic authorisation.** Run **focal tests while iterating**; run the **exact CI candidate gates** before proposing a merge; do **not** run the full suite on every edit.

## Databases and production

Production/DB changes happen only as an **exact, reviewed, versioned operation** with **backup, preflight and rollback** and **cohort flags and gates**. **No universal rollout.**

## Environment

Use the **existing runtime, lockfile and cache**; **no global installs**. Stack is **Next.js 16.2.7 with React 19**.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
