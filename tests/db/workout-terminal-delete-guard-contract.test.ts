import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const path = join(process.cwd(), 'drizzle/0081_workout_terminal_delete_guard.sql');

describe('terminal workout deletion authority', () => {
  it('ships a journaled delete guard and a terminal-safe discard RPC', () => {
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/before delete on public\.workout_sessions/i);
    expect(sql).toMatch(/old\.completed_at is null and old\.duration_minutes is null[\s\S]*return old[\s\S]*raise exception/i);
    expect(sql).toMatch(/create or replace function public\.discard_empty_workout_session/i);
    expect(sql).toMatch(/session\.completed_at is null/i);
    expect(sql).toMatch(/session\.duration_minutes is null/i);
    expect(sql).toMatch(/session\.live_finish_request is null/i);
    expect(sql).toMatch(/not exists[\s\S]*public\.workout_sets/i);

    const journal = JSON.parse(readFileSync(join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>;
    };
    expect(journal.entries.at(-1)?.tag).toBe('0081_workout_terminal_delete_guard');
  });
});
