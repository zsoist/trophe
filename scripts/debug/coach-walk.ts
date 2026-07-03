/**
 * Logs in as the showcase coach (daniel@reyes.com) via an admin magic link and
 * screenshots the coach surfaces to verify the seeded demo roster renders.
 * Read-only navigation. Run: ALLOW_REMOTE_SEED is NOT needed (no writes).
 *   npx tsx scripts/debug/coach-walk.ts
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = '/tmp/trophe-coach';
const REF = 'iwbpzwmidzvpiofnqexd';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = JSON.parse(readFileSync('scripts/data/.demo-roster-manifest.json', 'utf8')) as { users: { slug: string; id: string }[] };
  const id = (slug: string) => manifest.users.find((u) => u.slug === slug)!.id;
  const eleni = id('eleni');   // star
  const sofia = id('sofia');   // at-risk

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'daniel@reyes.com' });
  if (linkErr) throw linkErr;
  const tokenHash = linkData.properties!.hashed_token;

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: otp, error: otpErr } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (otpErr || !otp.session) throw otpErr ?? new Error('no session');
  console.log('session for', otp.user?.email);

  const raw = 'base64-' + Buffer.from(JSON.stringify(otp.session)).toString('base64url');
  const chunks: Array<{ name: string; value: string }> = [];
  if (raw.length <= 3180) chunks.push({ name: `sb-${REF}-auth-token`, value: raw });
  else for (let i = 0; i * 3180 < raw.length; i++)
    chunks.push({ name: `sb-${REF}-auth-token.${i}`, value: raw.slice(i * 3180, (i + 1) * 3180) });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1500 } });
  await ctx.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  // Client-side Supabase reads the session from localStorage (not cookies), so the
  // coach dashboard's client-side roster query needs it too — otherwise it runs as anon.
  await ctx.addInitScript((data: { key: string; sess: unknown }) => {
    try { window.localStorage.setItem(data.key, JSON.stringify(data.sess)); } catch { /* noop */ }
  }, { key: `sb-${REF}-auth-token`, sess: otp.session });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));

  void eleni; void sofia;
  const stops: Array<[string, string, boolean]> = [
    ['/coach/inbox', 'coach-inbox', false],
  ];
  for (const [path, name, full] of stops) {
    await page.goto('https://trophe.app' + path, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(6000);
    console.log(name, '→', page.url());
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  }

  console.log('console errors:', JSON.stringify([...new Set(errors)].slice(0, 12), null, 1));
  await browser.close();
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
