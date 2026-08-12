import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('coach plan save feedback', () => {
  it('requires a persisted client row before reporting success', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/coach/client/[id]/plan/page.tsx'),
      'utf8',
    );
    const saveBlock = source.slice(
      source.indexOf('const handleSave = async () => {'),
      source.indexOf('// Deterministic calorie/macro baseline'),
    );

    expect(saveBlock).toContain("setSaveError(null)");
    expect(saveBlock).toContain(".select('user_id')");
    expect(saveBlock).toContain('.maybeSingle()');
    expect(saveBlock).toContain('if (error || !data)');
    expect(saveBlock).toContain(
      "setSaveError('Could not save plan — try again');",
    );
    expect(saveBlock.indexOf('if (error || !data)')).toBeLessThan(
      saveBlock.indexOf('setSaved(true)'),
    );
  });

  it('renders the save error next to the plan action', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/coach/client/[id]/plan/page.tsx'),
      'utf8',
    );

    expect(source).toContain('const [saveError, setSaveError]');
    expect(source).toContain('{saveError && (');
    expect(source).toContain('{saveError}');
  });
});
