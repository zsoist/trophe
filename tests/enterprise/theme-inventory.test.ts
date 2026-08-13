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

  it('permits dark media paint only at an explicit marker on a real media boundary', () => {
    const result = run(fixture({
      'components/VideoPanel.tsx': "export const view = <div data-theme-exempt=\"media-canvas\" className=\"bg-black\"><video /></div>;\n",
      'components/CanvasPanel.tsx': "export const view = <div data-theme-exempt=\"media-canvas\" className=\"bg-black\"><canvas /></div>;\n",
      'components/ImagePanel.tsx': "export const view = <div data-theme-exempt=\"media-canvas\" className=\"bg-black\"><img alt=\"Preview\" /></div>;\n",
      'components/MarkedGeneric.tsx': "export const view = <div data-theme-exempt=\"media-canvas\" className=\"bg-black\"><p>Controls</p></div>;\n",
      'components/UnmarkedVideo.tsx': "export const view = <video className=\"bg-black\" />;\n",
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('components/VideoPanel.tsx');
    expect(result.stderr).not.toContain('components/CanvasPanel.tsx');
    expect(result.stderr).not.toContain('components/ImagePanel.tsx');
    expect(result.stderr).toContain('components/MarkedGeneric.tsx:1:');
    expect(result.stderr).toContain('components/UnmarkedVideo.tsx:1:');
  });

  it('rejects arbitrary neutral hex paint in utility, inline style, and SVG presentation', () => {
    const result = run(fixture({
      'app/utility.tsx': "export const view = <p className=\"text-[#000]\">Bad utility</p>;\n",
      'components/Inline.tsx': "export const view = <div style={{ background: '#1a1a1a' }}>Bad inline</div>;\n",
      'components/Chart.tsx': "export const view = <svg><path fill=\"#0a0a0a\" /></svg>;\n",
      'components/Fallback.tsx': "export const view = <div style={{ background: 'var(--bg,#0a0a0a)', color: 'var(--surface, #141414)' }}>Bad fallback</div>;\n",
      'components/Unlisted.tsx': "export const view = <div style={{ background: '#121212' }}>Bad unlisted neutral</div>;\n",
      'components/Conditional.tsx': "export const view = <button style={{ color: saved ? 'rgb(34,197,94)' : '#0a0a0a' }}>Save</button>;\n",
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('app/utility.tsx:1:');
    expect(result.stderr).toContain('components/Inline.tsx:1:');
    expect(result.stderr).toContain('components/Chart.tsx:1:');
    expect(result.stderr).toContain('components/Fallback.tsx:1:');
    expect(result.stderr).toContain('components/Unlisted.tsx:1:');
    expect(result.stderr).toContain('components/Conditional.tsx:1:');
    expect(result.stderr).toContain('arbitrary dark neutral hex presentation');
  });

  it('accepts a clean source tree', () => {
    const result = run(fixture({ 'app/clean.tsx': "export const clean = <p className=\"text-[var(--content-primary)]\">Ready</p>;\n" }));
    expect(result.status).toBe(0);
  });

  it('permits non-neutral brand and data paint in presentation expressions', () => {
    const result = run(fixture({
      'components/Brand.tsx': "export const view = <button style={{ color: saved ? 'rgb(34,197,94)' : '#D4A853', background: '#ef4444' }}>Save</button>;\n",
    }));
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
      expect(content).toContain('useDialogFocus');
      expect(content).toContain('safe-area-inset-bottom');
    }
    expect(source('components/progress/CustomizeSheet.tsx')).toMatch(/<motion\.div\s+ref=\{dialogRef\}\s+role="dialog"/);
  });

  it('keeps shared dialog focus infrastructure out of the coach feature boundary', () => {
    expect(() => readFileSync(path.join(repoRoot, 'components/shared/useDialogFocus.ts'), 'utf8')).not.toThrow();
    expect(() => readFileSync(path.join(repoRoot, 'components/coach/useCoachDialogFocus.ts'), 'utf8')).toThrow();
    const consumerSources = [
      'components/shared/FeedbackWidget.tsx',
      'components/shared/ShortcutsModal.tsx',
      'components/habits/HabitDetailModal.tsx',
      'components/progress/CustomizeSheet.tsx',
    ].map(source).join('\n');
    expect(consumerSources).toContain("@/components/shared/useDialogFocus");
    expect(consumerSources).not.toContain("@/components/coach/useCoachDialogFocus");
  });

  it('keeps feedback controls reachable above bottom navigation and visible on keyboard focus', () => {
    const feedback = source('components/shared/FeedbackWidget.tsx');
    expect(feedback).toContain('minHeight: 44');
    expect(feedback).toContain('max(calc(5rem + env(safe-area-inset-bottom)), 18px)');
    expect(feedback).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('keeps Habit Detail history semantic and disables the streak fill animation when motion is reduced', () => {
    const habitDetail = source('components/habits/HabitDetailModal.tsx');
    expect(habitDetail).toContain('bg-[var(--status-success-bg)]');
    expect(habitDetail).toContain('bg-[var(--status-danger-bg)]');
    expect(habitDetail).toContain('role="img"');
    expect(habitDetail).toContain('aria-label={`${day.date}: ${day.status}${day.mood ? `, ${day.mood}` : \'\'}`}');
    expect(habitDetail).toContain('initial={reducedMotion ? false : { width: 0 }}');
    expect(habitDetail).toContain('animate={reducedMotion ? false : { width:');
    expect(habitDetail).toContain('style={{ width: reducedMotion ? `${streakPercent}%` : undefined }}');
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
