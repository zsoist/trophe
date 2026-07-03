/**
 * qa-walk-local — authenticated visual QA against a LOCAL dev server.
 *
 * Same magic-link + cookie-injection harness as qa-walk.ts, but targets
 * QA_BASE (default http://localhost:3333) so branches can be QA'd BEFORE
 * merge/deploy. Screenshots → /tmp/trophe-qa-local. Reads prod Supabase
 * (auth + data) via .env.local — read-only walk, no writes.
 *
 *   npx tsx scripts/debug/qa-walk-local.ts
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { chromium } from '@playwright/test';

const OUT = '/tmp/trophe-qa-local';
const REF = 'iwbpzwmidzvpiofnqexd';
const BASE = process.env.QA_BASE ?? 'http://localhost:3333';

async function main() {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT, { recursive: true });

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink', email: 'daniel@reyes.com',
  });
  if (linkErr) throw linkErr;
  const tokenHash = linkData.properties!.hashed_token;

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: otp, error: otpErr } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (otpErr || !otp.session) throw otpErr ?? new Error('no session');
  console.log('session for', otp.user?.email);

  // @supabase/ssr cookie format: base64- prefix + base64url(JSON session), chunked at ~3180 chars
  const raw = 'base64-' + Buffer.from(JSON.stringify(otp.session)).toString('base64url');
  const chunks: Array<{ name: string; value: string }> = [];
  if (raw.length <= 3180) chunks.push({ name: `sb-${REF}-auth-token`, value: raw });
  else for (let i = 0; i * 3180 < raw.length; i++)
    chunks.push({ name: `sb-${REF}-auth-token.${i}`, value: raw.slice(i * 3180, (i + 1) * 3180) });

  const url = new URL(BASE);
  const cookieBase = { domain: url.hostname, path: '/', secure: url.protocol === 'https:', sameSite: 'Lax' as const };

  const browser = await chromium.launch();
  const errors: string[] = [];

  // ── Mobile-first (390×844): the client surface ──
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mob.addCookies(chunks.map((c) => ({ ...c, ...cookieBase })));
  const mp = await mob.newPage();
  mp.on('console', (m) => { if (m.type() === 'error') errors.push(`[mobile] ${m.text().slice(0, 180)}`); });
  mp.on('pageerror', (e) => errors.push(`[mobile] PAGEERROR: ${e.message.slice(0, 180)}`));
  const mobileStops: Array<[string, string]> = [
    ['/onboarding', 'onboarding'],
    ['/dashboard', 'dashboard'],
    ['/dashboard/log', 'log'],
    ['/dashboard/workout', 'workout'],
    ['/dashboard/progress', 'progress'],
  ];
  for (const [path, name] of mobileStops) {
    await mp.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await mp.waitForTimeout(2500);
    console.log('[mobile]', name, '→', mp.url());
    await mp.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: false });
  }

  // ── Desktop (1440×900): the coach surface ──
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desk.addCookies(chunks.map((c) => ({ ...c, ...cookieBase })));
  const dp = await desk.newPage();
  dp.on('console', (m) => { if (m.type() === 'error') errors.push(`[desk] ${m.text().slice(0, 180)}`); });
  dp.on('pageerror', (e) => errors.push(`[desk] PAGEERROR: ${e.message.slice(0, 180)}`));
  const deskStops: Array<[string, string]> = [
    ['/coach', 'coach'],
    ['/coach/templates', 'templates'],
    ['/coach/inbox', 'inbox'],
  ];
  for (const [path, name] of deskStops) {
    await dp.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await dp.waitForTimeout(2500);
    console.log('[desk]', name, '→', dp.url());
    await dp.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: false });
  }

  console.log('console errors:', JSON.stringify([...new Set(errors)].slice(0, 12), null, 1));
  await browser.close();
}
main();
