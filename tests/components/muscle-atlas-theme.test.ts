import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

function block(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing CSS block: ${selector}`);
  return match[1];
}

function token(scope: string, name: string) {
  const match = block(scope).match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing ${name} in ${scope}`);
  return match[1];
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

describe('muscle atlas theme contract', () => {
  it.each([':root', '.light'])('keeps meaningful neutral anatomy context at graphical-object contrast in %s', (scope) => {
    const background = token(scope, '--workout-anatomy-context-surface');
    expect(contrast(token(scope, '--workout-anatomy-context-fill'), background)).toBeGreaterThanOrEqual(3);
    expect(contrast(token(scope, '--workout-anatomy-context-stroke'), background)).toBeGreaterThanOrEqual(3);
  });

  it('renders the silhouette from semantic anatomy tokens rather than hard-coded light or dark assumptions', () => {
    const silhouette = block('.muscle-atlas__silhouette path');
    expect(silhouette).toContain('fill: var(--workout-anatomy-context-fill)');
    expect(silhouette).toContain('stroke: var(--workout-anatomy-context-stroke)');
    expect(silhouette).not.toMatch(/(?:#(?:fff|ffffff|000|000000)|color-mix)/i);
  });

  it('keeps restrained side-change motion, a visible rest state, and a fully static reduced-motion branch', () => {
    expect(block('.muscle-atlas__figure')).toContain('animation-duration: 220ms');
    expect(css).toMatch(/@keyframes muscle-atlas-front-in\s*\{[\s\S]*?to\s*\{\s*opacity:\s*1;\s*transform:\s*translateX\(0\);\s*\}/);
    expect(css).toMatch(/@keyframes muscle-atlas-back-in\s*\{[\s\S]*?to\s*\{\s*opacity:\s*1;\s*transform:\s*translateX\(0\);\s*\}/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.muscle-atlas__figure, \.muscle-atlas__region path\s*\{\s*animation:\s*none;\s*transition:\s*none;\s*transform:\s*none;/);
  });
});
