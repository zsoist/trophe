import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

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

const actionFiles = [
  'app/coach/page.tsx',
  'app/coach/client/[id]/page.tsx',
  'app/coach/client/[id]/plan/page.tsx',
  'app/coach/client/[id]/memory/page.tsx',
] as const;

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
          && !/fontSize:\s*(?:1[6-9]|[2-9]\d)/.test(element))),
    );

    expect(controls.length).toBeGreaterThan(0);
    expect(undersized.map(({ file, element }) => `${file}: ${element.slice(0, 120)}`)).toEqual([]);
  });

  it('pairs the real client action tray with a matching route-root safe-area reserve', () => {
    const client = source('app/coach/client/[id]/page.tsx');
    const rootStart = client.indexOf('data-coach-workspace-root');
    const routeRoot = rootStart >= 0 ? client.slice(rootStart, client.indexOf('<PanelPrefsProvider', rootStart)) : '';
    const trayStart = client.indexOf('data-coach-action-tray');
    const tray = trayStart >= 0 ? client.slice(trayStart, client.indexOf('</div>', trayStart) + 6) : '';

    expect(routeRoot).toContain("'--coach-action-height': '84px'");
    expect(routeRoot).toContain("paddingBottom: 'calc(var(--coach-action-height) + env(safe-area-inset-bottom))'");
    expect(rootStart).toBeGreaterThan(0);
    expect(trayStart).toBeGreaterThan(rootStart);
    expect(tray).toContain('sticky');
    expect(tray).toContain('<QuickActionsBar');
    expect(tray).not.toContain('fixed');
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

  it('gives key roster, filter, plan, and memory actions 44px targets and visible focus', () => {
    const required = actionFiles.flatMap((file) => jsxElements(file, 'button')
      .filter(({ text }) => /data-coach-primary-action/.test(text))
      .map(({ text }) => ({ file, text })));
    const violations = required.flatMap(({ file, text }) => [
      !/(?:min-h-11|h-11|minHeight:\s*44)/.test(text) && `${file}: action below 44px`,
      !/(?:min-w-11|w-11|minWidth:\s*44)/.test(text) && /data-icon-only/.test(text) && `${file}: icon action below 44px wide`,
      !/(?:focus-visible:|onFocus=)/.test(text) && `${file}: action lacks visible focus`,
    ].filter(Boolean) as string[]);

    expect(required.length).toBeGreaterThanOrEqual(12);
    expect(violations).toEqual([]);
  });

  it('keeps plan and memory primary controls in a one-column mobile reflow', () => {
    for (const file of ['app/coach/client/[id]/plan/page.tsx', 'app/coach/client/[id]/memory/page.tsx']) {
      const value = source(file);
      const start = value.indexOf('data-coach-mobile-workspace');
      const end = value.indexOf('data-coach-mobile-workspace-end', start);
      const mobile = start >= 0 && end > start ? value.slice(start, end) : '';

      expect(mobile, `${file}: missing mobile workspace anchors`).not.toBe('');
      expect(mobile, `${file}: missing single-column mobile base`).toMatch(/(?:grid-cols-1|flex-col)/);
      expect(mobile, `${file}: hard mobile min-width`).not.toMatch(/(?:minWidth:\s*(?:[1-9]\d+)|min-w-\[)/);
      expect(mobile, `${file}: primary controls forced nowrap`).not.toMatch(/(?:whitespace-nowrap|whiteSpace:\s*'nowrap')/);
      expect(mobile, `${file}: two-dimensional primary overflow`).not.toMatch(/overflow-x-(?:auto|scroll)/);
    }
  });
});
