import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/coach/client/[id]/plan/page.tsx'),
  'utf8',
);

describe('coach plan load boundary', () => {
  it('rejects partial Supabase results before populating editor state', () => {
    const block = source.slice(
      source.indexOf('const loadData = useCallback'),
      source.indexOf('// ── Actions'),
    );

    expect(block).toContain('setLoading(true);');
    expect(block).toContain('setLoadError(null);');
    expect(block).toContain('const loadFailure =');
    expect(block).toContain(
      'if (loadFailure || !profileRes.data || !clientProfileRes.data)',
    );
    expect(block.indexOf('if (loadFailure ||')).toBeLessThan(
      block.indexOf('setProfileName('),
    );
    expect(block).toContain(
      "setLoadError('Could not load this client plan — try again');",
    );
    expect(block).not.toContain("console.error('PlanEditor: load error'");
  });

  it('renders a retryable error instead of an empty editor', () => {
    expect(source).toContain('const [loadError, setLoadError]');
    expect(source).toContain('if (loadError) {');
    expect(source).toContain('onClick={loadData}');
    expect(source).toContain('{loadError}');
  });
});
