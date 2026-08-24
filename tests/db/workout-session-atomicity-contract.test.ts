import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const path = join(process.cwd(), 'drizzle/0075_workout_session_atomicity.sql');

function migration(): string {
  return readFileSync(path, 'utf8');
}

describe('workout session atomicity migration contract', () => {
  it('exists at the next canonical migration slot', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('uses per-user idempotency and invoker RLS ownership without a caller user id', () => {
    if (!existsSync(path)) return;
    const sql = migration();
    expect(sql).toMatch(/client_idempotency_key\s+uuid/i);
    expect(sql).toMatch(/unique[\s\S]*user_id[\s\S]*client_idempotency_key/i);
    expect(sql).toMatch(/security\s+invoker/gi);
    expect(sql).not.toMatch(/security\s+definer/i);
    expect(sql).toMatch(/auth\.uid\(\)/i);
    expect(sql).not.toMatch(/p_user_id/i);
  });

  it('exposes only authenticated RPC execution and blocks inherited or anonymous execution', () => {
    if (!existsSync(path)) return;
    const sql = migration();
    for (const fn of [
      'start_workout_session',
      'save_retrospective_workout',
      'discard_empty_workout_session',
      'update_live_workout_structure',
    ]) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\(`, 'i'));
      expect(sql).toMatch(new RegExp(`public\\.${fn}\\([\\s\\S]*from public`, 'i'));
      expect(sql).toMatch(new RegExp(`public\\.${fn}\\([\\s\\S]*from anon`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*to authenticated`, 'i'));
    }
  });

  it('implements empty discard as one guarded delete statement', () => {
    if (!existsSync(path)) return;
    const body = migration().match(/create or replace function public\.discard_empty_workout_session[\s\S]*?as \$function\$([\s\S]*?)\$function\$/i)?.[1] ?? '';
    expect(body).toMatch(/delete\s+from\s+public\.workout_sessions/i);
    expect(body).toMatch(/not\s+exists[\s\S]*public\.workout_sets/i);
    expect(body.split(/delete\s+from\s+public\.workout_sessions/i)[0]).not.toMatch(/public\.workout_sessions/i);
  });
});
