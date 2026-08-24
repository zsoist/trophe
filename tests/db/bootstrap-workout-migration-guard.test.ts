import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('legacy database bootstrap workout migration guard', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/db/bootstrap-local.sh'), 'utf8');
  const verify = readFileSync(join(process.cwd(), 'scripts/db/verify.ts'), 'utf8');

  it('never journal-stamps workout consistency migrations in the legacy backfill path', () => {
    const legacyBranch = script.match(/if \[ "\$history_count" = "0" \][\s\S]*?^else$/m)?.[0] ?? '';
    expect(legacyBranch).toContain('0074');
    expect(legacyBranch).toContain('scripts/db/run-migrations.ts');
    expect(legacyBranch).not.toContain('for (const e of j.entries)');
  });

  it('probes the live consistency schema after migration application', () => {
    expect(verify).toContain('save_live_workout_set');
    expect(verify).toContain('append_live_pain_flag');
    expect(verify).toContain('live_structure_version');
    expect(verify).toContain('workout_sets_session_exercise_number_unique');
  });
});
