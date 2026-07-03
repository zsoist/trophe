# Trophē — "Grammarly-Lock" Client-AI Gating — Design Spec (FOR APPROVAL)

_Status: DRAFT / awaiting Daniel's approval. Date: 2026-06-24. Source: partner walkthrough
([partner-meeting-2026-06-24.md](../../coach/partner-meeting-2026-06-24.md), backlog item B1, P0)._
_No code written — read-only research spec._

## 1. Summary

Today Trophē generates AI insights about a client (the on-demand `coach_insight` Q&A in
`app/api/ai/coach-insight/route.ts`) but renders them **only on the coach side**, and the client's
free-text `assessment` is explicitly "visible only to you" (coach). The "Grammarly-lock" feature
inverts the funnel on the client side: the CLIENT dashboard shows that AI insights *exist* about them
("AI found **N** things in your profile / form") as a **teaser count with the detail blurred/locked**,
and the unlock CTA routes them to **book or message the coach** (`/dashboard/book`,
`/dashboard/messages`) — both surfaces already exist. The full assessment continues to render only
coach-side. The single hard architectural constraint: the client currently reads its **entire**
`client_profiles` row via `select('*')` under the `client_profiles_own_all` RLS policy, so the locked
detail **cannot** live in a column the client can read — the teaser count must be exposed without the
body, which forces either a column-level split or a server-computed count endpoint (see §4).

## 2. What exists today vs. what's needed

**Exists today (grounded):**
- **Coach-side AI insight (on-demand):** `app/api/ai/coach-insight/route.ts` — coach types a question,
  server assembles `buildClientSnapshot` + memory + coach blocks + RAG, returns a single free-text
  `insight` string. Rendered by `components/coach/CoachInsightPanel.tsx` on
  `app/coach/client/[id]/page.tsx` (imported line 52). It is **not** a persisted, structured
  "N findings" object — it's ephemeral Q&A.
- **Coach-side assessment (manual free-text):** `client_profiles.assessment` (`db/schema/profiles.ts:108`).
  Edited on the coach page (`app/coach/client/[id]/page.tsx:1036-1053`), labeled `interview notes —
  visible only to you` (line 1041).
- **Client dashboard insight strip:** `app/dashboard/page.tsx:874-896` — but these are deterministic,
  client-side heuristics (sugar high / protein low / hydration), **not** the coach AI.
- **Unlock destinations already built:** `app/dashboard/book/page.tsx`, `app/dashboard/messages/page.tsx`,
  plus the inline coach-message box (`app/dashboard/page.tsx:914+`).
- **Persisted AI history:** `agent_conversation` and `agent_runs` (`db/schema/agent_runs.ts`) store
  telemetry/turns, not a structured client-facing assessment.

**Needed (new):**
1. A **structured, persisted assessment artifact** with a countable number of "findings" (so "N things"
   is real, not faked).
2. A **safe way to expose the count to the client without the detail** — the current `select('*')` +
   `client_profiles_own_all` policy leaks any new column to the client.
3. **Client teaser UI** (locked card + unlock CTA) on `app/dashboard/page.tsx`.
4. **Coach full-assessment view** rendering the same artifact unredacted on `app/coach/client/[id]/page.tsx`.

## 3. Data-model touchpoints

Recommended: a **new table** rather than columns on `client_profiles`, because the locked body must be
unreadable by the client while the count must be readable, and `client_profiles` is read by the client
with `select('*')`.

**New table `client_ai_assessments`** (one current row per client; or versioned with `created_at`):
- `id uuid pk`
- `user_id uuid` (the client; FK → `profiles.id`)
- `coach_id uuid` (FK → `profiles.id`)
- `findings jsonb` — the **locked detail** (array of `{ title, body, severity, source }`); never sent to client.
- `findings_count integer` — the **public teaser count** ("N things"); the only client-readable field.
- `categories text[]` (optional) — coarse, non-revealing labels for the teaser (e.g. "nutrition", "sleep").
- `generated_at timestamptz`, `source text` (`'ai' | 'coach'`), `model text` / `generation_id uuid` (→ `agent_runs`).

**Alternative (lighter, P0):** add `assessment_findings_count integer` to `client_profiles` **only if**
the client read path is simultaneously narrowed off `select('*')` (see §4 risk). The standalone table
is cleaner because RLS can be column-free and the detail never sits next to client-readable data.

The existing free-text `client_profiles.assessment` stays as the coach's manual notes; the new table
holds the **structured, gateable** AI/coach findings that power the count.

## 4. RLS implications (the crux)

The client **must read the count/existence but NOT the detail.** Postgres RLS is **row-level, not
column-level**, so a single table where the client can `SELECT` the row will expose `findings`. Three
viable patterns:

- **(A — recommended) Split storage + count-only exposure via a SECURITY DEFINER RPC or view.** Keep
  `findings` in `client_ai_assessments` with **no client SELECT policy** (coach/admin only, mirroring
  `client_profiles_coach_select` using `private.is_coach_of(user_id)` from `drizzle/0008…sql:111`).
  Expose the count to the client through a `SECURITY DEFINER` function (e.g. `public.my_assessment_count()`)
  in the established `private`-helper style (`private.is_coach_of`, `private.is_super_admin` —
  `drizzle/0008…sql:54-66`), returning only `findings_count` for `auth.uid()`. Cleanest "count without
  body" boundary; matches the codebase's existing SECURITY DEFINER convention.
- **(B) Two-table split:** client-readable `client_assessment_meta(user_id, findings_count)` (own-select
  policy) + coach-only `client_assessment_detail(findings)`. More tables, pure RLS, no functions.
- **(C — avoid)** Single table + client SELECT policy + "just don't select the column" in app code.
  **Rejected:** RLS still permits the client to `select('findings')` directly via the anon/auth Supabase
  client; the trust boundary would live in client code, violating the Grammarly-lock premise.

**Coach/admin read:** unchanged — `private.is_coach_of(user_id)` for coach, `private.is_super_admin()`
for staff; coach reads `findings` in full. **Generation/write** server-side only (service role or a
guarded route like `guardAiRoute` + `assertCanAccessClient` in `lib/auth/tenant-access.ts`), never
client-writable.

**Migration discipline (per memory):** any migration applied via Supabase MCP must also be added to
`drizzle/meta/_journal.json` or `tests/db/migration-journal.test.ts` reds CI; new RLS must be covered in
`tests/db/rls.test.ts`.

## 5. UI surfaces

**Client (`app/dashboard/page.tsx`):** a new **locked teaser card** (near the existing insight strip at
`:874`, or pinned like the coach-messages block at `:513`):
- Headline: "AI found **{N}** things in your profile" (N from the count RPC; hide if N = 0).
- A **blurred/redacted preview** (CSS blur over placeholder rows — never fetch real `findings`).
- Lock icon + "Unlock the full assessment with your coach."
- **CTA → existing routes:** primary "Book a session" → `/dashboard/book`; secondary "Message coach" →
  `/dashboard/messages` (or inline box at `:914`). Reuses links already at `app/dashboard/page.tsx:935-940`.
- New i18n keys (`lib/i18n.tsx` / `lib/locales/*`), Spanish-first per project style.

**Coach (`app/coach/client/[id]/page.tsx`):** a **full assessment panel** rendering `findings`
unredacted, alongside the existing Assessment block (`:1036`) and `CoachInsightPanel` (`:52`).
Optional "Generate / refresh assessment" action calling a server route. Reuse `CoachInsightPanel`
visual language.

## 6. Phased plan

**P0 — minimal, ship the lock (highest value, lowest risk):**
1. Migration: create `client_ai_assessments` (or two-table split B) with coach-only RLS on detail; add
   `findings_count` exposure via SECURITY DEFINER RPC (pattern A). Update `_journal.json` + RLS tests.
2. **No new AI generation yet** — coach manually creates findings, OR backfill `findings_count` from a
   simple count of existing `coach_notes`/`assessment` so the count is non-zero. (Decouples lock UX from LLM.)
3. Client teaser card on `app/dashboard/page.tsx` reading the count RPC, blurred placeholder + CTAs.
4. Coach full-view panel reading `findings`.

**P1 — polish & automation:**
1. Real AI generation: a server route (mirroring `coach-insight`) producing **structured** findings from
   `buildClientSnapshot` + intake + memory; writes `findings`/`findings_count`, links `agent_runs`.
   100% DeepSeek per `feedback_deepseek_only`.
2. Teaser richness: non-revealing `categories` ("3 nutrition, 1 recovery") instead of bare N.
3. Coach "refresh assessment" + staleness badge; analytics on unlock-CTA → booking conversion (the hook).
4. i18n across all 8 locales; mobile-first QA (390×844).

## 7. Risks + open questions

**Risks:**
- **Count-leak via `select('*')`:** client dashboard pulls the full `client_profiles` row
  (`app/dashboard/page.tsx:228`). Detail must NOT live there. New-table + RPC avoids this — confirm no
  other client query does `select('*')` on the detail table.
- **`coach_notes` is already client-readable** (`db/schema/coach.ts:32`, "Clients view notes about them"),
  including `concern`-type notes. If findings derive from coach notes, the "locked" content may already be
  partially visible. Ensure gated `findings` aren't just a re-render of client-readable data.
- **RLS test coverage** (`tests/db/rls.test.ts`, `tests/db/compliance.test.ts`) must assert client
  **cannot** read `findings` and **can** read the count — a Tier-0 privacy boundary (GDPR/DPA WP open).
- **Production-critical, zero-risk deploys** (`feedback_trophe_no_break`): preview-first, no auth/RLS
  changes without explicit go.

**Open questions for Daniel:**
1. **What counts as a "thing"?** AI-generated structured findings, coach-entered items, or both?
   (Determines whether P0 ships without LLM work.)
2. **Bare number or categorized teaser?** ("N things" vs "3 nutrition, 1 sleep") — affects schema in P0.
3. **Per-client current row, or versioned history?**
4. **Does "form" mean the intake questionnaire** (`questionnaire_responses`)? If so, generation consumes
   intake answers as a primary source.
5. **N=0: hide the card or show "complete your intake to unlock"?** (The latter doubles as an intake nudge.)
6. **Anti-gaming:** is the locked value the *curated coach interpretation*, accepting a client could infer
   raw findings from their own data? (Frames the marketing claim.)
