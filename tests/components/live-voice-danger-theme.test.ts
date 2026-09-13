// Structural regression for the AG2 light-theme finding: the voice end control used the dark-only
// danger #f19791 as a literal, which is too pale on the light surface. The approved package maps
// #f19791 (dark) / #a6322e (light); the module must carry a theme-aware override instead of one
// hardcoded value. jsdom has no CSS engine, so this reads the module source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'components/assistant/LiveVoiceControl.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

it('maps the voice danger token per theme, keeping the approved dark value and the light override', () => {
  // Dark stays the approved #f19791; it is the value declared on the dock surface itself.
  expect(css).toMatch(/\.dock\s*\{[^}]*--at-danger\s*:\s*#f19791/i);
  // Light inherits the approved package value through an explicit theme override.
  const lightRule = /:global\(\.light\)\s+\.dock\s*\{[^}]*--at-danger\s*:\s*#a6322e\s*;?[^}]*\}/i.exec(css);
  expect(lightRule).not.toBeNull();
  // No other literal danger leaks a third value.
  const literals = Array.from(css.matchAll(/--at-danger\s*:\s*([^;}\n]+)/g), match => match[1].trim());
  expect(new Set(literals)).toEqual(new Set(['#f19791', '#a6322e']));
  // The end control consumes the token rather than a hardcoded color.
  expect(css).toMatch(/\.endButton\s*\{[^}]*color\s*:\s*var\(--at-danger\)/i);
});
