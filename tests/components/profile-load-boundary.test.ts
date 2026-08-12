import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/dashboard/profile/page.tsx'),
  'utf8',
);

describe('client profile load boundary', () => {
  it('rejects auth, query, and missing-profile failures before populating form state', () => {
    const block = source.slice(
      source.indexOf('const loadData = useCallback'),
      source.indexOf('useEffect(() => { loadData();'),
    );

    expect(block).toContain('setLoading(true);');
    expect(block).toContain('setLoadError(false);');
    expect(block).toContain('error: authError');
    expect(block).toContain('if (authError)');
    expect(block).toContain('const loadFailure = profRes.error || cpRes.error;');
    expect(block).toContain('if (loadFailure || !profRes.data)');
    expect(block).toContain("router.replace('/onboarding');");
    expect(block.indexOf('if (loadFailure ||')).toBeLessThan(
      block.indexOf('setProfile(profRes.data)'),
    );
    expect(block).toContain('setLoadError(true);');
    expect(block).not.toContain("console.error('Profile load error:'");
  });

  it('renders a translated, retryable error instead of an empty form', () => {
    expect(source).toContain('const [loadError, setLoadError]');
    expect(source).toContain('if (loadError) {');
    expect(source).toContain("t('profile.load_failed')");
    expect(source).toContain("t('food.retry')");
    expect(source).toContain('onClick={loadData}');
  });
});
