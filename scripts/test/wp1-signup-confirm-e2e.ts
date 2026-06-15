/**
 * WP1 part 2 — PREVIEW-GATE validation harness (LOCAL-ONLY; the LOCAL release-evidence gate, one command).
 *
 * This is the local-automation gate, NOT the whole release gate: hosted-SMTP delivery and the
 * full browser-cookie session after the link click remain SEPARATE MANUAL operator gates (below).
 *
 * Proves the email-verification lifecycle against a LOCAL Supabase + Mailpit stack, as
 * repeatable evidence. A passing run requires ALL checks green and ZERO skips:
 *   1. signup → HTTP 202 verification_required
 *   2. pre-confirmation password login is REJECTED (the unconfirmed hold works)
 *   3. confirmation email DELIVERED + the verify link redirects EXACTLY to /login?confirmed=1
 *   4. post-confirmation password login SUCCEEDS (usable session)
 *   5. replay signup → 202 + a NEW confirmation email, with NO duplicate Auth account
 *   + cleanup of EVERY test artifact (verified gone) — a cleanup failure FAILS the run.
 *
 * ⚠ LOCAL-ONLY BY DESIGN. It is destructive (creates an Auth user + profile + consent +
 * reservation) and Trophē has NO isolated non-production Supabase branch — so this refuses
 * any non-loopback target outright (no remote flag). Hosted delivery (real SMTP) and the
 * browser-cookie session leg are SEPARATE MANUAL operator checks — see the ops doc.
 *
 * PRECONDITIONS: enable_confirmations=true + migrations 0042–0047 applied + the app running
 * with NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000. `supabase start` then `npm run dev`.
 *
 * CONFIG (env; loopback defaults; keys/ports from `supabase status`):
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
let skips = 0;
const check = (cond: boolean, msg: string) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fails++; };
const skip = (msg: string) => { console.log(`  – SKIP ${msg}`); skips++; };
const isLoopback = (u: string) => { try { return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(u).hostname); } catch { return false; } };

/** LOCAL-ONLY guard: refuse ANY non-loopback target. No remote mode exists (by design). */
function assertLocalOnly() {
  const bad = ([['APP_BASE_URL', APP], ['E2E_SUPABASE_URL', SB_URL], ['MAILPIT_URL', MAILPIT]] as const).filter(([, u]) => !isLoopback(u));
  if (bad.length) {
    console.error(`LOCAL-ONLY harness — refusing non-loopback target(s): ${bad.map(([k, u]) => `${k}=${u}`).join(', ')}.`);
    console.error('Run against a local `supabase start` + Mailpit stack only. Hosted delivery is a separate manual operator check.');
    process.exit(2);
  }
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
async function findUserIdsByEmail(admin: SupabaseClient, email: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) if (u.email === email) ids.push(u.id);
    if (users.length === 0) break; // GoTrue may clamp perPage below 1000 — page until a page comes back empty
  }
  return ids;
}
async function postSignup(email: string, password: string, runIp: string) {
  const res = await fetch(`${APP}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': runIp },
    body: JSON.stringify({ email, password, full_name: 'E2E Tester', consent: true }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) as { verification_required?: boolean; user_id?: string; error?: string } };
}

/** Each test artifact table and the column that keys it to the user. invite_reservations.user_id
 *  is a bare uuid (no FK) so it never cascades; profiles is the parent (PK = user id). */
const ARTIFACT_TABLES: ReadonlyArray<readonly [table: string, col: string]> = [
  ['invite_reservations', 'user_id'], ['client_profiles', 'user_id'], ['consents', 'user_id'], ['profiles', 'id'],
];

/** Delete every test artifact for the UNION of route-returned IDs (captured) and IDs discovered
 *  by the test email (catches a 503 whose body omitted user_id), then PROVE they are gone —
 *  a PostgREST delete returns no error even when it removes ZERO rows. Returns true iff fully
 *  clean: all artifact rows verified absent AND no Auth user for the email remains. */
async function cleanupByEmail(admin: SupabaseClient, email: string, captured: Set<string>, rateKey: string): Promise<boolean> {
  let ok = true;
  let discovered: string[] = [];
  try { discovered = await findUserIdsByEmail(admin, email); } catch (e) { console.error(`  ! cleanup discover: ${String(e)}`); return false; }
  const ids = Array.from(new Set<string>([...captured, ...discovered]));

  // delete: children → parent → Auth user, for every captured/discovered id
  for (const id of ids) {
    for (const [t, col] of ARTIFACT_TABLES) {
      const { error } = await admin.from(t).delete().eq(col, id);
      if (error) { console.error(`  ! cleanup ${t} (${id}): ${error.message}`); ok = false; }
    }
    const { error: de } = await admin.auth.admin.deleteUser(id);
    if (de) { console.error(`  ! cleanup deleteUser (${id}): ${de.message}`); ok = false; }
  }

  // VERIFY each artifact row is actually gone (delete-success ≠ rows-removed)
  for (const id of ids) {
    for (const [t, col] of ARTIFACT_TABLES) {
      const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, id);
      if (error) { console.error(`  ! verify ${t} (${id}): ${error.message}`); ok = false; }
      else if ((count ?? 0) > 0) { console.error(`  ! verify ${t} (${id}): ${count} row(s) REMAIN`); ok = false; }
    }
  }

  // VERIFY no Auth user remains for the email
  try { const left = await findUserIdsByEmail(admin, email); if (left.length) { console.error(`  ! verify auth: ${left.length} user(s) REMAIN`); ok = false; } }
  catch (e) { console.error(`  ! verify auth: ${String(e)}`); ok = false; }

  // the route created a rate_limit_windows row under this run's key — remove + verify. The run uses a
  // unique x-forwarded-for so it never blocks; this only keeps "all artifacts removed" honest.
  { const { error } = await admin.from('rate_limit_windows').delete().eq('key', rateKey);
    if (error) { console.error(`  ! cleanup rate_limit_windows (${rateKey}): ${error.message}`); ok = false; } }
  { const { count, error } = await admin.from('rate_limit_windows').select('*', { count: 'exact', head: true }).eq('key', rateKey);
    if (error) { console.error(`  ! verify rate_limit_windows: ${error.message}`); ok = false; }
    else if ((count ?? 0) > 0) { console.error(`  ! verify rate_limit_windows: ${count} row(s) REMAIN`); ok = false; } }

  return ok;
}

async function main() {
  if (!ANON || !SERVICE) { console.error('Set E2E_SUPABASE_ANON_KEY and E2E_SUPABASE_SERVICE_KEY (from `supabase status`).'); process.exit(2); }
  assertLocalOnly();
  const anon = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const ts = Date.now();
  const email = `wp1-e2e-${ts}@example.com`;
  const password = 'Pw-e2e-12345';
  const runIp = `e2e-${ts}`;          // unique x-forwarded-for per run → fresh signup rate bucket (route caps 5/IP/hour; 2 signups/run never accumulate across runs)
  const rateKey = `signup:${runIp}`;  // the route's consumeRateLimit key (lib/security/durable-rate-limit) — cleaned up at teardown
  const expectedRedirect = `${APP}/login?confirmed=1`;
  console.log(`WP1 PREVIEW-GATE (LOCAL) — app=${APP} supabase=${SB_URL} mailpit=${MAILPIT}\n  test email=${email}`);

  const capturedIds = new Set<string>(); // 202 carries user_id; 503 omits it → union with email-discovery at cleanup
  let cleanupOk = false;
  try {
    if (!(await mailpitReachable())) check(false, `(0) Mailpit reachable at ${MAILPIT} (REQUIRED — start the local stack)`);

    const su = await postSignup(email, password, runIp);
    if (su.body.user_id) capturedIds.add(su.body.user_id);
    check(su.status === 202 && su.body.verification_required === true, `(1) signup → 202 verification_required (got ${su.status})`);

    const pre = await anon.auth.signInWithPassword({ email, password });
    check(!!pre.error && !pre.data.session, `(2) pre-confirmation login REJECTED (${pre.error?.message ?? 'NO ERROR — hold not enforced!'})`);

    // (3) REPLAY while still UNCONFIRMED — and BEFORE confirming (below). resend(type:signup) only
    // re-sends a NEW email for an UNCONFIRMED account; once confirmed, GoTrue returns 200 and sends
    // nothing, so this idempotency proof is structurally unsatisfiable if it runs after confirmation.
    const before = await countMessagesTo(email);
    const replay = await postSignup(email, password, runIp);
    if (replay.body.user_id) capturedIds.add(replay.body.user_id);
    check(replay.status === 202, `(3) replay (pre-confirmation) → 202 resend (got ${replay.status})`);
    let after = before;
    for (let i = 0; i < 15 && after <= before; i++) { await new Promise((r) => setTimeout(r, 1000)); after = await countMessagesTo(email); }
    check(after > before, `(3) replay delivered a NEW confirmation email (${before} → ${after})`);
    check((await findUserIdsByEmail(admin, email)).length === 1, '(3) exactly ONE Auth user — no duplicate (paginated)');

    // (4) confirm via the LATEST verify link (the replay rotates the token; Mailpit returns newest-first,
    // and the no-error assertion below fails loud if a stale/invalid token is followed instead).
    const link = await fetchConfirmationLink(email);
    check(!!link, '(4) confirmation email delivered + verify link found');
    if (link) {
      const r = await fetch(link, { redirect: 'manual' });
      const loc = r.headers.get('location') ?? '';
      let exact = false;
      try {
        const u = new URL(loc, APP);                       // tolerate a relative Location
        const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
        const hasError = u.searchParams.has('error') || u.searchParams.has('error_code') || hash.has('error') || hash.has('error_code');
        exact = [302, 303, 307].includes(r.status)
          && u.origin === new URL(APP).origin               // same APP origin (emailRedirectTo honored)
          && u.pathname === '/login'                        // EXACT destination path
          && u.searchParams.get('confirmed') === '1'        // EXACT flag (success may append ?code / #tokens — fine)
          && !hasError;                                     // a GoTrue verify FAILURE also lands on /login?confirmed=1 + error — reject it
      } catch { exact = false; }
      check(exact, `(4) verify link redirects to ${expectedRedirect} with NO error (status ${r.status}, location ${loc || 'none'})`);
    } else {
      skip('(4b) redirect assertion — no verify link to follow');
    }

    // (5) post-confirmation login now SUCCEEDS — proves the link actually confirmed the account.
    const post = await anon.auth.signInWithPassword({ email, password });
    check(!post.error && !!post.data.session, `(5) post-confirmation login SUCCEEDS (${post.error?.message ?? 'session established'})`);
  } finally {
    cleanupOk = await cleanupByEmail(admin, email, capturedIds, rateKey);
  }
  check(cleanupOk, '(cleanup) all test artifacts removed — DB rows + rate-limit rows + Auth users queried + verified gone');

  const passed = fails === 0 && skips === 0;
  console.log(passed ? '\n✅ PREVIEW-GATE PASSED (all checks green, zero skips)' : `\n❌ NOT a passing gate — ${fails} failure(s), ${skips} skip(s)`);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
