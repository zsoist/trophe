import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../drizzle/0074_secure_dedupe_backup.sql', import.meta.url),
  'utf8',
);

describe('dedupe backup migration', () => {
  it('preserves the backup while removing signed-in access and enabling RLS', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES');
    expect(migration).toContain('FROM anon, authenticated');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
  });
});
