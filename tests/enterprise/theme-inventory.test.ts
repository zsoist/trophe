import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const guardPath = path.join(repoRoot, 'scripts/ci/check-theme-inventory.mjs');
const fixtureRoots: string[] = [];

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'trophe-theme-inventory-'));
  fixtureRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [guardPath, '--root', root], { encoding: 'utf8' });
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('theme inventory guard', () => {
  it('reports path and line diagnostics for literal and constructed dark-only presentation', () => {
    const result = run(fixture({
      'app/example.tsx': "export const view = <div className={`bg-${'stone'}-950`} />;\n",
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('app/example.tsx:1:');
    expect(result.stderr).toContain('constructed dark-only utility');
  });

  it('rejects inline and SVG arbitrary white or black rgba presentation', () => {
    const result = run(fixture({
      'components/example.tsx': "export const view = <svg><path style={{ fill: 'rgba(0, 0, 0, .4)' }} /></svg>;\n",
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('components/example.tsx:1:');
    expect(result.stderr).toContain('arbitrary white/black rgba presentation');
  });

  it('rejects a generic chart label but permits a chart SVG tick with an accessible table equivalent', () => {
    const result = run(fixture({
      'components/ExampleChart.tsx': "export const chart = <><svg aria-label=\"Calories\"><text className=\"text-[10px]\">100</text></svg><table><caption>Calories 100</caption></table></>;\n",
      'components/UnlabeledChart.tsx': "export const chart = <svg aria-label=\"Calories\"><text className=\"text-[10px]\">100</text></svg>;\n",
      'components/Label.tsx': "export const label = <p className=\"text-[7px]\">Save</p>;\n",
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('components/ExampleChart.tsx');
    expect(result.stderr).toContain('components/UnlabeledChart.tsx:1:');
    expect(result.stderr).toContain('components/Label.tsx:1:');
  });

  it('permits a named media canvas but rejects the same dark presentation outside its canvas wrapper', () => {
    const result = run(fixture({
      'components/FormCheck.tsx': "export const view = <div className=\"media-canvas bg-black\"><video /></div>;\n",
      'components/CameraPanel.tsx': "export const view = <div className=\"bg-black\"><p>Controls</p></div>;\n",
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('components/FormCheck.tsx');
    expect(result.stderr).toContain('components/CameraPanel.tsx:1:');
  });

  it('accepts a clean source tree', () => {
    const result = run(fixture({ 'app/clean.tsx': "export const clean = <p className=\"text-[var(--content-primary)]\">Ready</p>;\n" }));
    expect(result.status).toBe(0);
  });

  it('accepts the actual application inventory only when all presentation is semantic', () => {
    const result = run(repoRoot);
    expect(result.status).toBe(0);
  });
});

describe('shared theme and overlay contracts', () => {
  const source = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

  it('keeps the install prompt a semantic safe-area region with reachable actions', () => {
    const install = source('components/shared/InstallCard.tsx');
    expect(install).toContain('role="region"');
    expect(install).toContain('env(safe-area-inset-bottom)');
    expect(install).toContain('minHeight: 44');
    expect(install).not.toMatch(/#[0-9a-f]{3,8}|rgba\(|linear-gradient\(/i);
  });

  it('uses semantic overlay paint for feedback and shortcut controls', () => {
    const feedback = source('components/shared/FeedbackWidget.tsx');
    const shortcuts = source('components/shared/ShortcutsModal.tsx');
    expect(feedback).not.toMatch(/#[0-9a-f]{3,8}|rgba\(/i);
    expect(shortcuts).not.toMatch(/#[0-9a-f]{3,8}|rgba\(/i);
  });

  it('uses semantic skeleton paint and disables shimmer for reduced motion', () => {
    expect(source('components/shared/Skeleton.tsx')).toContain('var(--data-neutral)');
    expect(source('components/shared/Skeleton.tsx')).not.toMatch(/rgba\(|linear-gradient\(/i);
    expect(source('app/globals.css')).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.skeleton::after \{ animation: none;/);
  });

  it('gives every task-owned sheet dialog focus containment and topmost-safe Escape handling', () => {
    for (const file of ['components/shared/FeedbackWidget.tsx', 'components/shared/ShortcutsModal.tsx', 'components/habits/HabitDetailModal.tsx', 'components/progress/CustomizeSheet.tsx']) {
      const content = source(file);
      expect(content).toContain('useCoachDialogFocus');
      expect(content).toContain('safe-area-inset-bottom');
    }
    expect(source('components/progress/CustomizeSheet.tsx')).toMatch(/<motion\.div\s+ref=\{dialogRef\}\s+role="dialog"/);
  });

  it('uses semantic data roles and accessible value equivalents in every task-owned chart', () => {
    for (const file of ['CalorieHeatmap.tsx', 'ComplianceTrend.tsx', 'DayPatterns.tsx', 'HabitRadar.tsx', 'MacroDonut.tsx', 'MacroTrendChart.tsx', 'ProteinDistribution.tsx', 'WeeklyMacroChart.tsx']) {
      const content = source(`components/charts/${file}`);
      expect(content).toMatch(/--data-/);
      expect(content).toMatch(/aria-label=|<table|sr-only/);
    }
  });

  it('keeps Day Patterns chart values outside the visual chart and maps each macro to a semantic data role', () => {
    const patterns = source('components/charts/DayPatterns.tsx');
    expect(patterns).toContain("color: 'var(--data-calories)'");
    expect(patterns).toContain("color: 'var(--data-protein)'");
    expect(patterns).toContain("color: 'var(--data-carbs)'");
    expect(patterns).toContain("color: 'var(--data-fat)'");
    expect(patterns).toContain("color: 'var(--data-fiber)'");
    expect(patterns).toContain('aria-label={`${t(\'analytics.day_patterns\')} ${t(tab.labelKey)} chart`}');
    expect(patterns).toContain('aria-label="Day pattern chart values"');
  });

  it('exposes every Habit Radar category score beside its semantic visual', () => {
    const radar = source('components/charts/HabitRadar.tsx');
    expect(radar).toContain('stroke="var(--border-subtle)"');
    expect(radar).toContain('stroke="var(--data-calories)"');
    expect(radar).toContain('aria-label="Habit balance chart"');
    expect(radar).toContain('aria-label="Habit balance values"');
  });

  it('describes Macro Donut actual and target macro values outside its semantic SVG', () => {
    const donut = source('components/charts/MacroDonut.tsx');
    expect(donut).toContain("protein: 'var(--data-protein)'");
    expect(donut).toContain("carbs: 'var(--data-carbs)'");
    expect(donut).toContain("fat: 'var(--data-fat)'");
    expect(donut).toContain('aria-label="Macro distribution chart"');
    expect(donut).toContain('aria-label="Macro distribution values"');
  });

  it('maps Macro Trend lines to semantic roles and exposes the visible time-series values', () => {
    const trend = source('components/charts/MacroTrendChart.tsx');
    expect(trend).toContain("color: 'var(--data-calories)'");
    expect(trend).toContain("color: 'var(--data-protein)'");
    expect(trend).toContain("color: 'var(--data-carbs)'");
    expect(trend).toContain("color: 'var(--data-fat)'");
    expect(trend).toContain('aria-label="Macro trend chart"');
    expect(trend).toContain('aria-label="Macro trend values"');
  });

  it('maps Protein Distribution bars to semantic roles and keeps meal values available beside them', () => {
    const distribution = source('components/charts/ProteinDistribution.tsx');
    expect(distribution).toContain("color: 'var(--data-protein)'");
    expect(distribution).toMatch(/breakfast:\s+'var\(--data-calories\)'/);
    expect(distribution).toContain('aria-label={`${t(\'analytics.nutrition_per_meal\')} chart`}');
    expect(distribution).toContain('aria-label="Meal distribution values"');
  });

  it('makes Weekly Macro chart bars and targets semantic and lists every rendered day', () => {
    const weekly = source('components/charts/WeeklyMacroChart.tsx');
    expect(weekly).toContain('stroke="var(--data-calories)"');
    expect(weekly).toContain('aria-label="Weekly calorie chart"');
    expect(weekly).toContain('aria-label="Weekly calorie values"');
  });
});
