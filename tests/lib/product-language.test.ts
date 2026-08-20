import { describe, expect, it } from 'vitest';
import {
  ENGLISH_BETA_LANGUAGE,
  getEnglishGreeting,
  normalizeProductLanguage,
} from '@/lib/product-language';

describe('English beta product language', () => {
  it('forces stale supported and unknown preferences to English', () => {
    expect(ENGLISH_BETA_LANGUAGE).toBe('en');
    expect(normalizeProductLanguage('el')).toBe('en');
    expect(normalizeProductLanguage('es')).toBe('en');
    expect(normalizeProductLanguage('fr')).toBe('en');
    expect(normalizeProductLanguage(null)).toBe('en');
  });

  it.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('uses a stable English greeting at hour %i', (hour, expected) => {
    expect(getEnglishGreeting(hour)).toBe(expected);
  });
});
