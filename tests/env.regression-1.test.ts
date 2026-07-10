import { describe, expect, it } from 'vitest';
import { requiredEnv } from '../lib/env';

// Regression: STAB-001 — quoted or missing Supabase env values crashed prerendering
// Found by /qa on 2026-07-10
describe('requiredEnv', () => {
  it('removes matching quotes and surrounding whitespace', () => {
    expect(requiredEnv('  "https://example.supabase.co"  ', 'URL')).toBe('https://example.supabase.co');
    expect(requiredEnv(" 'token-value' ", 'TOKEN')).toBe('token-value');
  });

  it('preserves unquoted values', () => {
    expect(requiredEnv(' token-value ', 'TOKEN')).toBe('token-value');
  });

  it.each([undefined, '', '   ', '""', "''"])('fails clearly for missing or empty values', (value) => {
    expect(() => requiredEnv(value, 'REQUIRED_KEY')).toThrow(
      'Missing required environment variable: REQUIRED_KEY',
    );
  });
});
