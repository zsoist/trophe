import { describe, expect, it } from 'vitest';
import { displayToKg, formatWeight, kgToDisplay } from '@/lib/workout/units';

describe('workout weight units', () => {
  it('converts stored kilograms to pounds for display', () => {
    expect(kgToDisplay(100, 'kg')).toBe(100);
    expect(kgToDisplay(100, 'lb')).toBe(220.5);
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg');
    expect(formatWeight(102.5, 'lb')).toBe('226 lb');
  });

  it('converts pound input back to canonical kilograms', () => {
    expect(displayToKg(225, 'lb')).toBe(102.06);
    expect(displayToKg(102.5, 'kg')).toBe(102.5);
  });

  it('keeps a display round trip within the documented precision', () => {
    const displayedPounds = kgToDisplay(80, 'lb');
    expect(displayToKg(displayedPounds, 'lb')).toBeCloseTo(80, 1);
  });
});
