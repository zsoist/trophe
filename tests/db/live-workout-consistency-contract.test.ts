import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'drizzle/0076_live_workout_consistency.sql');

function migration(): string {
  return readFileSync(migrationPath, 'utf8');
}

describe('live workout consistency migration contract', () => {
  it('occupies the next canonical migration slot', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('adds authoritative live state and a unique logical set identity', () => {
    if (!existsSync(migrationPath)) return;
    const sql = migration();
    expect(sql).toMatch(/live_structure\s+jsonb/i);
    expect(sql).toMatch(/live_structure_version\s+integer/i);
    expect(sql).toMatch(/client_draft_fingerprint\s+text/i);
    expect(sql).toMatch(/unique[\s\S]*session_id[\s\S]*exercise_id[\s\S]*set_number/i);
  });

  it('keeps every live mutation RPC invoker-owned and authenticated-only', () => {
    if (!existsSync(migrationPath)) return;
    const sql = migration();
    for (const fn of [
      'start_workout_session',
      'save_live_workout_set',
      'append_live_pain_flag',
      'finish_live_workout_session',
      'update_live_workout_structure',
    ]) {
      expect(sql).toMatch(new RegExp(`create(?: or replace)? function public\\.${fn}\\([\\s\\S]*?security invoker`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([\\s\\S]*?from public`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*?to authenticated`, 'i'));
    }
    expect(sql).not.toMatch(/security\s+definer/i);
  });
});
