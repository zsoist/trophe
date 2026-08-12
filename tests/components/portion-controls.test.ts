import { describe, expect, it } from 'vitest';
import {
  canUseNaturalPortionDisplay,
  getGramsForHumanPortion,
  getHumanPortionAmount,
  formatNaturalPortionUnit,
  getPortionDisplayAmount,
  getPortionSizeOptions,
  isNaturalPortionUnit,
  isPortionClarificationQuestion,
  getNaturalPortionUnitTranslationKey,
  resolveAmountDraft,
  shouldTreatPortionAsEstimated,
  shouldShowGlobalClarification,
} from '@/components/food/portion-controls';

describe('portion size choices', () => {
  it('derives practical choices from the food-specific estimate', () => {
    expect(getPortionSizeOptions(500)).toEqual([
      { size: 'small', grams: 350 },
      { size: 'medium', grams: 500 },
      { size: 'large', grams: 700 },
    ]);
  });

  it('keeps choices positive and inside the parser portion limit', () => {
    expect(getPortionSizeOptions(0)).toEqual([
      { size: 'small', grams: 1 },
      { size: 'medium', grams: 1 },
      { size: 'large', grams: 1 },
    ]);
    expect(getPortionSizeOptions(20_000)[2].grams).toBe(15_000);
  });

  it('converts gram options back to the original volume unit', () => {
    expect(getPortionDisplayAmount(182, 1.04)).toBe(175);
    expect(getPortionDisplayAmount(700, 1_000)).toBe(0.7);
  });
});

describe('portion clarification questions', () => {
  it.each([
    'How much did you eat? Please provide grams or a measurable portion size.',
    '¿Qué cantidad comiste?',
    'Πόση ποσότητα έφαγες;',
  ])('recognizes a portion question: %s', (question) => {
    expect(isPortionClarificationQuestion(question)).toBe(true);
  });

  it('does not offer sizes for a food identity question', () => {
    expect(isPortionClarificationQuestion('Did you mean chicken breast or whole chicken?')).toBe(false);
  });

  it('treats the contradictory single-item ajiaco payload as estimated', () => {
    expect(shouldTreatPortionAsEstimated({
      portionExplicit: true,
      itemCount: 1,
      clarificationQuestion: 'What portion size of ajiaco did you have (for example, a bowl or grams)?',
    })).toBe(true);
  });

  it('does not spread a generic portion question across explicit multi-item meals', () => {
    expect(shouldTreatPortionAsEstimated({
      portionExplicit: true,
      itemCount: 2,
      clarificationQuestion: 'What portion size did you have?',
    })).toBe(false);
  });

  it('keeps multi-item portion questions in the answerable global clarification flow', () => {
    const question = 'What portion size did you have?';
    expect(shouldShowGlobalClarification({ clarificationQuestion: question, itemCount: 1 })).toBe(false);
    expect(shouldShowGlobalClarification({ clarificationQuestion: question, itemCount: 2 })).toBe(true);
    expect(shouldShowGlobalClarification({
      clarificationQuestion: 'Was that chicken breast or thigh?',
      itemCount: 1,
    })).toBe(true);
  });
});

describe('natural container portions', () => {
  it.each(['bowl', 'BOWLS', 'cup', 'glass', 'plate', 'serving'])('recognizes %s', (unit) => {
    expect(isNaturalPortionUnit(unit)).toBe(true);
  });

  it('displays the parsed ajiaco quantity instead of asking the user for grams', () => {
    expect(canUseNaturalPortionDisplay({ unit: 'bowl', grams: 550, quantity: 1 })).toBe(true);
    expect(getHumanPortionAmount({ grams: 550, quantity: 1 })).toBe(1);
    expect(getHumanPortionAmount({ grams: 770, quantity: 1.4 })).toBe(1.4);
    expect(getHumanPortionAmount({ grams: 687.5, quantity: 1.25 })).toBe(1.25);
  });

  it('converts an exact bowl draft back to internal grams', () => {
    expect(getGramsForHumanPortion({
      grams: 550,
      quantity: 1,
      humanAmount: 1.25,
    })).toBe(687.5);
  });

  it('pluralizes the common English container label for decimal portions', () => {
    expect(formatNaturalPortionUnit('bowl', 1)).toBe('bowl');
    expect(formatNaturalPortionUnit('bowl', 0.7)).toBe('bowls');
    expect(formatNaturalPortionUnit('cup', 1.4)).toBe('cups');
  });

  it('maps canonical and localized container aliases to translation keys', () => {
    expect(getNaturalPortionUnitTranslationKey('bowl', 1)).toBe('food.unit.bowl_one');
    expect(getNaturalPortionUnitTranslationKey('μπολ', 1.25)).toBe('food.unit.bowl_other');
    expect(getNaturalPortionUnitTranslationKey('tazas', 1)).toBe('food.unit.cup_one');
    expect(getNaturalPortionUnitTranslationKey('g', 1)).toBeNull();
  });

  it('falls back safely when the parser quantity is invalid', () => {
    expect(canUseNaturalPortionDisplay({ unit: 'bowl', grams: 550, quantity: 0 })).toBe(false);
    expect(canUseNaturalPortionDisplay({ unit: 'g', grams: 550, quantity: 1 })).toBe(false);
    expect(getHumanPortionAmount({ grams: 550, quantity: 0 })).toBe(550);
    expect(getGramsForHumanPortion({ grams: 550, quantity: 0, humanAmount: 1.25 })).toBe(1.25);
  });
});

describe('amount editing drafts', () => {
  it('does not coerce an empty editing draft to one', () => {
    expect(resolveAmountDraft('', 500)).toBe(500);
  });

  it('commits a replacement value such as 700', () => {
    expect(resolveAmountDraft('700', 500)).toBe(700);
  });

  it('commits a fractional natural portion without coercing it to one', () => {
    expect(resolveAmountDraft('0.75', 1, { min: 0.01, max: 27.27 })).toBe(0.75);
  });

  it.each(['0', '-2', 'not a number'])('restores the previous amount for %j', (draft) => {
    expect(resolveAmountDraft(draft, 500)).toBe(500);
  });

  it('caps an entered amount at the parser safety limit', () => {
    expect(resolveAmountDraft('20000', 500)).toBe(15_000);
  });
});
