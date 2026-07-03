# Grammarly-Lock (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the client-side "AI found N things — unlock with your coach" lock end-to-end, with the locked detail genuinely unreadable by the client, and no LLM work.

**Architecture:** A new coach-only table `client_ai_assessments` holds the locked `findings` (jsonb) + a public `findings_count`. The client never gets a SELECT policy on the table; it reads ONLY the integer count through a `SECURITY DEFINER` function `public.my_assessment_count()`. The coach reads/writes findings via existing `private.is_coach_of()` RLS. UI: a locked teaser card on the client dashboard (blurred placeholder + book/message CTAs) and a findings panel on the coach client page (manual add for P0; AI generation is P1).

**Tech Stack:** Next.js 16 (client components, `@supabase/ssr` browser client), Supabase Postgres + RLS, Drizzle schema (source of truth for `db:generate`), Vitest (`pg` pool against local Supabase on `127.0.0.1:54322`), `lib/i18n.tsx`.

**Guardrails (from project memory):**
- Production-critical, **zero-risk deploys** (`feedback_trophe_no_break`): preview-first; **do not apply this migration to prod without Daniel's explicit go**.
- Every `.sql` migration MUST have a matching `drizzle/meta/_journal.json` entry or `tests/db/migration-journal.test.ts` reds CI (`feedback_drizzle_journal_ci`).
- New RLS MUST be covered in a db test (`feedback`/WP2 precedent in `tests/db/rls.test.ts`).
- Gate `git push` on `tsc` exit code (`feedback_tsc_before_push`).
- DB tests require local Supabase: `npm run db:local:start && npm run db:bootstrap` first.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `db/schema/client_ai_assessments.ts` | Drizzle table + types (prevents `db:generate` drift) | Create |
| `db/schema/index.ts` | Barrel export | Modify |
| `drizzle/0049_client_ai_assessments.sql` | Table DDL + RLS + count function (hand-written) | Create |
| `drizzle/meta/_journal.json` | Register migration 0049 | Modify |
| `tests/db/client-ai-assessments.rls.test.ts` | Privacy boundary tests (client can't read findings; can read count; coach can) | Create |
| `lib/locales/en.ts`,`es.ts`,`el.ts` + `lib/i18n.tsx` | Teaser copy keys | Modify |
| `components/client/AssessmentLockCard.tsx` | Client locked teaser card | Create |
| `app/dashboard/page.tsx` | Fetch count via RPC + render the card | Modify |
| `components/coach/ClientFindingsPanel.tsx` | Coach add/list findings | Create |
| `app/coach/client/[id]/page.tsx` | Render the coach panel | Modify |

> **Note on i18n:** core languages (en/es/el) live inline in `lib/i18n.tsx` `translations`; overlay languages (fr/de/it/pt/nl) fall back to English automatically, so P0 only needs the 3 core entries.

---

## Task 1: Drizzle schema for `client_ai_assessments`

**Files:**
- Create: `db/schema/client_ai_assessments.ts`
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// db/schema/client_ai_assessments.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  unique,
  foreignKey,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/**
 * client_ai_assessments — the "Grammarly-lock" artifact.
 *
 * `findings` is the LOCKED detail (array of { title, body, severity?, source? }).
 * The client has NO select policy on this table; it can only learn `findings_count`
 * via the SECURITY DEFINER function public.my_assessment_count() (migration 0049).
 * The coach reads/writes via private.is_coach_of(user_id). One current row per client.
 */
export const clientAiAssessments = pgTable(
  'client_ai_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    coachId: uuid('coach_id').notNull(),
    /** Locked detail — NEVER exposed to the client. */
    findings: jsonb('findings').notNull().default(sql`'[]'::jsonb`),
    /** The only client-visible number (via my_assessment_count()). */
    findingsCount: integer('findings_count').notNull().default(0),
    /** Coarse, non-revealing labels for richer teaser copy (P1). */
    categories: text('categories').array(),
    source: text('source').notNull().default('coach'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('client_ai_assessments_user_key').on(t.userId),
    index('idx_caa_coach').on(t.coachId),
    foreignKey({ columns: [t.userId], foreignColumns: [profiles.id], name: 'client_ai_assessments_user_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [t.coachId], foreignColumns: [profiles.id], name: 'client_ai_assessments_coach_id_fkey' }).onDelete('cascade'),
    // Coach (or super_admin via is_coach_of) reads their client's assessment.
    pgPolicy('caa_coach_select', { as: 'permissive', for: 'select', to: ['authenticated'], using: sql`private.is_coach_of(user_id)` }),
    // Coach who owns the relationship manages findings. NOTE: deliberately NO client policy.
    pgPolicy('caa_coach_manage', { as: 'permissive', for: 'all', to: ['authenticated'],
      using: sql`(coach_id = (SELECT auth.uid()) AND private.is_coach_of(user_id))`,
      withCheck: sql`(coach_id = (SELECT auth.uid()) AND private.is_coach_of(user_id))` }),
    pgPolicy('caa_super_admin_all', { as: 'permissive', for: 'all', to: ['authenticated'],
      using: sql`(SELECT private.is_super_admin())`, withCheck: sql`(SELECT private.is_super_admin())` }),
  ],
);

export type Finding = { title: string; body: string; severity?: 'info' | 'watch' | 'flag'; source?: string };
export type InsertClientAiAssessment = typeof clientAiAssessments.$inferInsert;
export type SelectClientAiAssessment = typeof clientAiAssessments.$inferSelect;
```

- [ ] **Step 2: Export from the barrel**

In `db/schema/index.ts`, add after the `export * from './feedback';` line:

```typescript
export * from './client_ai_assessments';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (exit 0, no errors).

- [ ] **Step 4: Commit**

```bash
git add db/schema/client_ai_assessments.ts db/schema/index.ts
git commit -m "feat(db): client_ai_assessments schema (grammarly-lock P0)"
```

---

## Task 2: Migration SQL + journal entry

**Files:**
- Create: `drizzle/0049_client_ai_assessments.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Write the migration (hand-written, table + RLS + count function)**

```sql
-- drizzle/0049_client_ai_assessments.sql
-- Grammarly-lock P0: coach-only findings + client-readable count only.

CREATE TABLE IF NOT EXISTS client_ai_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings_count integer NOT NULL DEFAULT 0,
  categories text[],
  source text NOT NULL DEFAULT 'coach',
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_ai_assessments_user_key UNIQUE (user_id),
  CONSTRAINT client_ai_assessments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT client_ai_assessments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caa_coach ON client_ai_assessments (coach_id);

-- New table is created without RLS-on by default in this DB only because 0008's
-- bulk loop already ran; enable + lock down explicitly here.
ALTER TABLE client_ai_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON client_ai_assessments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_ai_assessments TO authenticated;

-- Coach (or super_admin via is_coach_of) reads their client's row.
CREATE POLICY caa_coach_select ON client_ai_assessments FOR SELECT TO authenticated
  USING (private.is_coach_of(user_id));
-- Coach who owns the relationship manages findings. NO client policy by design.
CREATE POLICY caa_coach_manage ON client_ai_assessments FOR ALL TO authenticated
  USING (coach_id = (SELECT auth.uid()) AND private.is_coach_of(user_id))
  WITH CHECK (coach_id = (SELECT auth.uid()) AND private.is_coach_of(user_id));
CREATE POLICY caa_super_admin_all ON client_ai_assessments FOR ALL TO authenticated
  USING (private.is_super_admin())
  WITH CHECK (private.is_super_admin());

-- Count-without-body: the ONLY way a client learns N. SECURITY DEFINER bypasses RLS
-- but returns just the integer for the calling user. Lives in public so PostgREST
-- exposes it to supabase.rpc('my_assessment_count').
CREATE OR REPLACE FUNCTION public.my_assessment_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT findings_count FROM client_ai_assessments
      WHERE user_id = (SELECT auth.uid())
      ORDER BY generated_at DESC
      LIMIT 1),
    0);
$$;

REVOKE ALL ON FUNCTION public.my_assessment_count() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_assessment_count() TO authenticated;
```

- [ ] **Step 2: Register the migration in the journal**

In `drizzle/meta/_journal.json`, append a new object to the `entries` array, immediately after the `0048_memory_worker_vault_secret` entry (idx 56). Use the next `idx` (57) and a `when` strictly greater than `1780852599999` and unique:

```json
    {
      "idx": 57,
      "version": "7",
      "when": 1782000000000,
      "tag": "0049_client_ai_assessments",
      "breakpoints": true
    }
```

- [ ] **Step 3: Verify the journal test passes**

Run: `npm test tests/db/migration-journal.test.ts`
Expected: PASS — every `.sql` (now including `0049_client_ai_assessments`) has exactly one journal entry; all `when` unique.

- [ ] **Step 4: Apply locally and confirm it loads**

Run: `npm run db:local:start && npm run db:bootstrap`
Expected: migrations apply with no error; `client_ai_assessments` exists.
(If `db:bootstrap` does not pick up new SQL automatically, run `npm run db:migrate`.)

- [ ] **Step 5: Commit**

```bash
git add drizzle/0049_client_ai_assessments.sql drizzle/meta/_journal.json
git commit -m "feat(db): 0049 grammarly-lock RLS + my_assessment_count()"
```

---

## Task 3: RLS privacy tests (the security boundary)

**Files:**
- Create: `tests/db/client-ai-assessments.rls.test.ts`

This mirrors the harness in `tests/db/rls.test.ts` (`asUser`, `asOwner`, error code `42501`). Reuse the existing seeded `IDS` if exported; otherwise this file defines its own minimal fixtures using `asOwner` inserts.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/db/client-ai-assessments.rls.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgresql://postgres:${process.env.PGPASSWORD || 'postgres'}@127.0.0.1:54322/postgres`,
  max: 5,
});

// Deterministic fixture ids for this suite.
const COACH = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

async function asOwner(text: string, params: unknown[] = []) {
  const c = await pool.connect();
  try { return await c.query(text, params); } finally { c.release(); }
}

async function asUser<T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await c.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    return await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
}

async function expect42501(action: () => Promise<unknown>) {
  try { await action(); throw new Error('expected 42501'); }
  catch (e) { expect((e as { code?: string }).code).toBe('42501'); }
}

beforeAll(async () => {
  // Minimal auth.users + profiles + coach→client link, then one assessment row.
  for (const [id, role] of [[COACH, 'coach'], [CLIENT, 'client'], [OTHER, 'client']] as const) {
    await asOwner(`INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, `${id}@t.test`]);
    await asOwner(`INSERT INTO profiles (id, full_name, email, role) VALUES ($1, 'T', $2, $3) ON CONFLICT (id) DO NOTHING`, [id, `${id}@t.test`, role]);
  }
  await asOwner(`INSERT INTO client_profiles (user_id, coach_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET coach_id = EXCLUDED.coach_id`, [CLIENT, COACH]);
  await asOwner(`INSERT INTO client_ai_assessments (user_id, coach_id, findings, findings_count) VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET findings = EXCLUDED.findings, findings_count = EXCLUDED.findings_count`,
    [CLIENT, COACH, JSON.stringify([{ title: 'secret', body: 'locked detail' }, { title: 'two', body: 'more' }]), 2]);
});

afterAll(async () => {
  await asOwner(`DELETE FROM client_ai_assessments WHERE user_id IN ($1,$2)`, [CLIENT, OTHER]);
  await asOwner(`DELETE FROM client_profiles WHERE user_id IN ($1,$2)`, [CLIENT, OTHER]);
  await asOwner(`DELETE FROM profiles WHERE id IN ($1,$2,$3)`, [COACH, CLIENT, OTHER]);
  await asOwner(`DELETE FROM auth.users WHERE id IN ($1,$2,$3)`, [COACH, CLIENT, OTHER]);
  await pool.end();
});

describe('client_ai_assessments — RLS', () => {
  it('client CANNOT read its own findings row (no client select policy)', async () => {
    const rows = await asUser(CLIENT, (c) => c.query(`SELECT findings FROM client_ai_assessments WHERE user_id = $1`, [CLIENT]));
    expect(rows.rowCount).toBe(0);
  });

  it('client CAN read its count via my_assessment_count()', async () => {
    const rows = await asUser(CLIENT, (c) => c.query(`SELECT public.my_assessment_count() AS n`));
    expect(rows.rows[0].n).toBe(2);
  });

  it('client CANNOT insert/forge an assessment', async () => {
    await expect42501(() => asUser(CLIENT, (c) =>
      c.query(`INSERT INTO client_ai_assessments (user_id, coach_id, findings_count) VALUES ($1, $1, 99)`, [CLIENT])));
  });

  it('assigned coach CAN read the full findings', async () => {
    const rows = await asUser(COACH, (c) => c.query(`SELECT findings_count FROM client_ai_assessments WHERE user_id = $1`, [CLIENT]));
    expect(rows.rows[0]?.findings_count).toBe(2);
  });

  it('unassigned coach CANNOT read the row', async () => {
    const rows = await asUser(OTHER, (c) => c.query(`SELECT * FROM client_ai_assessments WHERE user_id = $1`, [CLIENT]));
    expect(rows.rowCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails (table/function not yet applied in this DB? — should now exist from Task 2)**

Run: `npm test tests/db/client-ai-assessments.rls.test.ts`
Expected: PASS if Task 2's migration was applied locally. If the suite errors with "relation client_ai_assessments does not exist" or "function my_assessment_count does not exist", re-run `npm run db:bootstrap` / `npm run db:migrate` and retry. (This test is the proof the RLS boundary holds.)

- [ ] **Step 3: Commit**

```bash
git add tests/db/client-ai-assessments.rls.test.ts
git commit -m "test(db): grammarly-lock RLS boundary (client count-only, coach full)"
```

---

## Task 4: i18n teaser copy

**Files:**
- Modify: `lib/i18n.tsx`

- [ ] **Step 1: Add the core (en/es/el) keys**

In `lib/i18n.tsx`, inside the `translations` object, add these entries (place them near other `dash.*` keys):

```typescript
  'assessment.locked_title': { en: 'AI found {n} things in your profile', es: 'La IA encontró {n} cosas en tu perfil', el: 'Η AI βρήκε {n} πράγματα στο προφίλ σου' },
  'assessment.locked_sub': { en: 'Unlock the full assessment with your coach', es: 'Desbloquea la evaluación completa con tu coach', el: 'Ξεκλείδωσε την πλήρη αξιολόγηση με τον προπονητή σου' },
  'assessment.unlock_book': { en: 'Book a session', es: 'Reservar sesión', el: 'Κλείσε ραντεβού' },
  'assessment.unlock_message': { en: 'Message coach', es: 'Mensaje al coach', el: 'Μήνυμα στον προπονητή' },
  'assessment.empty_nudge': { en: 'Complete your intake to unlock your assessment', es: 'Completa tu cuestionario para desbloquear tu evaluación', el: 'Ολοκλήρωσε το ερωτηματολόγιο για να ξεκλειδώσεις την αξιολόγηση' },
```

- [ ] **Step 2: Typecheck (the `translations` map is compiler-enforced for core langs)**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/i18n.tsx
git commit -m "feat(i18n): grammarly-lock teaser copy (en/es/el)"
```

---

## Task 5: Client locked teaser card component

**Files:**
- Create: `components/client/AssessmentLockCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/client/AssessmentLockCard.tsx
'use client';

import { motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import Icon from '@/components/Icon';

/**
 * Grammarly-lock teaser. Renders ONLY the count (never the detail). If count === 0
 * we show an intake nudge instead of hiding, doubling as an intake-completion prompt.
 */
export default function AssessmentLockCard({ count }: { count: number }) {
  const { t } = useI18n();

  if (count <= 0) {
    return (
      <motion.a href="/dashboard/intake" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="card mb-3" style={{ display: 'block', padding: '12px 14px', background: 'rgba(255,255,255,.025)', textDecoration: 'none' }}>
        <div className="row-i" style={{ gap: 10 }}>
          <Icon name="i-lock" size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{t('assessment.empty_nudge')}</span>
        </div>
      </motion.a>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="card-g mb-3" style={{ padding: '14px', position: 'relative', overflow: 'hidden' }}>
      <div className="row-i" style={{ gap: 10, marginBottom: 8 }}>
        <Icon name="i-zap" size={14} style={{ color: 'var(--gold-300,#D4A853)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{t('assessment.locked_title', { n: count })}</span>
      </div>

      {/* Blurred placeholder — NEVER real findings (the detail is not fetched). */}
      <div aria-hidden style={{ filter: 'blur(6px)', userSelect: 'none', pointerEvents: 'none', marginBottom: 10, opacity: 0.5 }}>
        <div style={{ height: 8, width: '82%', background: 'var(--t4)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, width: '64%', background: 'var(--t4)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, width: '73%', background: 'var(--t4)', borderRadius: 4 }} />
      </div>

      <div className="row-i" style={{ gap: 6, marginBottom: 10 }}>
        <Icon name="i-lock" size={11} style={{ color: 'var(--gold-300,#D4A853)' }} />
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{t('assessment.locked_sub')}</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <a href="/dashboard/book" className="btn-gold" style={{ padding: '7px 12px', fontSize: 10, borderRadius: 10, textDecoration: 'none' }}>
          {t('assessment.unlock_book')}
        </a>
        <a href="/dashboard/messages" className="btn-ghost" style={{ padding: '7px 12px', fontSize: 10, borderRadius: 10, textDecoration: 'none' }}>
          {t('assessment.unlock_message')}
        </a>
      </div>
    </motion.div>
  );
}
```

> If `i-lock` is not a registered `Icon` name, substitute an existing one (check `components/Icon.tsx` for the registered set — `i-zap`, `i-check`, `i-target` are confirmed in use). This is a 1-line swap, not a blocker.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/client/AssessmentLockCard.tsx
git commit -m "feat(client): AssessmentLockCard teaser (count-only, blurred)"
```

---

## Task 6: Wire the count fetch + card into the client dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Add state + import**

Near the top of `app/dashboard/page.tsx`, add the import (alongside the other component imports):

```typescript
import AssessmentLockCard from '@/components/client/AssessmentLockCard';
```

With the other `useState` hooks in the component, add:

```typescript
const [assessmentCount, setAssessmentCount] = useState(0);
```

- [ ] **Step 2: Fetch the count in `loadData` (via the RPC — count without body)**

Inside the `loadData` callback, after the existing `Promise.all([...])` block (around line 234), add:

```typescript
const { data: aCount } = await supabase.rpc('my_assessment_count');
setAssessmentCount(typeof aCount === 'number' ? aCount : 0);
```

- [ ] **Step 3: Render the card**

Immediately BEFORE the existing insight strip (the `{(() => { let icon... })()}` block around line 874), render:

```tsx
<AssessmentLockCard count={assessmentCount} />
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS (0 type errors; build emits the route).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(client): show grammarly-lock card on dashboard (rpc count)"
```

---

## Task 7: Coach findings panel (manual add for P0)

**Files:**
- Create: `components/coach/ClientFindingsPanel.tsx`

P0 lets the coach add plain findings (title + body) so the count is real and coach-owned. No LLM. Matches `CoachInsightPanel` card styling.

- [ ] **Step 1: Create the panel**

```tsx
// components/coach/ClientFindingsPanel.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Finding } from '@/db/schema/client_ai_assessments';

export default function ClientFindingsPanel({ clientId, coachId }: { clientId: string; coachId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('client_ai_assessments')
      .select('findings')
      .eq('user_id', clientId)
      .maybeSingle();
    setFindings(((data?.findings as Finding[]) ?? []));
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const add = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    const next = [...findings, { title: title.trim(), body: body.trim() }];
    // Upsert one current row per client; keep count in sync.
    const { error } = await supabase
      .from('client_ai_assessments')
      .upsert(
        { user_id: clientId, coach_id: coachId, findings: next, findings_count: next.length, source: 'coach', generated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    setSaving(false);
    if (!error) { setTitle(''); setBody(''); setFindings(next); }
  }, [title, body, findings, clientId, coachId]);

  return (
    <section className="bg-white/[0.04] border border-[#D4A853]/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-[#D4A853]/10 text-[#D4A853]"><Lock size={16} /></div>
        <div>
          <h2 className="text-stone-100 text-sm font-semibold">Assessment findings</h2>
          <p className="text-stone-500 text-xs mt-0.5">Locked to the client — they see only the count ({findings.length}) until they book/message you.</p>
        </div>
      </div>

      <ul className="space-y-2 mb-3">
        {findings.map((f, i) => (
          <li key={i} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-sm text-stone-200 font-medium">{f.title}</div>
            {f.body && <div className="text-xs text-stone-400 mt-0.5">{f.body}</div>}
          </li>
        ))}
        {findings.length === 0 && <li className="text-xs text-stone-500">No findings yet.</li>}
      </ul>

      <div className="space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Finding title (e.g. 'Protein consistently low')"
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-[#D4A853]/60 focus:outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Detail (locked to the client)"
          className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-[#D4A853]/60 focus:outline-none" />
        <button type="button" onClick={() => void add()} disabled={saving || !title.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-[#D4A853] px-3 py-2 text-stone-950 text-sm font-medium disabled:opacity-40">
          <Plus size={15} /> Add finding
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/coach/ClientFindingsPanel.tsx
git commit -m "feat(coach): ClientFindingsPanel (manual findings, P0)"
```

---

## Task 8: Render the coach panel on the client detail page

**Files:**
- Modify: `app/coach/client/[id]/page.tsx`

- [ ] **Step 1: Import the panel**

Near the `CoachInsightPanel` import (line ~52), add:

```typescript
import ClientFindingsPanel from '@/components/coach/ClientFindingsPanel';
```

- [ ] **Step 2: Render it next to the assessment block**

Immediately AFTER the Assessment block (the `<div className="glass p-4 mb-4">...</div>` ending around line 1053), add. `clientId` is the route param already in scope; obtain the coach id from the loaded session/profile already used on this page (use the existing `me?.id` / current-user variable — search the file for where the coach's own id is read after `supabase.auth.getUser()`):

```tsx
<div className="mb-4">
  <ClientFindingsPanel clientId={clientId} coachId={coachId} />
</div>
```

> If a `coachId` variable is not already in scope, add it from the existing auth load on this page: `const { data: { user } } = await supabase.auth.getUser();` → store `user.id` in a `coachId` state (the page already calls `getUser()` for its role gate — reuse that value rather than calling again).

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/coach/client/[id]/page.tsx
git commit -m "feat(coach): show ClientFindingsPanel on client detail"
```

---

## Task 9: Full verification (preview-first — NO prod deploy without Daniel's go)

- [ ] **Step 1: Run the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: typecheck/lint/build clean; the new RLS test + migration-journal test PASS. (Local Supabase must be running for db tests.)

- [ ] **Step 2: Manual smoke on a PREVIEW deploy (not prod)**

Deploy a Vercel **preview** (not production). As a coach, open a client → add two findings. As that client (separate session), open the dashboard → confirm the card reads "AI found 2 things…", the detail is blurred, and **the network tab shows no request returning the findings text** (only the `my_assessment_count` rpc returning `2`). This is the privacy proof.

- [ ] **Step 3: STOP and hand to Daniel for the production go/no-go.** Per `feedback_trophe_no_break`, the prod migration + deploy require his explicit approval. Do not promote to production in this plan.

---

## Self-Review (done at authoring)

- **Spec coverage:** §3 data model → Task 1/2; §4 RLS (pattern A: coach-only table + SECURITY DEFINER count) → Task 2 + Task 3 tests; §5 UI (client teaser + coach view) → Tasks 5–8; §6 P0 (no LLM, manual findings) → Task 7. §7 risk "count-leak via select(*)" → avoided (separate table, no client policy, count via rpc only) and asserted in Task 3 test 1. §7 risk "coach_notes already client-readable" → findings live in the new locked table, NOT derived from coach_notes, so the lock is real.
- **Type consistency:** `Finding` type defined in Task 1 and imported in Task 7; `findings_count` column name consistent across schema, SQL, RPC, and tests; `my_assessment_count` name consistent (SQL ↔ `supabase.rpc` ↔ test).
- **Open questions deferred to P1 (documented, not blocking P0):** AI generation of findings; categorized teaser; versioned history; intake-as-source. P0 ships with coach-authored findings + count-only lock.
