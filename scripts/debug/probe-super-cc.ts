import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { chromium } from '@playwright/test';

const REF = 'iwbpzwmidzvpiofnqexd';

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink', email: 'daniel@reyes.com',
  });
  if (linkErr) throw linkErr;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: otp } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties!.hashed_token });
  if (!otp!.session) throw new Error('no session');

  const raw = 'base64-' + Buffer.from(JSON.stringify(otp!.session)).toString('base64url');
  const chunks: Array<{ name: string; value: string }> = [];
  if (raw.length <= 3180) chunks.push({ name: `sb-${REF}-auth-token`, value: raw });
  else for (let i = 0; i * 3180 < raw.length; i++)
    chunks.push({ name: `sb-${REF}-auth-token.${i}`, value: raw.slice(i * 3180, (i + 1) * 3180) });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[console] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) console.log(`[${r.status()}] ${r.url()}`); });

  // Walk every tab of the command center
  await page.goto('https://trophe.app/super', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/trophe-qa/cc-overview.png' });
  for (const tab of ['COSTS', 'USERS', 'RUNS', 'DATA', 'AUDIT']) {
    await page.getByText(tab, { exact: true }).first().click().catch((e) => console.log(`click ${tab} failed: ${e.message}`));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/tmp/trophe-qa/cc-${tab.toLowerCase()}.png` });
    console.log(`tab ${tab} ok`);
  }
  // Also probe the landing page (hydration check)
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => console.log(`[landing pageerror] ${e.message.slice(0, 200)}`));
  p2.on('console', (m) => { if (m.type() === 'error') console.log(`[landing console] ${m.text().slice(0, 200)}`); });
  await p2.goto('https://trophe.app/', { waitUntil: 'networkidle', timeout: 45000 });
  await p2.waitForTimeout(2000);
  await p2.screenshot({ path: '/tmp/trophe-qa/landing-new.png' });
  console.log('landing walked');
  await browser.close();
}
main();
