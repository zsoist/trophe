import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'drizzle/0078_terminal_workout_set_updates.sql'), 'utf8');

describe('terminal workout set update guard', () => {
  it('guards every insert, update, and delete while locking both update parents', () => {
    expect(sql).toMatch(/before insert or update or delete on public\.workout_sets/i);
    expect(sql).not.toMatch(/update of\s+/i);
    expect(sql).toMatch(/array\[old\.session_id, new\.session_id\]/i);
    expect(sql).toMatch(/order by session\.id[\s\S]*for update/i);
    expect(sql).toMatch(/cannot mutate a set in a completed workout/i);
  });

  it('preserves live canonical-structure enforcement and parent cascades', () => {
    expect(sql).toMatch(/if tg_op = 'delete'[\s\S]*return old/i);
    expect(sql).toMatch(/jsonb_array_elements\(v_structure\)/i);
    expect(sql).toMatch(/superset group conflicts/i);
  });
});
