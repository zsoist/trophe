import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseRepairArguments,
  runEnglishRepair,
} from '../../scripts/ops/repair-nik-english-core.mjs';

function adapter() {
  const profile = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'nik@example.test',
    full_name: 'Nik Example',
    language: 'el',
  };
  const rows = [
    { id: 'meal-1', client_id: profile.id, day_of_week: 1, meal_slot: 'breakfast', description: 'Greek breakfast' },
    { id: 'meal-2', client_id: profile.id, day_of_week: 1, meal_slot: 'lunch', description: 'Greek lunch' },
  ];

  return {
    findProfiles: vi.fn(async () => [profile]),
    listMealPlanEntries: vi.fn(async () => rows),
    updateProfileLanguage: vi.fn(async () => [profile.id]),
    updateMealPlanEntry: vi.fn(async ({ rowId }: { rowId: string }) => [rowId]),
    verifyProfile: vi.fn(async () => ({ ...profile, language: 'en' })),
    verifyMealPlanEntries: vi.fn(async () => [
      { ...rows[0], description: 'Oats and eggs' },
      { ...rows[1], description: 'Chicken, rice, and salad' },
    ]),
  };
}

const mapping = {
  userId: '11111111-1111-4111-8111-111111111111',
  entries: [
    { id: 'meal-1', description: 'Oats and eggs' },
    { id: 'meal-2', description: 'Chicken, rice, and salad' },
  ],
};

describe('Nik English repair safety', () => {
  it('requires an exact UUID or email and an absolute mapping path', () => {
    expect(() => parseRepairArguments(['--mapping', './mapping.json'])).toThrow(/user-id or --email/i);
    expect(() => parseRepairArguments(['--email', 'nik@example.test', '--mapping', './mapping.json']))
      .toThrow(/absolute/i);
    expect(() => parseRepairArguments([
      '--email', 'nik@example.test',
      '--mapping', '/tmp/nik-mapping.json',
      '--apply',
    ])).toThrow(/backup-dir/i);
  });

  it('defaults to a zero-mutation dry run', async () => {
    const db = adapter();
    const result = await runEnglishRepair({
      adapter: db,
      selector: { email: 'nik@example.test' },
      mapping,
      apply: false,
      backupDirectory: await mkdtemp(join(tmpdir(), 'nik-repair-')),
      now: () => new Date('2026-08-20T12:00:00.000Z'),
    });

    expect(result.mode).toBe('dry-run');
    expect(result.profile).toMatchObject({ language: 'el' });
    expect(result.proposedEntries).toHaveLength(2);
    expect(db.updateProfileLanguage).not.toHaveBeenCalled();
    expect(db.updateMealPlanEntry).not.toHaveBeenCalled();
  });

  it('writes a backup before exact-row updates and verifies every result', async () => {
    const db = adapter();
    const backupDirectory = await mkdtemp(join(tmpdir(), 'nik-repair-'));
    const result = await runEnglishRepair({
      adapter: db,
      selector: { userId: mapping.userId },
      mapping,
      apply: true,
      backupDirectory,
      now: () => new Date('2026-08-20T12:00:00.000Z'),
    });

    expect(result.mode).toBe('applied');
    expect(result.updatedProfileIds).toEqual([mapping.userId]);
    expect(result.updatedMealPlanIds).toEqual(['meal-1', 'meal-2']);
    if (!result.backupPath) throw new Error('Expected an applied backup path');
    expect(await readFile(result.backupPath, 'utf8')).toContain('Greek breakfast');
    expect(db.updateProfileLanguage.mock.invocationCallOrder[0])
      .toBeGreaterThan(0);
    expect(result.verifiedEntries.map((row: { description: string }) => row.description))
      .toEqual(['Oats and eggs', 'Chicken, rice, and salad']);
  });

  it('aborts when identity, mapping rows, or affected rows are ambiguous', async () => {
    const duplicate = adapter();
    duplicate.findProfiles.mockResolvedValueOnce([
      { id: 'a', email: 'nik@example.test', full_name: 'Nik A', language: 'el' },
      { id: 'b', email: 'nik@example.test', full_name: 'Nik B', language: 'en' },
    ]);
    await expect(runEnglishRepair({
      adapter: duplicate,
      selector: { email: 'nik@example.test' },
      mapping,
      apply: false,
      backupDirectory: tmpdir(),
    })).rejects.toThrow(/exactly one profile/i);

    const mismatched = adapter();
    mismatched.updateMealPlanEntry.mockResolvedValueOnce([]);
    await expect(runEnglishRepair({
      adapter: mismatched,
      selector: { userId: mapping.userId },
      mapping,
      apply: true,
      backupDirectory: await mkdtemp(join(tmpdir(), 'nik-repair-')),
    })).rejects.toThrow(/meal-1.*exactly once/i);
  });

  it('restores every completed write when a later exact-row update fails', async () => {
    const db = adapter();
    db.updateMealPlanEntry
      .mockResolvedValueOnce(['meal-1'])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['meal-1']);

    await expect(runEnglishRepair({
      adapter: db,
      selector: { userId: mapping.userId },
      mapping,
      apply: true,
      backupDirectory: await mkdtemp(join(tmpdir(), 'nik-repair-')),
    })).rejects.toThrow(/meal-2.*exactly once/i);

    expect(db.updateMealPlanEntry).toHaveBeenLastCalledWith({
      rowId: 'meal-1',
      userId: mapping.userId,
      description: 'Greek breakfast',
    });
    expect(db.updateProfileLanguage).not.toHaveBeenCalled();
  });
});
