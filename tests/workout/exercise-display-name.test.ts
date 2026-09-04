import { describe, expect, it } from 'vitest';
import { equipmentLabel, exerciseDisplayName, WORKOUT_EQUIPMENT_VALUES } from '@/components/workout/muscle-groups';
import { translations } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as italian } from '@/lib/locales/it';
import { nl } from '@/lib/locales/nl';
import { pt } from '@/lib/locales/pt';

const exercise = { name: 'Floor Press', name_es: 'Press en el suelo', name_el: 'Πιέσεις από το πάτωμα' };

describe('exerciseDisplayName (house rule: English for Greek, name_es for Spanish)', () => {
  it('keeps the English name for Greek users even when name_el is seeded', () => {
    expect(exerciseDisplayName({ name: 'Floor Press', name_el: 'Χ' }, 'el')).toBe('Floor Press');
    expect(exerciseDisplayName(exercise, 'el')).toBe('Floor Press');
  });

  it('uses name_es for Spanish users when present', () => {
    expect(exerciseDisplayName({ name: 'Floor Press', name_es: 'Press en el suelo' }, 'es')).toBe('Press en el suelo');
  });

  it('falls back to the English name when the Spanish name is missing or blank', () => {
    expect(exerciseDisplayName({ name: 'Floor Press' }, 'es')).toBe('Floor Press');
    expect(exerciseDisplayName({ name: 'Floor Press', name_es: null }, 'es')).toBe('Floor Press');
    expect(exerciseDisplayName({ name: 'Floor Press', name_es: '' }, 'es')).toBe('Floor Press');
  });

  it('keeps the English name for every other locale', () => {
    for (const lang of ['en', 'de', 'fr', 'it', 'pt', 'nl']) {
      expect(exerciseDisplayName(exercise, lang)).toBe('Floor Press');
    }
  });
});

describe('equipmentLabel', () => {
  const en = (key: string) => translations[key]?.en ?? key;

  it('translates every WorkoutEquipment value through a workout.equipment_* key', () => {
    for (const value of WORKOUT_EQUIPMENT_VALUES) {
      const label = equipmentLabel(en, value);
      expect(label, value).not.toBe(`workout.equipment_${value}`);
      expect(label, value).toMatch(/\S/);
    }
    expect(equipmentLabel(en, 'barbell')).toBe('Barbell');
    expect(equipmentLabel((key) => translations[key]?.el ?? key, 'bodyweight')).toBe(translations['workout.equipment_bodyweight'].el);
  });

  it('normalizes casing and whitespace before looking up the enum', () => {
    expect(equipmentLabel(en, 'Barbell')).toBe('Barbell');
    expect(equipmentLabel(en, ' cable ')).toBe('Cable');
  });

  it('falls back to the no-equipment label for null and to a title-cased raw value for unknown legacy data', () => {
    expect(equipmentLabel(en, null)).toBe(translations['workout.equipment_not_required'].en);
    expect(equipmentLabel(en, undefined)).toBe(translations['workout.equipment_not_required'].en);
    expect(equipmentLabel(en, 'kettlebell')).toBe('Kettlebell');
  });

  it('has a localized value for every equipment key in all eight locales', () => {
    for (const value of WORKOUT_EQUIPMENT_VALUES) {
      const key = `workout.equipment_${value}`;
      expect(translations[key]?.en, key).toMatch(/\S/);
      expect(translations[key]?.es, key).toMatch(/\S/);
      expect(translations[key]?.el, key).toMatch(/\S/);
      for (const [locale, overlay] of Object.entries({ de, fr, it: italian, nl, pt })) {
        expect(overlay[key], `${locale}:${key}`).toMatch(/\S/);
      }
    }
  });
});
