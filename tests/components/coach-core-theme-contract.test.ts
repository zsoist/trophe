// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'client-1' }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'transition']);
  const element = (tag: 'div') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    (props, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      ref,
    }, props.children as React.ReactNode),
  );
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { div: element('div') }, useReducedMotion: () => true };
});

afterEach(() => cleanup());

const COACH_CORE_SOURCES = [
  'app/coach/page.tsx',
  'app/coach/client/[id]/page.tsx',
  'app/coach/client/[id]/plan/page.tsx',
  'app/coach/client/[id]/memory/page.tsx',
  'components/coach/ClientViewSettings.tsx',
  'components/coach/CustomizePanelsBar.tsx',
  'components/coach/MealPatternView.tsx',
  'components/coach/ClientFoodHeatmap.tsx',
  'components/coach/CoachInsightPanel.tsx',
] as const;

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

function inventory(patterns: readonly RegExp[]) {
  return COACH_CORE_SOURCES.flatMap((file) => patterns.flatMap((pattern) =>
    (source(file).match(pattern) ?? []).map((match) => `${file}: ${match}`),
  ));
}

function jsxElements(file: string, tag: string) {
  const value = source(file);
  const ast = ts.createSourceFile(file, value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Array<{ text: string; opening: ts.JsxOpeningLikeElement; node: ts.JsxElement | ts.JsxSelfClosingElement }> = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(ast) === tag) found.push({ text: node.getText(ast), opening, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

function hasVisibleJsxContent(node: ts.Node): boolean {
  if (ts.isJsxText(node)) return node.text.trim().length > 0;
  if (ts.isJsxExpression(node) && node.expression !== undefined) {
    return !ts.isJsxElement(node.expression) && !ts.isJsxSelfClosingElement(node.expression);
  }
  if (ts.isJsxElement(node)) return node.children.some(hasVisibleJsxContent);
  return false;
}

describe('coach roster and client workspace theme contract', () => {
  it('contains no dark-only surfaces, white-alpha recipes, or legacy theme tokens', () => {
    const forbidden = [
      /(?:bg|border|text)-stone-(?:700|800|900|950)(?:\/[\d.]+)?/g,
      /text-stone-(?:100|200|300|400|500|600)(?:\/[\d.]+)?/g,
      /(?:bg|border)-white\/(?:\[|\d)/g,
      /bg-\[#(?:0a0a0a|000000|000)\]/gi,
      /rgba\(255,\s*255,\s*255/g,
      /var\(--(?:t[1-6]|line(?:-2)?|bg(?:-1)?)(?:[,\)])/g,
      /var\(--bg-card(?:-elevated)?\)/g,
      /(?:bg|border|text)-(?:red|amber|yellow|green|emerald|sky|blue)-(?:[1-9]\d\d)(?:\/[\d.]+)?/g,
    ];

    expect(inventory(forbidden)).toEqual([]);
  });

  it('keeps functional text at 12px or larger', () => {
    const forbidden = [
      /text-\[(?:8|9|10|11)px\]/g,
      /fontSize:\s*(?:[89]|10|11)(?:\.\d+)?(?:[,}])/g,
      /fontSize="(?:[89]|10|11)(?:\.\d+)?"/g,
    ];

    expect(inventory(forbidden)).toEqual([]);
  });

  it('keeps mobile text inputs, textareas, and selects at a 16px base without smaller inline overrides', () => {
    const controls = COACH_CORE_SOURCES.flatMap((file) => [
      ...(source(file).match(/<(?:input|textarea)\b[\s\S]*?\/>/g) ?? []),
      ...(source(file).match(/<select\b[\s\S]*?<\/select>/g) ?? []),
    ].map((element) => ({ file, element })));
    const undersized = controls.filter(({ element }) =>
      !/type="(?:checkbox|file|hidden|range|radio)"/.test(element)
      && (/(?:fontSize:\s*(?!16(?:\.0+)?[,}])\d+(?:\.\d+)?)(?:[,}])/.test(element)
        || (!/(?:text-base|text-\[16px\])/.test(element)
          && !/fontSize:\s*(?:1[6-9]|[2-9]\d)/.test(element))
        || /(?:text-sm|text-xs|text-\[(?:8|9|10|11|12|13|14|15)px\])/.test(element)),
    );

    expect(controls.length).toBeGreaterThan(0);
    expect(undersized.map(({ file, element }) => `${file}: ${element.slice(0, 120)}`)).toEqual([]);
  });

  it('pairs the real client action tray with a matching route-root safe-area reserve', () => {
    const client = source('app/coach/client/[id]/page.tsx');
    const loadedReturnStart = client.indexOf('return (', client.indexOf('const goalLabels'));
    const rootStart = client.indexOf('data-coach-workspace-root', loadedReturnStart);
    const routeRoot = rootStart >= 0 ? client.slice(rootStart, client.indexOf('<PanelPrefsProvider', rootStart)) : '';
    const trayStart = client.indexOf('data-coach-action-tray');
    const tray = trayStart >= 0 ? client.slice(trayStart, client.indexOf('</div>', trayStart) + 6) : '';

    expect(routeRoot).toContain("'--coach-action-height': '84px'");
    expect(routeRoot).toContain("paddingBottom: 'calc(var(--coach-action-height) + env(safe-area-inset-bottom))'");
    expect(client.match(/data-coach-workspace-root/g)).toHaveLength(1);
    expect(rootStart).toBeGreaterThan(loadedReturnStart);
    expect(trayStart).toBeGreaterThan(rootStart);
    expect(tray).toContain('sticky');
    expect(tray).toContain('<QuickActionsBar');
    expect(tray).toContain('[&>div]:!static');
  });

  it('has no nested native buttons and names every icon-only action', () => {
    const violations = COACH_CORE_SOURCES.flatMap((file) => jsxElements(file, 'button').flatMap(({ text, node }) => {
      const nested = (text.match(/<button\b/g) ?? []).length > 1;
      const children = ts.isJsxElement(node) ? node.children : [];
      const hasVisibleText = children.some(hasVisibleJsxContent);
      const iconOnly = !hasVisibleText;
      const named = /(?:aria-label|title)=/.test(text);
      return [
        nested && `${file}: nested button ${text.slice(0, 100)}`,
        iconOnly && !named && `${file}: unnamed icon button ${text.slice(0, 100)}`,
      ].filter(Boolean) as string[];
    }));

    expect(violations).toEqual([]);
  });

  it('gives every owned button a 44px target and visible focus', () => {
    const buttons = COACH_CORE_SOURCES.flatMap((file) => jsxElements(file, 'button')
      .map(({ text }) => ({ file, text })));
    const violations = buttons.flatMap(({ file, text }) => [
      !/(?:min-h-11|h-11|minHeight:\s*44)/.test(text) && `${file}: action below 44px`,
      !/(?:min-w-11|w-11|minWidth:\s*44)/.test(text) && !hasVisibleJsxContent(jsxElements(file, 'button').find((item) => item.text === text)!.node) && `${file}: icon action below 44px wide`,
      !/(?:focus-visible:|onFocus=)/.test(text) && `${file}: action lacks visible focus`,
    ].filter(Boolean) as string[]);

    expect(buttons.length).toBeGreaterThanOrEqual(50);
    expect(violations).toEqual([]);
  });

  it('keeps the complete plan and memory workspaces in a one-column mobile reflow', () => {
    for (const file of ['app/coach/client/[id]/plan/page.tsx', 'app/coach/client/[id]/memory/page.tsx']) {
      const value = source(file);
      const start = value.indexOf('data-coach-mobile-workspace');
      const end = value.indexOf('data-coach-mobile-workspace-end', start);
      const mobile = start >= 0 && end > start ? value.slice(start, end) : '';
      const reflowRegion = mobile.replace(/<div className="hidden lg:block[\s\S]*?<\/table>[\s\S]*?<\/div>/, '');

      expect(mobile, `${file}: missing mobile workspace anchors`).not.toBe('');
      expect(start).toBeLessThan(value.indexOf(file.includes('/plan/') ? 'MACRO TARGETS' : 'Tab selector'));
      expect(end).toBeGreaterThan(file.includes('/plan/') ? value.indexOf('Save Plan') : value.indexOf('AI Memory Tab'));
      expect(mobile, `${file}: missing single-column mobile base`).toMatch(/(?:grid-cols-1|flex-col)/);
      expect(reflowRegion, `${file}: hard mobile min-width`).not.toMatch(/(?:minWidth:\s*(?:1(?:[2-9]\d)|[2-9]\d\d)|min-w-\[)/);
      expect(reflowRegion, `${file}: primary controls forced nowrap`).not.toMatch(/(?:whitespace-nowrap|whiteSpace:\s*'nowrap')/);
      expect(reflowRegion, `${file}: two-dimensional primary overflow`).not.toMatch(/overflow-x-(?:auto|scroll)/);
    }
  });

  it('uses text-plus-icon statuses, semantic memory states, chart data roles, and action contrast', () => {
    const client = source('app/coach/client/[id]/page.tsx');
    const streak = client.slice(client.indexOf('function StreakCalendar'), client.indexOf('// ══ Main component'));
    expect(streak).toContain('aria-label={`${day.date}: ${day.status}`}');
    expect(streak).toContain('Completed');
    expect(streak).toContain('Missed');
    expect(streak).toContain('No check-in');

    const memory = source('app/coach/client/[id]/memory/page.tsx');
    expect(memory).not.toMatch(/rgba\((?:232,122,110|125,163,217|184,157,217|232,184,110)/);
    expect(memory).not.toMatch(/var\(--(?:err|info|warn|plum)/);
    expect(memory).toContain('var(--status-danger-bg)');

    const roster = source('app/coach/page.tsx');
    const chart = roster.slice(roster.indexOf('function ActivityBarChart'), roster.indexOf('// ═══════════════════════════════════════════════\n// Main Component'));
    expect(chart).toContain('role="img"');
    expect(chart).toContain('<title>Client activity this week</title>');
    expect(chart).toContain('var(--data-calories)');
    expect(chart).toContain('var(--data-neutral)');

    for (const file of ['components/coach/CoachInsightPanel.tsx', 'components/coach/MealPatternView.tsx']) {
      expect(source(file)).not.toMatch(/bg-\[#D4A853\][^"\n]*text-\[var\(--content-disabled\)\]/);
      expect(source(file)).toContain('text-[var(--action-on-primary)]');
    }
  });

  it('renders Assign Habit as a reduced-motion, focus-contained, restorable dialog', async () => {
    const clientPageModule = await import('@/app/coach/client/[id]/page');
    expect(clientPageModule.AssignHabitDialog).toBeTypeOf('function');

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const onClose = vi.fn();
    const view = render(React.createElement(clientPageModule.AssignHabitDialog, {
      habits: [{ id: 'habit-1', name_en: 'Daily walk', emoji: 'walk', category: 'movement', cycle_days: 14, difficulty: 'beginner' }],
      onAssign: vi.fn(), onClose,
    }));
    const dialog = screen.getByRole('dialog', { name: 'Assign Habit' });
    expect(dialog.className).toContain('safe-bottom');
    expect(document.activeElement).toBe(dialog);
    const close = screen.getByRole('button', { name: 'Close habit assignment' });
    expect(close.className).toContain('min-h-11');
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    const assign = screen.getByRole('button', { name: /Daily walk/ });
    expect(document.activeElement).toBe(assign);
    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(assign);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
