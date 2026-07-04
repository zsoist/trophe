import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { chromium } from '@playwright/test';
const REF = 'iwbpzwmidzvpiofnqexd';

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'daniel@reyes.com' });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: otp } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: linkData!.properties!.hashed_token });
  const raw = 'base64-' + Buffer.from(JSON.stringify(otp!.session)).toString('base64url');
  const chunks: Array<{ name: string; value: string }> = [];
  if (raw.length <= 3180) chunks.push({ name: `sb-${REF}-auth-token`, value: raw });
  else for (let i = 0; i * 3180 < raw.length; i++) chunks.push({ name: `sb-${REF}-auth-token.${i}`, value: raw.slice(i * 3180, (i + 1) * 3180) });

  const browser = await chromium.launch();
  const errs: string[] = [];

  // ── MOBILE FIRST (390x844, house rule) ──
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mob.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  const mp = await mob.newPage();
  mp.on('console', (m) => { if (m.type() === 'error') errs.push(`[mob console] ${m.text().slice(0, 140)}`); });
  mp.on('pageerror', (e) => errs.push(`[mob pageerror] ${e.message.slice(0, 140)}`));
  mp.on('response', (r) => { if (r.status() >= 400) errs.push(`[mob ${r.status()}] ${r.url().slice(0, 110)}`); });

  await mp.goto('https://trophe.app/dashboard/progress', { waitUntil: 'networkidle', timeout: 45000 });
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: '/tmp/trophe-qa/prog-mobile.png', fullPage: true });
  console.log('progress mobile ok');

  await mp.goto('https://trophe.app/dashboard/profile', { waitUntil: 'networkidle', timeout: 45000 });
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: '/tmp/trophe-qa/settings-mobile.png', fullPage: true });
  console.log('settings mobile ok');

  // Interaction: switch accent to JADE, verify progress re-themes, then back to GOLD
  const jade = mp.getByLabel('Jade');
  await jade.click();
  await mp.waitForTimeout(800);
  const accentVar = await mp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  console.log('accent after jade click:', accentVar, accentVar === '#6ECFA3' ? 'OK' : 'MISMATCH');
  await mp.goto('https://trophe.app/dashboard/progress', { waitUntil: 'networkidle', timeout: 45000 });
  await mp.waitForTimeout(2200);
  await mp.screenshot({ path: '/tmp/trophe-qa/prog-mobile-jade.png', fullPage: true });
  const accentOnProgress = await mp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  console.log('accent persisted on progress:', accentOnProgress, accentOnProgress === '#6ECFA3' ? 'OK' : 'MISMATCH');
  // open customize sheet
  await mp.getByLabel('Customize Progress').click();
  await mp.waitForTimeout(900);
  await mp.screenshot({ path: '/tmp/trophe-qa/prog-customize-sheet.png' });
  console.log('customize sheet ok');
  await mp.keyboard.press('Escape');
  // reset accent to gold (leave no side effects)
  await mp.goto('https://trophe.app/dashboard/profile', { waitUntil: 'networkidle', timeout: 45000 });
  await mp.waitForTimeout(1500);
  await mp.getByLabel('Gold').click();
  await mp.waitForTimeout(1200); // let the debounced DB write flush
  console.log('accent reset to gold');
  await mob.close();

  // ── DESKTOP ──
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desk.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  const dp = await desk.newPage();
  dp.on('console', (m) => { if (m.type() === 'error') errs.push(`[desk console] ${m.text().slice(0, 140)}`); });
  dp.on('pageerror', (e) => errs.push(`[desk pageerror] ${e.message.slice(0, 140)}`));
  dp.on('response', (r) => { if (r.status() >= 400) errs.push(`[desk ${r.status()}] ${r.url().slice(0, 110)}`); });
  await dp.goto('https://trophe.app/dashboard/progress', { waitUntil: 'networkidle', timeout: 45000 });
  await dp.waitForTimeout(2500);
  await dp.screenshot({ path: '/tmp/trophe-qa/prog-desktop.png' });
  await dp.goto('https://trophe.app/dashboard/profile', { waitUntil: 'networkidle', timeout: 45000 });
  await dp.waitForTimeout(2500);
  await dp.screenshot({ path: '/tmp/trophe-qa/settings-desktop.png' });
  console.log('desktop ok');

  console.log('ERRORS:', errs.length ? JSON.stringify([...new Set(errs)], null, 1) : 'NONE');
  await browser.close();
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
