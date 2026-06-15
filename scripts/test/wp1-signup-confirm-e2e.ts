/**
 * WP1 part 2 — PREVIEW-GATE validation harness (the final release gate as one command).
 *
 * Proves the email-verification lifecycle against a LIVE stack — turning the last manual
 * assumption into repeatable evidence. It exercises the real routes, the real Supabase
 * Auth (resend/confirm), and Mailpit, asserting all five required checks:
 *   1. signup → HTTP 202 verification_required
 *   2. pre-confirmation password login is REJECTED (the unconfirmed hold works)
 *   3. the confirmation email is DELIVERED (Admin-created user) + the link is accepted
 *   4. post-confirmation password login SUCCEEDS (usable session)
 *   5. replay signup → 202 resend with NO duplicate Auth account
 *
 * PRECONDITIONS (operator runs against a live env — local default below, or a preview):
 *   - supabase/config.toml: enable_confirmations = true (already set on this branch)
 *   - migrations 0042–0047 applied to the target DB
 *   - the app running with NEXT_PUBLIC_SITE_URL set to APP_BASE_URL
 *   - local: `supabase start` (brings up Auth + Mailpit) then `npm run dev`
 *
 * CONFIG (env; local defaults shown) — get the keys/ports from `supabase status`:
 *   APP_BASE_URL            http://127.0.0.1:3000     (Next app under test)
 *   E2E_SUPABASE_URL        http://127.0.0.1:54321    (Supabase API)
 *   E2E_SUPABASE_ANON_KEY   (required)
 *   E2E_SUPABASE_SERVICE_KEY(required)
 *   MAILPIT_URL             http://127.0.0.1:54324    (local Mailpit)
 *
 * RUN:  npx tsx scripts/test/wp1-signup-confirm-e2e.ts
 * Exit 0 = all five checks pass. This is an operator/preview tool (needs a live stack);
 * it is NOT part of the unit suite.
 */
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000';
const SB_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.E2E_SUPABASE_SERVICE_KEY ?? '';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

let fails = 0;
const check = (cond: boolean, msg: string) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fails++; };

async function fetchConfirmationLink(email: string): Promise<string | null> {
  // Mailpit API: find the most recent message to `email`, read its body, extract the
  // Supabase /auth/v1/verify confirmation link. Retries for delivery latency.
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
      if (res.ok) {
        const data = await res.json() as { messages?: Array<{ ID: string }> };
        const msg = data.messages?.[0];
        if (msg) {
          const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json() as { HTML?: string; Text?: string };
          const body = `${full.HTML ?? ''}\n${full.Text ?? ''}`;
          const m = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/);
          if (m) return m[0].replace(/&amp;/g, '&');
        }
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function postSignup(email: string, password: string): Promise<{ status: number; body: { verification_required?: boolean; error?: string } }> {
  const res = await fetch(`${APP}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: 'E2E Tester', consent: true }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  if (!ANON || !SERVICE) {
    console.error('Set E2E_SUPABASE_ANON_KEY and E2E_SUPABASE_SERVICE_KEY (from `supabase status`).');
    process.exit(2);
  }
  const anon = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const email = `wp1-e2e-${Date.now()}@example.com`;
  const password = 'Pw-e2e-12345';
  console.log(`WP1 signup→confirm PREVIEW-GATE — app=${APP} supabase=${SB_URL}\n  test email=${email}`);

  // 1. signup → 202 verification_required
  const su = await postSignup(email, password);
  check(su.status === 202 && su.body.verification_required === true, `(1) signup → 202 verification_required (got ${su.status})`);

  // 2. pre-confirmation login REJECTED
  const pre = await anon.auth.signInWithPassword({ email, password });
  check(!!pre.error && !pre.data.session, `(2) pre-confirmation password login REJECTED (${pre.error?.message ?? 'NO ERROR — hold not enforced!'})`);

  // 3. confirmation email delivered + link accepted
  const link = await fetchConfirmationLink(email);
  check(!!link, '(3) confirmation email delivered + verify link found in Mailpit');
  if (link) {
    const r = await fetch(link, { redirect: 'manual' });
    check(r.status >= 200 && r.status < 400, `(3) confirmation link accepted (status ${r.status})`);
  }

  // 4. post-confirmation login SUCCEEDS
  const post = await anon.auth.signInWithPassword({ email, password });
  check(!post.error && !!post.data.session, `(4) post-confirmation password login SUCCEEDS (${post.error?.message ?? 'session established'})`);

  // 5. replay → 202 resend, NO duplicate account
  const replay = await postSignup(email, password);
  check(replay.status === 202, `(5) replay signup → 202 resend (got ${replay.status})`);
  const { data: list } = await admin.auth.admin.listUsers();
  const dupes = (list?.users ?? []).filter((u) => u.email === email);
  check(dupes.length === 1, `(5) exactly ONE Auth user (no duplicate) — found ${dupes.length}`);

  for (const u of dupes) await admin.auth.admin.deleteUser(u.id).catch(() => {}); // cleanup

  console.log(fails === 0 ? '\n✅ PREVIEW-GATE PASSED — WP1 part 2 validated end-to-end' : `\n❌ ${fails} check(s) failed`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
