import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'components/food/QuickFoodInput.tsx'),
  'utf8',
);

describe('QuickFoodInput persistence boundary', () => {
  it('requires the returned row before celebrating a manual log', () => {
    const block = source.slice(
      source.indexOf('const handleManualEntry = async'),
      source.indexOf('const handleConfirm = async'),
    );

    expect(block).toContain("const { data: manualInsert, error: dbError }");
    expect(block).toContain(".select('id')");
    expect(block).toContain('.maybeSingle()');
    expect(block).toContain('if (dbError || !manualInsert)');
    expect(block.indexOf('if (dbError || !manualInsert)')).toBeLessThan(
      block.indexOf('setMode(\'success\')'),
    );
    expect(block).toContain('onLogged([manualInsert.id])');
  });

  it('requires exactly one returned id for every reviewed AI item', () => {
    const block = source.slice(
      source.indexOf('const handleConfirm = async'),
      source.indexOf('const handleCancel ='),
    );

    expect(block).toContain(
      'if (dbError || !inserted || inserted.length !== entries.length)',
    );
    expect(block.indexOf('inserted.length !== entries.length')).toBeLessThan(
      block.indexOf('setSuccessCount(items.length)'),
    );
    expect(block).toContain('const insertedIds = inserted.map');
    expect(block).toContain('onLogged(insertedIds)');
    expect(block).not.toContain('inserted ?? []');
  });

  it('uses translated persistence feedback', () => {
    expect(source).toContain("t('food.save_failed')");
    expect(source).toContain("t('food.session_expired')");
    expect(source).toContain("t('food.invalid_entry')");
  });
});
