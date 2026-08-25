import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'drizzle/0079_workout_terminal_authority.sql'), 'utf8');

describe('one-way workout terminal authority', () => {
  it('records terminal authority independently and rejects reopening completed sessions', () => {
    expect(sql).toMatch(/add column if not exists completed_at timestamp with time zone/i);
    expect(sql).toMatch(/old\.completed_at is not null[\s\S]*duration_minutes[\s\S]*raise exception/i);
    expect(sql).toMatch(/before insert or update on public\.workout_sessions/i);
  });

  it('makes every set mutation consult the one-way terminal authority under a parent lock', () => {
    expect(sql).toMatch(/select session\.id, session\.completed_at[\s\S]*for update/i);
    expect(sql).toMatch(/before insert or update or delete on public\.workout_sets/i);
    expect(sql).toMatch(/cannot mutate a set in a completed workout/i);
  });
});
