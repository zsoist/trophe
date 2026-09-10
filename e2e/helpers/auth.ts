import { expect, type Page } from '@playwright/test';

export type Role = 'client' | 'coach' | 'admin';
export type ThemeMode = 'light' | 'dark';

type LoginDiagnostic = {
  event: 'coach_login_diagnostic';
  outcome: 'passed' | 'failed';
  role: Role;
  authExchangeStatus: number | null;
  authExchangeCategory: 'none' | 'success' | 'rate_limited' | 'client_error' | 'server_error' | 'other';
  pathname: string;
  sessionPresent: boolean;
  uiErrorCategory: 'none' | 'invalid_credentials' | 'rate_limited' | 'network' | 'other';
};

export function classifyAuthExchangeStatus(status: number | null): LoginDiagnostic['authExchangeCategory'] {
  if (status === null) return 'none';
  if (status >= 200 && status < 300) return 'success';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'client_error';
  if (status >= 500) return 'server_error';
  return 'other';
}

export function classifyLoginUiError(value: string | null): LoginDiagnostic['uiErrorCategory'] {
  if (!value) return 'none';
  if (/invalid.*credential|invalid login/i.test(value)) return 'invalid_credentials';
  if (/rate|too many|limit/i.test(value)) return 'rate_limited';
  if (/network|fetch|connect/i.test(value)) return 'network';
  return 'other';
}

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
  const diagnostics = process.env.E2E_COACH_LOGIN_DIAGNOSTIC === '1';
  let authExchangeStatus: number | null = null;
  const observeAuth = (response: { url(): string; status(): number }) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith('/auth/v1/token')) authExchangeStatus = response.status();
  };
  if (diagnostics) page.on('response', observeAuth);
  await page.goto(path);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    if (diagnostics) await emitLoginDiagnostic(page, role, authExchangeStatus, 'passed');
  } catch (error) {
    if (diagnostics) await emitLoginDiagnostic(page, role, authExchangeStatus, 'failed');
    throw error;
  } finally {
    if (diagnostics) page.off('response', observeAuth);
  }
}

export async function emitLoginDiagnostic(page: Page, role: Role, authExchangeStatus: number | null, outcome: LoginDiagnostic['outcome']) {
  const cookies = await page.context().cookies().catch(() => []);
  let pathname = '/unknown';
  try { pathname = new URL(page.url()).pathname; } catch { /* Keep the diagnostic bounded if the page has already closed. */ }
  const alert = page.getByRole('alert');
  const alertCount = pathname.startsWith('/login') ? await alert.count().catch(() => 0) : 0;
  const uiError = alertCount
    ? await alert.first().textContent().catch(() => null)
    : null;
  const record: LoginDiagnostic = {
    event: 'coach_login_diagnostic', outcome, role, authExchangeStatus,
    authExchangeCategory: classifyAuthExchangeStatus(authExchangeStatus),
    pathname,
    sessionPresent: cookies.some(cookie => cookie.name.includes('auth-token')),
    uiErrorCategory: classifyLoginUiError(uiError),
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
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
