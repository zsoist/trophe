import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('login hydration submit guard', () => {
  it('keeps native form submission disabled until the client handler is mounted', () => {
    const source = readFileSync('app/login/page.tsx', 'utf8');

    expect(source).toContain('const [hydrated, setHydrated] = useState(false)');
    expect(source).toContain('queueMicrotask(() => setHydrated(true))');
    expect(source).toContain('disabled={!hydrated || loading}');
  });

  it('waits for client readiness before filling controlled login fields', () => {
    const source = readFileSync('e2e/helpers/auth.ts', 'utf8');
    const login = source.slice(source.indexOf('export async function loginAs'), source.indexOf('function safePathname'));
    const ready = login.indexOf('await expect(submit).toBeEnabled()');
    const email = login.indexOf("getByPlaceholder('Email').fill(email)");
    const password = login.indexOf("getByPlaceholder('Password').fill(password)");
    const click = login.indexOf('await submit.click()');

    expect(ready).toBeGreaterThan(-1);
    expect(ready).toBeLessThan(email);
    expect(email).toBeLessThan(password);
    expect(password).toBeLessThan(click);
  });
});
