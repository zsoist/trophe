import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/dashboard/log/page.tsx'),
  'utf8',
);

describe('food log delete persistence', () => {
  it('restores an optimistic single delete unless Supabase returns the deleted row', () => {
    const block = source.slice(
      source.indexOf('const restoreDeletedEntry ='),
      source.indexOf('// W13: which slot card'),
    );

    expect(block).toContain('const commitDelete =');
    expect(block).toContain(".select('id')");
    expect(block).toContain('.maybeSingle()');
    expect(block).toContain('if (error || !data)');
    expect(block).toContain('restoreDeletedEntry(entry);');
    expect(block).toContain('void commitDelete(pendingDelete);');
    expect(block).toContain('void commitDelete({ id, entry });');
    expect(block).not.toContain("console.error('food_log delete failed:'");
  });

  it('verifies that batch undo removed every requested row', () => {
    const block = source.slice(
      source.indexOf('const undoBatch = async'),
      source.indexOf('useEffect(() => () =>'),
    );

    expect(block).toContain(".select('id')");
    expect(block).toContain('if (error || !data || data.length !== ids.length)');
    expect(block).toContain("setMutationError(t('food.delete_failed'))");
    expect(block).toContain('await loadTodayLog();');
  });

  it('shows translated persistence failure feedback', () => {
    expect(source).toContain('const [mutationError, setMutationError]');
    expect(source).toContain('{mutationError && (');
    expect(source).toContain('role="alert"');
  });
});
