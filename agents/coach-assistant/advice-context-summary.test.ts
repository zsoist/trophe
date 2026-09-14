import { describe, expect, it } from 'vitest';
import { renderAdviceContextSummary } from './advice-context-summary';
import type { CoachEvidence, CoachWindow } from './contracts';

const DAY: CoachWindow = { start: '2026-09-13', end: '2026-09-13', days: 1, timezone: 'America/Bogota' };
const WEEK: CoachWindow = { start: '2026-09-07', end: '2026-09-13', days: 7, timezone: 'America/Bogota' };
const FOREIGN: CoachWindow = { start: '2026-09-01', end: '2026-09-01', days: 1, timezone: 'America/Bogota' };

function ev(partial: Partial<CoachEvidence> & { id: string; value: number | string }): CoachEvidence {
  return { source: 'nutrition', sourceIds: ['subject'], statement: 'fixture', unit: null, completeness: 'complete', window: DAY, ...partial };
}
const calories = (value: number | string, extra: Partial<CoachEvidence> = {}) => ev({ id: 'nutrition.calories', value, unit: 'kcal', ...extra });
const protein = (value: number | string, extra: Partial<CoachEvidence> = {}) => ev({ id: 'nutrition.protein', value, unit: 'g protein', ...extra });
const targetCalories = (value: number | string, extra: Partial<CoachEvidence> = {}) => ev({ id: 'nutrition.target.calories', value, unit: 'kcal', ...extra });
const targetProtein = (value: number | string, extra: Partial<CoachEvidence> = {}) => ev({ id: 'nutrition.target.proteinG', value, unit: 'g protein', ...extra });

describe('renderAdviceContextSummary', () => {
  it('empty evidence gives honest absent copy and no refs', () => {
    expect(renderAdviceContextSummary([], DAY, 'es')).toEqual({ text: 'No hay objetivos guardados ni totales registrados disponibles para este resumen.', evidenceRefs: [] });
  });

  it('shows stored targets when no registered totals exist', () => {
    // Illustrative stored 2695/94 fixture carried from QA; not a real account claim.
    const result = renderAdviceContextSummary([targetCalories(2695), targetProtein(94)], DAY, 'en');
    expect(result.text).toBe('Stored daily target: 2695 kcal.\nStored daily target: 94 g protein.');
    expect(result.evidenceRefs).toEqual(['nutrition.target.calories', 'nutrition.target.proteinG']);
    expect(result.text).not.toContain('remaining');
  });

  it('shows registered single-day totals without a fabricated target', () => {
    const result = renderAdviceContextSummary([calories(2695), protein(94)], DAY, 'en');
    expect(result.text).toBe('Registered for 2026-09-13: 2695 kcal.\nRegistered for 2026-09-13: 94 g protein.');
    expect(result.evidenceRefs).toEqual(['nutrition.calories', 'nutrition.protein']);
  });

  it('computes remaining against registered with the stored target', () => {
    const result = renderAdviceContextSummary([targetCalories(2695), targetProtein(94), calories(2100), protein(60)], DAY, 'en');
    expect(result.text).toContain('Stored daily target 2695 kcal, 2100 kcal registered for 2026-09-13: 595 kcal remaining against recorded totals.');
    expect(result.text).toContain('Stored daily target 94 g protein, 60 g protein registered for 2026-09-13: 34 g protein remaining against recorded totals.');
    expect(result.evidenceRefs).toEqual(['nutrition.target.calories', 'nutrition.calories', 'nutrition.target.proteinG', 'nutrition.protein']);
  });

  it('says exceed, never negative remaining, when registered is above target', () => {
    const result = renderAdviceContextSummary([targetCalories(2000), calories(2450)], DAY, 'es');
    expect(result.text).toContain('450 kcal por encima del objetivo');
    expect(result.text).not.toContain('quedan -');
    expect(result.text).not.toContain('-450');
  });

  it('adds a partial-record qualifier only for partial registered evidence', () => {
    const partial = renderAdviceContextSummary([targetCalories(2000), calories(1500, { completeness: 'partial' })], DAY, 'en');
    expect(partial.text).toContain('500 kcal remaining against recorded totals (partial records).');
    const complete = renderAdviceContextSummary([targetCalories(2000), calories(1500)], DAY, 'en');
    expect(complete.text).not.toContain('partial');
  });

  it('keeps a valid zero registered value distinct from missing data', () => {
    const zero = renderAdviceContextSummary([targetCalories(2000), calories(0)], DAY, 'en');
    expect(zero.text).toContain('Stored daily target 2000 kcal, 0 kcal registered for 2026-09-13: 2000 kcal remaining against recorded totals.');
    expect(zero.evidenceRefs).toContain('nutrition.calories');
    const missing = renderAdviceContextSummary([targetCalories(2000)], DAY, 'en');
    expect(missing.text).toBe('Stored daily target: 2000 kcal.');
    expect(missing.evidenceRefs).toEqual(['nutrition.target.calories']);
  });

  it('does not subtract weekly totals, but still reports the matching period', () => {
    const weekly = renderAdviceContextSummary([targetCalories(2000, { window: WEEK }), calories(1500, { window: WEEK })], WEEK, 'en');
    expect(weekly.text).toContain('Stored daily target: 2000 kcal.');
    expect(weekly.text).toContain('Registered from 2026-09-07 to 2026-09-13 (7 days): 1500 kcal.');
    expect(weekly.text).not.toContain('remaining');
    expect(weekly.evidenceRefs).toEqual(['nutrition.target.calories', 'nutrition.calories']);
    const foreign = renderAdviceContextSummary([targetCalories(2000), calories(1500, { window: FOREIGN })], DAY, 'en');
    expect(foreign.text).toBe('Stored daily target: 2000 kcal.');
    expect(foreign.text).not.toContain('1500');
  });

  it('excludes negative, nonfinite, wrong-unit and non-numeric facts', () => {
    const result = renderAdviceContextSummary([
      targetCalories(2000),
      calories(Number.NaN),
      calories(-5),
      calories('1200'),
      protein(50, { unit: 'kcal' }),
    ], DAY, 'en');
    expect(result.text).toBe('Stored daily target: 2000 kcal.');
    expect(result.evidenceRefs).toEqual(['nutrition.target.calories']);
  });

  it('refuses subtraction on duplicate conflicting registered evidence', () => {
    const result = renderAdviceContextSummary([targetCalories(2000), calories(1500), calories(1800)], DAY, 'en');
    expect(result.text).toBe('Stored daily target: 2000 kcal.');
    expect(result.text).not.toContain('remaining');
    expect(result.text).not.toContain('1500');
    expect(result.text).not.toContain('1800');
  });

  it('renders ES, EN and EL localized copy', () => {
    const es = renderAdviceContextSummary([targetCalories(2000), calories(1500)], DAY, 'es-MX');
    expect(es.text).toBe('Objetivo diario guardado 2000 kcal; 1500 kcal registradas el 2026-09-13: quedan 500 kcal frente a lo registrado.');
    const en = renderAdviceContextSummary([targetCalories(2000), calories(1500)], DAY, 'en');
    expect(en.text).toContain('remaining against recorded totals');
    const el = renderAdviceContextSummary([targetCalories(2000), calories(1500)], DAY, 'el');
    expect(el.text).toContain('υπολείπονται 500 kcal σε σχέση με τα καταγεγραμμένα');
  });

  it('never claims a meal was saved or infers consumption', () => {
    const result = renderAdviceContextSummary([targetCalories(2000), calories(1500)], DAY, 'en');
    expect(result.text.toLowerCase()).not.toContain('saved');
    expect(result.text.toLowerCase()).not.toContain('consumed');
  });
});


it('retains partial completeness for same-value duplicates and standalone totals', () => {
  const facts = [targetCalories(2000), calories(1500), calories(1500, { completeness: 'partial' })];
  expect(renderAdviceContextSummary(facts, DAY, 'en').text).toContain('(partial records)');
  expect(renderAdviceContextSummary([...facts].reverse(), DAY, 'en').text).toContain('(partial records)');
  expect(renderAdviceContextSummary([calories(1500, { completeness: 'partial' })], DAY, 'en').text).toContain('(partial records)');
});

describe('period coverage and partial qualifier placement', () => {
  it('reports a multi-day recorded total without claiming a daily balance', () => {
    const week = renderAdviceContextSummary([calories(4200, { window: WEEK })], WEEK, 'en');
    expect(week.text).toBe('Registered from 2026-09-07 to 2026-09-13 (7 days): 4200 kcal.');
    expect(week.text).not.toContain('No stored targets');
    expect(week.evidenceRefs).toEqual(['nutrition.calories']);
    const foreign = renderAdviceContextSummary([calories(4200, { window: FOREIGN })], WEEK, 'en');
    expect(foreign.text).toBe('No stored targets or registered totals are available for this summary.');
    expect(foreign.text).not.toContain('4200');
  });

  it('localizes period totals and keeps partial qualifiers inside the sentence', () => {
    expect(renderAdviceContextSummary([calories(4200, { window: WEEK })], WEEK, 'es-MX').text)
      .toBe('Registrados del 2026-09-07 al 2026-09-13 (7 días): 4200 kcal.');
    expect(renderAdviceContextSummary([protein(300, { window: WEEK })], WEEK, 'el').text)
      .toBe('Καταγεγραμμένα από 2026-09-07 έως 2026-09-13 (7 ημέρες): 300 g πρωτεΐνης.');
    expect(renderAdviceContextSummary([calories(4200, { window: WEEK, completeness: 'partial' })], WEEK, 'en').text)
      .toBe('Registered from 2026-09-07 to 2026-09-13 (7 days): 4200 kcal (partial records).');
    expect(renderAdviceContextSummary([calories(1500, { completeness: 'partial' })], DAY, 'en').text)
      .toBe('Registered for 2026-09-13: 1500 kcal (partial records).');
  });
});

it('rejects foreign-source, empty-source and arithmetic-overflow facts', () => {
  const result=renderAdviceContextSummary([targetCalories(2000), calories(1500,{source:'workout'}), calories(1500,{sourceIds:[]}), protein(Number.MAX_VALUE)], DAY, 'en');
  expect(result.text).toBe('Stored daily target: 2000 kcal.');
  expect(result.evidenceRefs).toEqual(['nutrition.target.calories']);
});
