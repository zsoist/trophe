import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'drizzle/0077_live_workout_rollout_safety.sql');

describe('live workout rollout safety migration contract', () => {
  it('adds the next canonical migration and replay-safe finish state', () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/live_finish_request\s+jsonb/i);
    expect(sql).toMatch(/finish_live_workout_session[\s\S]*live_finish_request[\s\S]*is distinct from/i);
    expect(sql).toMatch(/live_finish_request\s*=\s*jsonb_build_object[\s\S]*pain_flags/i);
  });

  it('keeps an authenticated-only compatibility overload and controlled legacy resume', () => {
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/start_workout_session\(\s*p_idempotency_key uuid,\s*p_session_date date/mi);
    expect(sql).toMatch(/resume_legacy_live_workout_session/i);
    expect(sql).toMatch(/v_duration\s+is\s+not\s+null/i);
    expect(sql).not.toMatch(/security\s+definer/i);
    expect(sql).toMatch(/grant execute on function public\.resume_legacy_live_workout_session[\s\S]*to authenticated/i);
  });

  it('locks terminal authority before direct set writes', () => {
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/enforce_live_workout_set_structure[\s\S]*duration_minutes[\s\S]*for update/i);
    expect(sql).toMatch(/v_duration is not null[\s\S]*raise exception/i);
  });

  it('serializes live undo with finish and guards terminal direct deletes', () => {
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/delete_live_workout_set[\s\S]*from public\.workout_sessions[\s\S]*for update/i);
    expect(sql).toMatch(/before delete[\s\S]*workout_sets/i);
    expect(sql).toMatch(/cannot delete a set from a completed workout/i);
    expect(sql).toMatch(/grant execute on function public\.delete_live_workout_set\(uuid, uuid\) to authenticated/i);
  });

  it('persists cardio as typed columns without English notes', () => {
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/workout_kind\s+text/i);
    expect(sql).toMatch(/cardio_activity\s+text/i);
    expect(sql).toMatch(/cardio_distance_km\s+real/i);
    expect(sql).toMatch(/cardio_effort\s+real/i);
    expect(sql).not.toMatch(/Activity:\s*['"]/i);
    expect(sql).not.toMatch(/Distance:\s*['"]/i);
    expect(sql).not.toMatch(/Effort:\s*['"]/i);
  });
});
