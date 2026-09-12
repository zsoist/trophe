import { expect, test } from '@playwright/test';
import { loginAs, type Role } from './helpers/auth';

test('repeated disposable role login redirects retain a server-readable session', async ({ browser }) => {
  test.skip(process.env.E2E_COACH_LOGIN_DIAGNOSTIC !== '1', 'Targeted diagnostic only');
  const sequence: Role[] = ['client', 'client', 'coach', 'coach', 'client'];
  for (const role of sequence) {
    const page = await browser.newPage();
    try {
      await loginAs(page, role);
      expect(new URL(page.url()).pathname.startsWith('/login')).toBe(false);
    } finally {
      await page.close();
    }
  }
});
