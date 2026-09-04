import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// Functional text in the workout workspace must never render below 12px.
// `npm run guard:theme` catches `text-[Npx]` utilities in TSX; this test covers the
// CSS side, where rem values such as 0.6875rem (11px) used to bypass the guard.
const MIN_PX = 12;
const WORKOUT_SELECTOR = /\.(?:workout-|plan-|exercise-|muscle-atlas)/;

function fontSizeInPx(value: string): number | null {
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  return match[2] === 'px' ? amount : amount * 16;
}

function describeContext(rule: postcss.Rule): string {
  const parts: string[] = [];
  let parent = rule.parent;
  while (parent && parent.type === 'atrule') {
    const atRule = parent as postcss.AtRule;
    parts.unshift(`@${atRule.name} ${atRule.params}`);
    parent = parent.parent;
  }
  return parts.length ? ` (${parts.join(' > ')})` : '';
}

describe('workout workspace text floor', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const stylesheet = postcss.parse(css);

  it('never declares a font-size below 12px on workout, plan, exercise, or muscle-atlas rules', () => {
    const violations: string[] = [];
    stylesheet.walkRules((rule) => {
      if (!WORKOUT_SELECTOR.test(rule.selector)) return;
      rule.walkDecls('font-size', (declaration) => {
        const px = fontSizeInPx(declaration.value);
        if (px !== null && px < MIN_PX) {
          violations.push(
            `${rule.selector.replace(/\s+/g, ' ')}${describeContext(rule)} => ${declaration.value} (line ${declaration.source?.start?.line})`,
          );
        }
      });
    });
    expect(violations).toEqual([]);
  });

  it('lets the today rail values wrap to two lines instead of clipping with an ellipsis', () => {
    const railValues: postcss.Rule[] = [];
    stylesheet.walkRules('.workout-today-rail dd', (rule) => {
      railValues.push(rule);
    });
    expect(railValues.length).toBeGreaterThan(0);
    const declaration = (rule: postcss.Rule, property: string) =>
      rule.nodes.find(
        (node): node is postcss.Declaration => node.type === 'decl' && node.prop === property,
      )?.value;

    for (const rule of railValues) {
      expect(declaration(rule, 'white-space'), `${describeContext(rule)} must not use nowrap`).not.toBe('nowrap');
    }

    const wrapping = railValues.find((rule) => declaration(rule, '-webkit-line-clamp') === '2');
    expect(wrapping, 'the narrow-viewport rail value must clamp to two lines').toBeDefined();
    expect(declaration(wrapping!, 'display')).toBe('-webkit-box');
    expect(declaration(wrapping!, '-webkit-box-orient')).toBe('vertical');
    expect(declaration(wrapping!, 'overflow-wrap')).toBe('break-word');

    // Short phones (<= 620px tall) fall back to a single clamped line so the
    // primary action still clears the bottom nav; the 12px floor is unchanged.
    const compact = railValues.find((rule) => declaration(rule, '-webkit-line-clamp') === '1');
    expect(compact, 'the compact-height rail value must clamp to one line').toBeDefined();
    expect(describeContext(compact!)).toContain('max-height: 620px');
  });

  it('holds a 44px floor on workout buttons now that utilities can shrink their padding', () => {
    let floor: postcss.Rule | undefined;
    stylesheet.walkRules((rule) => {
      if (rule.selectors.includes('.workout-workspace .btn-ghost') && rule.selectors.includes('.workout-workspace .btn-gold')) floor = rule;
    });
    expect(floor).toBeDefined();
    const declaration = (property: string) =>
      floor?.nodes.find(
        (node): node is postcss.Declaration => node.type === 'decl' && node.prop === property,
      )?.value;
    expect(declaration('min-width')).toBe('2.75rem');
    expect(declaration('min-height')).toBe('2.75rem');
  });

  it('keeps every workout TSX label at or above 0.75rem', () => {
    const files = [
      'components/workout/workspace/WorkoutTodayRail.tsx',
      'components/workout/workspace/WorkoutScheduleStrip.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, `${file} must not use sub-12px arbitrary text sizes`).not.toMatch(/text-\[0\.(?:5625|625|6875)rem\]/);
    }
  });
});
