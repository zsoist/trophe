/**
 * WP1 part 2 — PREVIEW-GATE validation harness (LOCAL-ONLY by default, safety-gated).
 *
 * Proves the email-verification lifecycle against a LIVE stack as repeatable evidence:
 *   1. signup → HTTP 202 verification_required
 *   2. pre-confirmation password login is REJECTED (the unconfirmed hold works)
 *   3. confirmation email DELIVERED (Admin-created user) + the verify link redirects to APP
 *   4. post-confirmation password login SUCCEEDS (usable session)
 *   5. replay signup → 202 + a NEW confirmation email, with NO duplicate Auth account
 *
 * ⚠ SAFETY: this is DESTRUCTIVE (creates an Auth user + profile + consent + reservation,
 * then cleans them up). It is LOOPBACK-ONLY unless you explicitly opt into a remote target,
 * because Trophē has no isolated Supabase preview branch — a stray run could hit PRODUCTION.
 *   - Local (default): everything on 127.0.0.1 — no extra flags.
 *   - Remote: requires BOTH E2E_ALLOW_REMOTE=true AND E2E_EXPECTED_PROJECT_REF=<ref>, and
 *     the Supabase URL's project ref must match (else it aborts). The target is printed first.
 *   - Mailpit-based delivery checks (3, 5-new-email) require a reachable MAILPIT_URL; a hosted
 *     SMTP inbox has no Mailpit API, so delivery is LOCAL-only (skipped+flagged otherwise).
 *
 * PRECONDITIONS: enable_confirmations=true + migrations 0042–0047 applied + the app running
 * with NEXT_PUBLIC_SITE_URL=APP_BASE_URL. Local: `supabase start` then `npm run dev`.
 *
 * CONFIG (env; local defaults; keys/ports from `supabase status`):
 *   APP_BASE_URL http://127.0.0.1:3000 | E2E_SUPABASE_URL http://127.0.0.1:54321
 *   E2E_SUPABASE_ANON_KEY (req) | E2E_SUPABASE_SERVICE_KEY (req) | MAILPIT_URL http://127.0.0.1:54324
 *
 * RUN:  E2E_SUPABASE_ANON_KEY=… E2E_SUPABASE_SERVICE_KEY=… npx tsx scripts/test/wp1-signup-confirm-e2e.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const APP = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000';
const SB_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.E2E_SUPABASE_SERVICE_KEY ?? '';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

let fails = 0;
const check = (cond: boolean, msg: string) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fails++; };
const isLoopback = (u: string) => { try { return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(u).hostname); } catch { return false; } };
const sameOrigin = (a: string, b: string) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };

/** P0 safety gate: refuse a remote (non-loopback) target unless explicitly + correctly opted in. */
function assertSafeTarget() {
  const remote = !isLoopback(SB_URL) || !isLoopback(APP);
  if (!remote) return;
  if (process.env.E2E_ALLOW_REMOTE !== 'true') {
    console.error(`REFUSING remote/destructive run against ${SB_URL} (APP ${APP}). Set E2E_ALLOW_REMOTE=true to opt in.`);
    process.exit(2);
  }
  const ref = (() => { try { return new URL(SB_URL).hostname.split('.')[0]; } catch { return ''; } })();
  const expected = process.env.E2E_EXPECTED_PROJECT_REF ?? '';
  if (!expected || ref !== expected) {
    console.error(`REFUSING remote run: Supabase project ref "${ref}" != E2E_EXPECTED_PROJECT_REF "${expected}". Aborting to avoid hitting the wrong (e.g. PRODUCTION) project.`);
    process.exit(2);
  }
  console.warn(`⚠ REMOTE destructive run AUTHORIZED — target Supabase project "${ref}" (${SB_URL}), app ${APP}.`);
}

async function mailpitReachable(): Promise<boolean> {
  try { return (await fetch(`${MAILPIT}/api/v1/messages?limit=1`)).ok; } catch { return false; }
}
async function countMessagesTo(email: string): Promise<number> {
  try {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
    if (!res.ok) return 0;
    const j = (await res.json()) as { messages_count?: number; messages?: unknown[] };
    return j.messages_count ?? j.messages?.length ?? 0;
  } catch { return 0; }
}
async function fetchConfirmationLink(email: string): Promise<string | null> {
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
      if (res.ok) {
        const msg = ((await res.json()) as { messages?: Array<{ ID: string }> }).messages?.[0];
        if (msg) {
          const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json() as { HTML?: string; Text?: string };
          const m = `${full.HTML ?? ''}\n${full.Text ?? ''}`.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/);
          if (m) return m[0].replace(/&amp;/g, '&');
        }
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function countAuthUsersByEmail(admin: SupabaseClient, email: string): Promise<number> {
  let page = 1, total = 0;
  for (; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data?.users ?? [];
    total += users.filter((u) => u.email === email).length;
    if (users.length < 1000) break;
  }
  return total;
}

async function postSignup(email: string, password: string) {
  const res = await fetch(`${APP}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: 'E2E Tester', consent: true }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) as { verification_required?: boolean; user_id?: string; error?: string } };
}

/** Full cleanup (DB rows the completed reservation leaves behind + the Auth user). The
 *  service-role `admin` client doubles as the DB client (PostgREST, RLS-bypassing).
 *  Reports failures, never swallows. */
async function cleanup(admin: SupabaseClient, userId: string | undefined, email: string) {
  if (!userId) { try { const c = await countAuthUsersByEmail(admin, email); if (c) console.error(`  ! cleanup: ${c} user(s) for ${email} but no id captured — manual cleanup needed`); } catch { /* */ } return; }
  for (const t of ['client_profiles', 'consents', 'invite_reservations']) {
    const { error } = await admin.from(t).delete().eq('user_id', userId);
    if (error) console.error(`  ! cleanup ${t}: ${error.message}`);
  }
  const { error: pe } = await admin.from('profiles').delete().eq('id', userId);
  if (pe) console.error(`  ! cleanup profiles: ${pe.message}`);
  const { error: de } = await admin.auth.admin.deleteUser(userId);
  if (de) console.error(`  ! cleanup deleteUser: ${de.message}`);
}

async function main() {
  if (!ANON || !SERVICE) { console.error('Set E2E_SUPABASE_ANON_KEY and E2E_SUPABASE_SERVICE_KEY (from `supabase status`).'); process.exit(2); }
  assertSafeTarget();
  const anon = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const email = `wp1-e2e-${Date.now()}@example.com`;
  const password = 'Pw-e2e-12345';
  const haveMailpit = await mailpitReachable();
  console.log(`WP1 PREVIEW-GATE — app=${APP} supabase=${SB_URL} mailpit=${haveMailpit ? MAILPIT : 'UNREACHABLE (delivery checks skipped)'}\n  test email=${email}`);

  let userId: string | undefined;
  try {
    // 1. signup → 202 verification_required (capture the user_id for cleanup + dup check)
    const su = await postSignup(email, password);
    userId = su.body.user_id;
    check(su.status === 202 && su.body.verification_required === true, `(1) signup → 202 verification_required (got ${su.status})`);

    // 2. pre-confirmation login REJECTED
    const pre = await anon.auth.signInWithPassword({ email, password });
    check(!!pre.error && !pre.data.session, `(2) pre-confirmation login REJECTED (${pre.error?.message ?? 'NO ERROR — hold not enforced!'})`);

    // 3. delivery + redirect correctness (Mailpit only)
    if (haveMailpit) {
      const link = await fetchConfirmationLink(email);
      check(!!link, '(3) confirmation email delivered + verify link found');
      if (link) {
        const r = await fetch(link, { redirect: 'manual' });
        const loc = r.headers.get('location') ?? '';
        check((r.status === 302 || r.status === 303 || r.status === 307) && sameOrigin(loc, APP), `(3) verify link redirects to APP origin (status ${r.status}, location ${loc || 'none'})`);
      }
    } else {
      console.log('  – (3) delivery/redirect SKIPPED (no Mailpit) — run locally, or verify hosted SMTP delivery manually');
    }

    // 4. post-confirmation login SUCCEEDS (only meaningful if we confirmed via Mailpit)
    if (haveMailpit) {
      const post = await anon.auth.signInWithPassword({ email, password });
      check(!post.error && !!post.data.session, `(4) post-confirmation login SUCCEEDS (${post.error?.message ?? 'session established'})`);
    } else {
      console.log('  – (4) post-confirmation login SKIPPED (confirmation not performed without Mailpit)');
    }

    // 5. replay → 202 + a NEW email delivered + NO duplicate account
    const before = haveMailpit ? await countMessagesTo(email) : 0;
    const replay = await postSignup(email, password);
    check(replay.status === 202, `(5) replay signup → 202 resend (got ${replay.status})`);
    if (haveMailpit) {
      let after = before;
      for (let i = 0; i < 15 && after <= before; i++) { await new Promise((r) => setTimeout(r, 1000)); after = await countMessagesTo(email); }
      check(after > before, `(5) replay delivered a NEW confirmation email (${before} → ${after})`);
    }
    check(await countAuthUsersByEmail(admin, email) === 1, '(5) exactly ONE Auth user (no duplicate, paginated)');
  } finally {
    await cleanup(admin, userId, email);
  }

  console.log(fails === 0 ? '\n✅ PREVIEW-GATE PASSED' : `\n❌ ${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
