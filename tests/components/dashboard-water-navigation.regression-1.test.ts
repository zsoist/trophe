import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dashboard water summary navigation', () => {
  it('opens the water tracker without logging a drink as a side effect', () => {
    const dashboard = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
    expect(dashboard).toContain('id="water-tracker"');

    const quickActions = dashboard.match(/\{\(\[\s*[\s\S]*?\]\s*as const\)\.map\(a => \(/)?.[0] ?? '';
    const waterAction = quickActions.match(/\{ icon: 'i-drop',[\s\S]*?\},/)?.[0] ?? '';

    expect(dashboard).toMatch(/const scrollToWaterTracker = useCallback\(\(\) => \{[\s\S]*getElementById\('water-tracker'\)[\s\S]*scrollIntoView/);
    expect(waterAction).toContain('action: scrollToWaterTracker');
    expect(waterAction).not.toContain('addWater');
  });
});
