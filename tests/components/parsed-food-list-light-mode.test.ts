import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = postcss.parse(readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'));

function declaration(selector: string, property: string): string {
  let resolved: string | undefined;

  stylesheet.walkRules((rule: Rule) => {
    const selectors = rule.selectors.map((candidate) => candidate.trim());
    if (!selectors.includes(selector)) return;
    rule.walkDecls(property, (decl) => {
      resolved = decl.value.trim();
    });
  });

  if (!resolved) throw new Error(`Missing ${property} declaration for ${selector}`);
  return resolved;
}

function numericDeclaration(selector: string, property: string, unit: 'px' | 'rem'): number {
  const value = declaration(selector, property);
  if (!value.endsWith(unit)) throw new Error(`${selector} ${property} must use ${unit}, received ${value}`);
  return Number.parseFloat(value);
}

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/gi);
  if (!channels || channels.length !== 3) throw new Error(`Expected six-digit hex color, received ${hex}`);
  const [red, green, blue] = channels.map((channel) => {
    const srgb = Number.parseInt(channel, 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe('food portion review visual contract', () => {
  it('keeps primary mobile controls large enough to read and tap', () => {
    expect(numericDeclaration('.portion-review-stepper', 'width', 'px')).toBeGreaterThanOrEqual(52);
    expect(numericDeclaration('.portion-review-stepper', 'height', 'px')).toBeGreaterThanOrEqual(52);
    expect(numericDeclaration('.portion-review-amount', 'font-size', 'px')).toBeGreaterThanOrEqual(20);
    expect(numericDeclaration('.portion-review-choice', 'min-height', 'px')).toBeGreaterThanOrEqual(58);
    expect(numericDeclaration('.portion-review-choice-label', 'font-size', 'px')).toBeGreaterThanOrEqual(14);
    expect(numericDeclaration('.portion-review-total-value', 'font-size', 'px')).toBeGreaterThanOrEqual(16);
    expect(numericDeclaration('.portion-review-total-label', 'font-size', 'px')).toBeGreaterThanOrEqual(11);
  });

  it('uses less fixed-bar spacer while retaining a safe mobile scroll inset', () => {
    const spacer = numericDeclaration('.portion-review-list', 'padding-bottom', 'rem');
    expect(spacer).toBeGreaterThanOrEqual(9);
    expect(spacer).toBeLessThanOrEqual(9);
  });

  it('uses WCAG AA warning text in light mode', () => {
    const warning = declaration('.light', '--warn');
    const background = declaration('.light', '--bg-primary');

    expect(declaration('.light .portion-review-estimate-copy', 'color')).toBe('var(--warn)');
    expect(contrastRatio(warning, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every macro total readable on the light save bar', () => {
    const background = declaration('.light', '--bg-primary');
    const accessibleMacroColors = [
      ['.light .portion-review-total-calories', '--gold-600', ':root'],
      ['.light .portion-review-total-protein', '--err', '.light'],
      ['.light .portion-review-total-carbs', '--info', '.light'],
      ['.light .portion-review-total-fat', '--plum', '.light'],
      ['.light .portion-review-total-fiber', '--ok', '.light'],
    ] as const;

    for (const [selector, token, tokenScope] of accessibleMacroColors) {
      expect(declaration(selector, 'color')).toBe(`var(${token})`);
      expect(contrastRatio(declaration(tokenScope, token), background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
