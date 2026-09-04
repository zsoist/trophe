import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeLoginRedirect, safeRedirectPath } from '@/lib/auth/safe-redirect';

describe('safeLoginRedirect', () => {
  it('keeps same-origin destinations, including query strings', () => {
    expect(safeLoginRedirect('/dashboard/workout/live?repeat=abc')).toBe('/dashboard/workout/live?repeat=abc');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%5Cevil.example',
    '\\\\evil.example',
    '/%09/evil.example',
    '/%ZZ',
    '',
    null,
    undefined,
  ])('returns null for unsafe or empty destination %s', (value) => {
    expect(safeLoginRedirect(value as string | null | undefined)).toBeNull();
  });

  it.each(['/login', '/login/', '/login?mode=signup', '/login/anything'])('never bounces back into the login page (%s)', (value) => {
    expect(safeLoginRedirect(value)).toBeNull();
  });

  it('is the only redirect sanitizer used by the login page', () => {
    const login = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');
    expect(login).toContain("import { safeLoginRedirect } from '@/lib/auth/safe-redirect'");
    expect(login).toContain("safeLoginRedirect(searchParams.get('redirectTo'))");
    expect(login).not.toContain('function safeRedirectTo(');
  });

  it('stays plain text so redirect-security diffs are reviewable', () => {
    const source = readFileSync(join(process.cwd(), 'lib/auth/safe-redirect.ts'));
    expect(source.includes(0)).toBe(false);
  });
});

describe('safeRedirectPath', () => {
  it('allows same-origin relative paths', () => {
    expect(safeRedirectPath('/dashboard/log?date=2026-06-07')).toBe('/dashboard/log?date=2026-06-07');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
  ])('rejects external redirect form %s', (value) => {
    expect(safeRedirectPath(value)).toBe('/dashboard');
  });

  it('rejects encoded control characters and malformed encoding', () => {
    expect(safeRedirectPath('/%09/evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/%ZZ')).toBe('/dashboard');
  });
});
