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
    // The stale guard reports incompletion (false) so a caller can gate on a settled canonical read.
    expect(loadBlock).toContain('if (requestId !== loadRequestRef.current) return false;');
  });

  it('consumes the shared canonical snapshot instead of re-deriving partial queries', () => {
    const block = source.slice(
      source.indexOf('const loadTodayLog = useCallback'),
      source.indexOf('useEffect(() => {', source.indexOf('const loadTodayLog = useCallback')),
    );
    expect(block).toContain('setLoadError(false);');
    // The canonical read is the shared reader (real day/week/targets/streak), not a local rebuild.
    expect(source).toContain("import { readCanonicalFoodState } from '@/lib/food/canonical-food-read'");
    expect(block).toContain('readCanonicalFoodState<FoodLogRowSnapshot>(user.id, { date: selectedDate })');
    // A failed canonical read still reports an error rather than replacing the visible day.
    expect(block).toContain('if (!result.ok || !result.snapshot) {');
    expect(block.indexOf('if (!result.ok || !result.snapshot) {')).toBeLessThan(
      block.indexOf('setTodayLog(day?.entries ?? [])'),
    );
    expect(block).toContain('setTodayLog(day?.entries ?? [])');
    expect(block).toContain('setWeekData(snapshot.week);');
    expect(block).toContain('setTargets(snapshot.targets);');
    expect(block).toContain('setStreak(snapshot.streak);');
    expect(block).toContain('setLoadError(true);');
    expect(block).toContain('if (result.missingProfile) {');
    expect(block).toContain("router.replace('/onboarding');");
  });

  it('renders a translated retry action rather than an empty log', () => {
    expect(source).toContain('const [loadError, setLoadError]');
    expect(source).toContain('if (loadError) {');
    expect(source).toContain("t('food.log_load_failed')");
    expect(source).toContain("t('food.retry')");
    expect(source).toContain('onClick={() => void loadTodayLog()}');
  });

  it('reloads the visible day when a coach receipt introduces a new food entry', () => {
    expect(source).toContain("window.addEventListener(COACH_FOOD_REFRESH, refreshNewEntry)");
    expect(source).toContain('if (selection?.actorId !== userId) return;');
    // No found-only shortcut: the mounted surface must always re-run the canonical read before
    // reporting the refresh complete, never settle on the entry already being in local state.
    expect(source).not.toContain('todayLog.some(entry => entry.id === selection.entryId)');
    expect(source).toContain('void loadTodayLog().then(settle);');
    expect(source).toContain('COACH_FOOD_REFRESH_DONE');
    expect(source).toContain("window.removeEventListener(COACH_FOOD_REFRESH, refreshNewEntry)");
  });
});
