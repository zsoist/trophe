import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const path = join(process.cwd(), 'drizzle/0080_workout_terminal_parent_identity.sql');

describe('completed workout parent identity guard', () => {
  it('ships a follow-up migration guarding identity, order, and template provenance', () => {
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/new\.id is distinct from old\.id/i);
    expect(sql).toMatch(/new\.created_at is distinct from old\.created_at/i);
    expect(sql).toMatch(/new\.template_id is distinct from old\.template_id/i);
    expect(sql).toMatch(/security definer[\s\S]*archive_workout_template_provenance/i);
    expect(sql).toMatch(/before delete on public\.workout_templates/i);
    expect(sql).toMatch(/revoke all on function public\.archive_workout_template_provenance\(\)[\s\S]*authenticated/i);
  });
});
