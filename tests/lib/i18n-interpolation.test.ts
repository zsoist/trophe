import { describe, expect, it } from 'vitest';
import { interpolateTranslation } from '@/lib/i18n-interpolate';

describe('translation interpolation', () => {
  it('replaces every occurrence of a repeated placeholder', () => {
    expect(
      interpolateTranslation(
        'avg {avg}{unit} · target {target}{unit}',
        { avg: 180, target: 200, unit: 'g' },
      ),
    ).toBe('avg 180g · target 200g');
  });

  it('inserts replacement text literally even when it contains dollar syntax', () => {
    expect(interpolateTranslation('{value} / {value}', { value: '$&5' })).toBe(
      '$&5 / $&5',
    );
  });
});
