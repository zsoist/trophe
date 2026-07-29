import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/dashboard/log/page.tsx'),
  'utf8',
);

describe('food log load consistency', () => {
  it('invalidates in-flight requests as soon as the selected date changes', () => {
    expect(source).toContain('const loadRequestRef = useRef(0);');

    const dateBlock = source.slice(
      source.indexOf('const handleDateChange = useCallback'),
      source.indexOf('const saveSkipped ='),
    );
    expect(dateBlock).toContain('loadRequestRef.current += 1;');
    expect(dateBlock).toContain('setPageLoading(true);');

    const loadBlock = source.slice(
      source.indexOf('const loadTodayLog = useCallback'),
      source.indexOf('useEffect(() => {', source.indexOf('const loadTodayLog = useCallback')),
    );
    expect(loadBlock).toContain('const requestId = ++loadRequestRef.current;');
    expect(loadBlock).toContain('if (requestId !== loadRequestRef.current) return;');
  });

  it('rejects partial query results before replacing the visible day', () => {
    const block = source.slice(
      source.indexOf('const loadTodayLog = useCallback'),
      source.indexOf('useEffect(() => {', source.indexOf('const loadTodayLog = useCallback')),
    );
    expect(block).toContain('setLoadError(false);');
    expect(block).toContain('const loadFailure = [');
    expect(block).toContain('if (loadFailure ||');
    expect(block.indexOf('if (loadFailure ||')).toBeLessThan(
      block.indexOf('setTodayLog(todayRes.data)'),
    );
    expect(block).toContain('setLoadError(true);');
    expect(block).toContain("router.replace('/onboarding');");
  });

  it('renders a translated retry action rather than an empty log', () => {
    expect(source).toContain('const [loadError, setLoadError]');
    expect(source).toContain('if (loadError) {');
    expect(source).toContain("t('food.log_load_failed')");
    expect(source).toContain("t('food.retry')");
    expect(source).toContain('onClick={() => void loadTodayLog()}');
  });
});
