import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = postcss.parse(readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'));

const requiredTokens = [
  '--canvas', '--canvas-subtle', '--canvas-inverse',
  '--surface-1', '--surface-2', '--surface-3', '--surface-hover', '--surface-active', '--surface-overlay',
  '--content-primary', '--content-secondary', '--content-muted', '--content-inverse', '--content-disabled',
  '--border-subtle', '--border-default', '--border-strong', '--border-focus',
  '--action-primary', '--action-primary-hover', '--action-on-primary', '--action-secondary', '--focus-ring',
  '--status-success-fg', '--status-success-bg', '--status-success-border',
  '--status-warning-fg', '--status-warning-bg', '--status-warning-border',
  '--status-danger-fg', '--status-danger-bg', '--status-danger-border',
  '--status-info-fg', '--status-info-bg', '--status-info-border',
  '--data-calories', '--data-protein', '--data-carbs', '--data-fat', '--data-fiber', '--data-sugar', '--data-neutral',
  '--shadow-low', '--shadow-medium', '--shadow-high',
] as const;

function declaration(selector: string, property: string): string | undefined {
  let resolved: string | undefined;

  stylesheet.walkRules((rule: Rule) => {
    const selectors = rule.selectors.map((candidate) => candidate.trim());
    if (!selectors.includes(selector)) return;
    rule.walkDecls(property, (decl) => {
      resolved = decl.value.trim();
    });
  });

  return resolved;
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

function contrast(selector: string, foreground: string, background: string): number {
  const foregroundValue = declaration(selector, foreground);
  const backgroundValue = declaration(selector, background);
  if (!foregroundValue || !backgroundValue) throw new Error(`Missing contrast pair for ${selector}`);

  const light = Math.max(relativeLuminance(foregroundValue), relativeLuminance(backgroundValue));
  const dark = Math.min(relativeLuminance(foregroundValue), relativeLuminance(backgroundValue));
  return (light + 0.05) / (dark + 0.05);
}

function reducedMotionDeclaration(selector: string, property: string): string | undefined {
  let resolved: string | undefined;

  stylesheet.walkAtRules('media', (atRule) => {
    if (atRule.params !== '(prefers-reduced-motion: reduce)') return;
    atRule.walkRules((rule: Rule) => {
      const selectors = rule.selectors.map((candidate) => candidate.trim());
      if (!selectors.includes(selector)) return;
      rule.walkDecls(property, (decl) => {
        resolved = decl.value.trim();
      });
    });
  });

  return resolved;
}

describe('semantic theme token contract', () => {
  it('provides semantic tokens with accessible core color pairs in both themes', () => {
    for (const selector of [':root', '.light']) {
      for (const token of requiredTokens) expect(declaration(selector, token)).toBeTruthy();
      expect(contrast(selector, '--content-primary', '--canvas')).toBeGreaterThanOrEqual(7);
      expect(contrast(selector, '--content-secondary', '--canvas')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(selector, '--content-muted', '--canvas')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(selector, '--action-on-primary', '--action-primary')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps light success status text readable against its semantic background', () => {
    expect(contrast('.light', '--status-success-fg', '--status-success-bg')).toBeGreaterThanOrEqual(4.5);
  });

  it('turns off every nonessential animation when reduced motion is requested', () => {
    const nonessentialAnimations = [
      '.toast-in', '.toast-bar', '.theme-icon-in', '.skeleton::after',
      '.confetti-burst', '.confetti-particle', '.water-fill',
      '.ring-draw', '.live-glow', '.float-y',
    ];

    for (const selector of nonessentialAnimations) {
      expect(reducedMotionDeclaration(selector, 'animation')).toBe('none');
    }
  });
});
