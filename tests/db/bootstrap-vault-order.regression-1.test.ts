import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: STAB-002 — local bootstrap reached migration 0048 without its Vault fixture
// Found by /qa on 2026-07-10
describe('local database bootstrap Vault ordering', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/db/bootstrap-local.sh'), 'utf8');

  it('creates the local memory worker secret before migrations run', () => {
    const secretSetup = script.indexOf("vault.create_secret('local-test-only', 'memory_cron_secret')");
    const migrationRun = script.indexOf('"$TSX_BIN" scripts/db/run-migrations.ts');

    expect(secretSetup).toBeGreaterThan(-1);
    expect(migrationRun).toBeGreaterThan(secretSetup);
    expect(script).not.toContain('npx tsx scripts/db/run-migrations.ts');
  });

  it('limits the fixture to the local Supabase path', () => {
    expect(script).toContain('if [ "$COMPAT_MODE" = "0" ]; then');
  });
});
