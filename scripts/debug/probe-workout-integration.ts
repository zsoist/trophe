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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 130)); });
  p.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message.slice(0, 130)}`));
  p.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP${r.status()} ${r.url().slice(0, 100)}`); });

  await p.goto('https://trophe.app/dashboard', { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForTimeout(2800);
  await p.screenshot({ path: '/tmp/trophe-qa/dash-workout-card.png', fullPage: false });
  const navCount = await p.locator('nav a, nav button').count().catch(() => 0);
  const hasWorkoutTab = await p.getByText('Workout', { exact: true }).count();
  console.log('nav items:', navCount, '| Workout tab found:', hasWorkoutTab > 0);
  const hasCard = await p.getByText("Today's Training").count();
  console.log('TodayWorkoutCard on home:', hasCard > 0);

  await p.goto('https://trophe.app/dashboard/workout', { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: '/tmp/trophe-qa/workout-landing.png', fullPage: true });
  console.log('workout landing walked');

  console.log('ERRORS:', errs.length ? JSON.stringify([...new Set(errs)]) : 'NONE');
  await browser.close();
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
