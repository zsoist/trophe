import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// Tailwind 4 emits every utility inside `@layer utilities`. Unlayered author CSS
// always beats layered CSS, so legacy primitives such as `.btn-gold` silently
// killed `px-3`, `rounded-t-3xl`, or `font-bold` on the same element.
//
// Inside workout surfaces (`.workout-workspace`) the primitives live in
// `@layer components` so those utilities win. Outside, a `:not(.workout-workspace *)`
// copy keeps the historical unlayered precedence (coach/admin pages rely on it for
// 44px targets). Both copies must carry identical declarations.
const LEGACY_PRIMITIVES = ['.btn-gold', '.btn-ghost', '.input-dark', '.glass-elevated', '.safe-bottom'];
const SCOPE_GUARD = ':not(.workout-workspace *)';

function layerOf(node: postcss.Node): string | null {
  let parent = node.parent;
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule' && (parent as postcss.AtRule).name === 'layer') {
      return (parent as postcss.AtRule).params.trim();
    }
    parent = parent.parent;
  }
  return null;
}

function declarationsOf(rule: postcss.Rule): string[] {
  return rule.nodes
    .filter((node): node is postcss.Declaration => node.type === 'decl')
    .map((node) => `${node.prop}:${node.value}`)
    .sort();
}

function matchesPrimitive(selector: string, primitive: string): boolean {
  return selector === primitive || selector.startsWith(`${primitive}:`);
}

describe('legacy CSS primitives use the two-position cascade', () => {
  const stylesheet = postcss.parse(readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'));

  it('starts from the Tailwind 4 entry so the utilities layer exists', () => {
    const firstImport = stylesheet.nodes.find((node) => node.type === 'atrule') as postcss.AtRule | undefined;
    expect(firstImport?.name).toBe('import');
    expect(firstImport?.params).toContain('tailwindcss');
  });

  it.each(LEGACY_PRIMITIVES)('layers %s inside workout surfaces and scopes the unlayered copy away from them', (primitive) => {
    const layered = new Map<string, string[]>();
    const unlayered = new Map<string, string[]>();

    stylesheet.walkRules((rule) => {
      const selectors = rule.selectors.map((selector) => selector.trim());
      if (!selectors.some((selector) => matchesPrimitive(selector, primitive))) return;

      const layer = layerOf(rule);
      if (layer === 'components') {
        for (const selector of selectors) layered.set(selector, declarationsOf(rule));
        return;
      }

      expect(layer, `${rule.selector} must be either in @layer components or unlayered`).toBeNull();
      for (const selector of selectors) {
        expect(selector, `unlayered ${selector} must exclude workout surfaces`).toContain(SCOPE_GUARD);
        unlayered.set(selector.replace(SCOPE_GUARD, ''), declarationsOf(rule));
      }
    });

    expect(layered.size, `${primitive} must have a layered definition`).toBeGreaterThan(0);
    expect([...unlayered.keys()].sort(), `${primitive} unlayered copies must mirror the layered selectors`).toEqual([...layered.keys()].sort());
    for (const [selector, declarations] of layered) {
      expect(unlayered.get(selector), `${selector} declarations must be identical in both cascade positions`).toEqual(declarations);
    }
  });

  it('does not layer the iOS zoom guard, so inputs keep a 16px floor regardless of utilities', () => {
    let zoomGuard: postcss.Rule | undefined;
    stylesheet.walkRules('input, textarea, select', (rule) => {
      zoomGuard = rule;
    });
    expect(zoomGuard).toBeDefined();
    expect(layerOf(zoomGuard!)).toBeNull();
  });

  it('marks every workout route and self-contained workout dialog with the scope class', () => {
    const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
    expect(source('app/dashboard/workout/layout.tsx')).toContain('className="workout-workspace"');
    for (const dialog of ['components/workout/PlateCalculator.tsx', 'components/workout/PainFlagModal.tsx']) {
      expect(source(dialog), `${dialog} must opt into the layered primitives`).toMatch(/className="workout-workspace /);
    }
  });
});
