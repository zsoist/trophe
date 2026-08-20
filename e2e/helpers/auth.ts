import { expect, type Page } from '@playwright/test';

export type Role = 'client' | 'coach' | 'admin';
export type ThemeMode = 'light' | 'dark';

const credentials: Record<Role, readonly [string | undefined, string | undefined]> = {
  client: [process.env.E2E_CLIENT_EMAIL, process.env.E2E_CLIENT_PASSWORD],
  coach: [process.env.E2E_COACH_EMAIL, process.env.E2E_COACH_PASSWORD],
  admin: [process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD],
};

export function isPaidRequest(url: string): boolean {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith('/api/ai/')) return true;
  if ([
    '/api/food/parse',
    '/api/food/recipe-analyze',
    '/api/coach/shopping-list',
    '/api/coach/meal-plan-macros',
  ].includes(parsed.pathname)) return true;
  return new Set([
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'api.voyageai.com',
    'api.deepseek.com',
    'api.mistral.ai',
  ]).has(parsed.hostname);
}

export function shouldBlockPaidRequest(
  url: string,
  mockedAppPaths: ReadonlySet<string> = new Set(),
): boolean {
  if (!isPaidRequest(url)) return false;
  const parsed = new URL(url);
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
  if (loopback && mockedAppPaths.has(parsed.pathname)) return false;
  return true;
}

export async function loginAs(page: Page, role: Role, path = '/login'): Promise<void> {
  const [email, password] = credentials[role];
  if (!email || !password) throw new Error(`Missing disposable local ${role} E2E credentials`);
  await page.goto(path);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export async function setTheme(page: Page, mode: ThemeMode): Promise<void> {
  const theme = page.locator('html');
  if (await theme.evaluate((element, expectedMode) => element.classList.contains(expectedMode), mode)) return;
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(theme).toHaveClass(new RegExp(`\\b${mode}\\b`));
}

/** Abort and make every attempted paid AI request an assertion failure. */
export async function blockPaidRequests(
  page: Page,
  options: { mockedAppPaths?: ReadonlySet<string> } = {},
): Promise<() => void> {
  const mockedAppPaths = options.mockedAppPaths ?? new Set<string>();
  const attempted: string[] = [];
  page.on('request', (request) => {
    if (shouldBlockPaidRequest(request.url(), mockedAppPaths)) attempted.push(`${request.method()} ${request.url()}`);
  });
  await page.route((url) => shouldBlockPaidRequest(url.toString(), mockedAppPaths), async (route) => {
    await route.abort('blockedbyclient');
  });
  return () => expect(attempted, `paid AI or food-parse routes were requested:\n${attempted.join('\n')}`).toEqual([]);
}
