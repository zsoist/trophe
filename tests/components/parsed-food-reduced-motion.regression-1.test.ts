// Regression: the portion-review item rows and the fixed save bar still played
// their translate/scale entrance springs under prefers-reduced-motion. Reduced
// motion must suppress the movement (no offset/scale), not just shorten it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'components/food/ParsedFoodList.tsx'),
  'utf8',
);

describe('ParsedFoodList honors prefers-reduced-motion', () => {
  it('gates the item-row entrance movement on reduceMotion', () => {
    expect(source).toContain('initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}');
    expect(source).not.toContain('initial={{ opacity: 0, y: 14, scale: 0.97 }}');
  });

  it('gates the save-bar slide-in on reduceMotion', () => {
    expect(source).toContain('initial={reduceMotion ? false : { y: 100, opacity: 0 }}');
    expect(source).not.toContain('initial={{ y: 100, opacity: 0 }}');
  });
});
