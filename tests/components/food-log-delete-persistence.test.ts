import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The delete/undo controller moved into components/food/use-food-log-delete.ts.
// Behavior is covered by tests/components/food-log-delete-durability.regression-1.test.tsx;
// these assertions keep the persistence *contract* visible at the source seam.
const page = readFileSync(join(process.cwd(), 'app/dashboard/log/page.tsx'), 'utf8');
const hook = readFileSync(join(process.cwd(), 'components/food/use-food-log-delete.ts'), 'utf8');
const port = readFileSync(join(process.cwd(), 'components/food/food-log-delete-port.ts'), 'utf8');

describe('food log delete persistence', () => {
  it('verifies a single delete against the returned row before trusting it', () => {
    expect(port).toContain(".delete()");
    expect(port).toContain(".eq('id', id)");
    expect(port).toContain(".select('id')");
    expect(port).toContain('.maybeSingle()');
    // A lost/rejected response is 'unknown' (=> refetch), never a faked result.
    expect(port).toContain("if (error) return 'unknown';");
    expect(port).toContain("return data ? 'confirmed' : 'unknown';");
    expect(port).not.toContain('return !error');
    expect(port).not.toContain('console.error');
  });

  it('persists the delete immediately instead of after the undo window', () => {
    // The database delete fires on the tap (synchronously); the 5s timer only
    // dismisses the toast, and it starts once the DELETE settles.
    expect(hook).toContain('port.deleteOne(entry.id)');
    expect(hook).not.toContain('setTimeout(() => {\n      void port.deleteOne');
    expect(hook).not.toContain('commitDelete');
  });

  it('verifies that batch undo removed every requested row', () => {
    expect(port).toContain(".in('id', ids)");
    expect(port).toContain(".select('id')");
    expect(port).toContain('data.length === ids.length');
    expect(port).toContain("if (error) return 'unknown';");
  });

  it('serializes Undo behind the in-flight DELETE and refetches on ambiguity', () => {
    // Undo awaits the typed delete outcome before re-inserting.
    expect(hook).toContain('record.outcome ?? await record.promise');
    // A unique-id collision is only a confirmed no-op after the visible row is
    // read back and matches the exact desired payload; otherwise it is 'unknown'.
    expect(port).toContain("if (error.code !== '23505') return 'unknown';");
    expect(port).toContain(".select('*')");
    expect(port).toContain(".eq('id', entry.id)");
    // The collision is verified against the COMPLETE persisted row (food-log-row.ts),
    // not a handpicked legacy field list.
    expect(port).toContain('isSamePersistedRow(entry, verify.data) ? ');
    // The Undo INSERT carries the complete snapshot payload.
    expect(port).toContain('insert(persistedInsertPayload(entry))');
    // Ambiguous delete => refetch, never a re-inserted phantom row.
    expect(hook).toContain("if (outcome === 'unknown')");
    expect(hook).toContain('void onRefetch();');
  });

  it('shows translated persistence failure feedback', () => {
    expect(page).toContain('const [mutationError, setMutationError]');
    expect(page).toContain('{mutationError && (');
    expect(page).toContain('role="alert"');
    expect(page).toContain('onError: (key) => setMutationError(t(key))');
    expect(page).toContain('port: foodLogDeletePort');
    expect(hook).toContain("onError('food.delete_failed')");
    expect(hook).toContain("onError('food.restore_failed')");
  });
});
