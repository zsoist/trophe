import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const pagePath = join(root, 'app/coach/client/[id]/page.tsx');
const boundaryPath = join(root, 'components/coach/ClientAnalyticsPanels.tsx');

describe('coach client-detail delivery', () => {
  it('loads below-the-fold food analytics through one dynamic boundary', () => {
    const page = readFileSync(pagePath, 'utf8');

    expect(page).toContain("dynamic(() => import('@/components/coach/ClientAnalyticsPanels')");
    expect(page).toContain('aria-label="Loading client analytics"');
    expect(page).not.toContain('ssr: false');
    for (const component of [
      'MealQualityTimeline',
      'ProteinDistributionAnalyzer',
      'ClientFoodHeatmap',
      'WeekendAnalysis',
      'ProgressComparison',
    ]) {
      expect(page).not.toContain(`import ${component} from`);
    }
  });

  it('keeps panel preference gates and empty states inside the boundary', () => {
    const boundary = readFileSync(boundaryPath, 'utf8');
    const css = readFileSync(join(root, 'app/globals.css'), 'utf8');

    expect(boundary).toContain("import { Panel } from '@/components/coach/PanelGate'");
    expect(boundary).toContain('className="client-analytics-deferred"');
    expect(boundary).toContain("panelVisible('mealQuality')");
    expect(boundary).toContain("panelVisible('twoWeekComparison')");
    expect(boundary).toContain('No meals logged today');
    expect(boundary).toContain('<ClientFoodHeatmap data={foodHeatmapData} />');
    expect(css).toContain('content-visibility: auto');
    expect(css).toContain('contain-intrinsic-size: auto 900px');
  });
});
