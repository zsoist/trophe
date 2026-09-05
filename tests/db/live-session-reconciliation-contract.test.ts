import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('owner-scoped live-session reconciliation migration', () => {
  it('is journaled, read-only, and locked to authenticated callers', () => {
    const root = process.cwd();
    const migration = join(root, 'drizzle/0084_owner_scoped_live_session_reconciliation.sql');
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');
    expect(sql).toMatch(/create or replace function public\.resolve_live_workout_session\s*\(\s*p_session_id uuid/i);
    expect(sql).toMatch(/returns jsonb[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
    expect(sql).toMatch(/raise exception 'Authentication required' using errcode = '42501'/i);
    expect(sql).toMatch(/jsonb_build_object\('state', 'missing'\)/i);
    expect(sql).toMatch(/jsonb_build_object\('state', 'forbidden'\)/i);
    expect(sql).toMatch(/jsonb_build_object\([\s\S]*'state', 'active'/i);
    expect(sql).toMatch(/revoke execute on function public\.resolve_live_workout_session\(uuid\) from public/i);
    expect(sql).toMatch(/revoke execute on function public\.resolve_live_workout_session\(uuid\) from anon, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.resolve_live_workout_session\(uuid\) to authenticated/i);
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\s+public\./i);

    const journal = JSON.parse(readFileSync(join(root, 'drizzle/meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string; idx: number }> };
    const entry = journal.entries.find(({ tag }) => tag === '0084_owner_scoped_live_session_reconciliation');
    expect(entry?.idx).toBe(84);
  });
});
