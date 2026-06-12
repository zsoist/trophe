import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { chromium } from '@playwright/test';

const OUT = '/tmp/trophe-qa';
const REF = 'iwbpzwmidzvpiofnqexd';

async function main() {
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

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 180)}`));

  const stops: Array<[string, string]> = [
    ['/dashboard', 'dashboard'], ['/super', 'super'], ['/coach', 'coach'],
    ['/dashboard/intake', 'intake'], ['/dashboard/messages', 'messages'],
    ['/dashboard/book', 'book'], ['/dashboard/log', 'log'],
  ];
  for (const [path, name] of stops) {
    await page.goto('https://trophe.app' + path, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log(name, '→', page.url());
    await page.screenshot({ path: `${OUT}/${name}-desktop.png` });
  }
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mob.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  const mp = await mob.newPage();
  for (const [path, name] of [['/dashboard', 'dashboard'], ['/dashboard/intake', 'intake']] as Array<[string, string]>) {
    await mp.goto('https://trophe.app' + path, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await mp.waitForTimeout(2500);
    await mp.screenshot({ path: `${OUT}/${name}-mobile.png` });
  }
  console.log('console errors:', JSON.stringify([...new Set(errors)].slice(0, 10), null, 1));
  await browser.close();
}
main();
