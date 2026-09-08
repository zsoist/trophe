import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath = 'drizzle/0086_coach_pilot_budget_authority.sql';

describe('Ask Trophē shared pilot budget migration', () => {
  it('uses the reserved 0086 slot and keeps one private shared authority', async () => {
    const [migration, journalSource] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile('drizzle/meta/_journal.json', 'utf8'),
    ]);
    const journal = JSON.parse(journalSource) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(journal.entries.filter((entry) => entry.idx === 86)).toEqual([
      expect.objectContaining({ tag: '0086_coach_pilot_budget_authority' }),
    ]);
    expect(migration).toContain("scope_key text NOT NULL UNIQUE CHECK (scope_key = 'ask-trophe-shared')");
    expect(migration).toContain('ALTER TABLE private.coach_pilot_budgets ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON private.coach_pilot_budgets FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON private.coach_pilot_budgets TO service_role');
    expect(migration).toContain('CREATE UNIQUE INDEX idx_agent_runs_coach_pilot_attempt');
    expect(migration).toContain('CREATE INDEX idx_agent_runs_coach_pilot_rows');
    expect(migration).not.toMatch(/GRANT ALL/i);
    expect(migration).not.toMatch(/INSERT INTO private\.coach_pilot_budgets/i);
  });
});
