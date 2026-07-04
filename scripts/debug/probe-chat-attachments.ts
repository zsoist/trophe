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

  // Tiny valid JPEG fixture (2x2 red) written on the fly
  const jpegB64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooor8/P9oD/2Q==';
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/chat-fixture.jpg', Buffer.from(jpegB64, 'base64'));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(chunks.map((c) => ({ ...c, domain: 'trophe.app', path: '/', secure: true, sameSite: 'Lax' as const })));
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  p.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message.slice(0, 120)}`));
  p.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP${r.status()} ${r.url().slice(0, 100)}`); });

  const stamp = `probe-${Date.now()}`;
  await p.goto('https://trophe.app/dashboard/messages', { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForTimeout(2200);

  // 1) text message
  await p.locator('textarea').fill(`${stamp} text`);
  await p.getByLabel('Send message').click();
  await p.waitForTimeout(1800);
  const textOk = await p.getByText(`${stamp} text`).count();
  console.log('text bubble:', textOk > 0 ? 'OK' : 'MISSING');

  // 2) photo attachment
  await p.locator('input[type=file]').setInputFiles('/tmp/chat-fixture.jpg');
  await p.waitForTimeout(1200);
  const readyChip = await p.getByText('Photo ready to send').count();
  console.log('pending chip:', readyChip > 0 ? 'OK' : 'MISSING');
  await p.locator('textarea').fill(`${stamp} photo`);
  await p.getByLabel('Send message').click();
  await p.waitForTimeout(3500);
  const photoMsg = await p.getByText(`${stamp} photo`).count();
  console.log('photo message bubble:', photoMsg > 0 ? 'OK' : 'MISSING');
  await p.screenshot({ path: '/tmp/trophe-qa/chat-attachments.png', fullPage: false });

  // 3) verify the DB row + storage object actually exist
  const { data: rows } = await admin.from('messages')
    .select('id, attachment_path, attachment_type, attachment_meta')
    .like('body', `${stamp}%`).order('created_at');
  const photoRow = (rows ?? []).find((r) => r.attachment_type === 'image');
  console.log('db rows:', rows?.length, '| photo row has path:', !!photoRow?.attachment_path, '| meta:', JSON.stringify(photoRow?.attachment_meta));
  let storageOk = false;
  if (photoRow?.attachment_path) {
    const { data: dl } = await admin.storage.from('chat-attachments').download(photoRow.attachment_path);
    storageOk = !!dl && dl.size > 100;
    console.log('storage object downloadable:', storageOk, dl?.size, 'bytes');
  }

  // 4) self-clean: rows + object
  if (photoRow?.attachment_path) await admin.storage.from('chat-attachments').remove([photoRow.attachment_path]);
  for (const r of rows ?? []) await admin.from('messages').delete().eq('id', r.id);
  console.log('cleaned', rows?.length ?? 0, 'rows + storage');

  console.log('ERRORS:', errs.length ? JSON.stringify([...new Set(errs)]) : 'NONE');
  await browser.close();
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
