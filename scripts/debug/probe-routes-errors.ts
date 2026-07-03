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
  for (const path of ['/dashboard', '/coach', '/dashboard/intake', '/dashboard/messages', '/dashboard/book', '/dashboard/log', '/dashboard/workout']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
    page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP${r.status()} ${r.url().slice(0, 110)}`); });
    await page.goto('https://trophe.app' + path, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log(path, errs.length ? JSON.stringify([...new Set(errs)]) : 'CLEAN');
    await ctx.close();
  }
  await browser.close();
}
main();
