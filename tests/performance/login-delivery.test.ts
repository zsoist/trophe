import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('login critical-path delivery', () => {
  it('does not load Framer Motion for login-only presentation', () => {
    const login = readFileSync(join(root, 'app/login/page.tsx'), 'utf8');

    expect(login).not.toContain("from 'framer-motion'");
    expect(login).not.toMatch(/<motion\./);
  });

  it('keeps the form visible while progressively enhancing entrance motion', () => {
    const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
    const loginEntrance = css.slice(
      css.indexOf('@keyframes login-enter'),
      css.indexOf('/* ─── User appearance system'),
    );

    expect(loginEntrance).toContain('.login-enter');
    expect(loginEntrance).toContain('@media (prefers-reduced-motion: reduce)');
    expect(loginEntrance).not.toMatch(/opacity:\s*0(?:[;\s}]|$)/);
  });

  it('exposes accessible password-strength feedback during signup', () => {
    const login = readFileSync(join(root, 'app/login/page.tsx'), 'utf8');

    expect(login).toContain('passwordStrength(password)');
    expect(login).toContain('aria-live="polite"');
    expect(login).toContain('Password strength:');
    expect(login).toContain('aria-pressed={mode ===');
    expect(login).toContain("aria-label={showPw ? 'Hide password' : 'Show password'}");
    expect(login).not.toContain('tabIndex={-1}');
  });
});
