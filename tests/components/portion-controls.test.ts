import { describe, expect, it } from 'vitest';
import {
  getGramsForHumanPortion,
  getHumanPortionAmount,
  getPortionDisplayAmount,
  getPortionSizeOptions,
  isNaturalPortionUnit,
  isPortionClarificationQuestion,
  resolveAmountDraft,
  shouldTreatPortionAsEstimated,
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
});

describe('natural container portions', () => {
  it.each(['bowl', 'BOWLS', 'cup', 'glass', 'plate', 'serving'])('recognizes %s', (unit) => {
    expect(isNaturalPortionUnit(unit)).toBe(true);
  });

  it('displays the parsed ajiaco quantity instead of asking the user for grams', () => {
    expect(getHumanPortionAmount({ grams: 550, quantity: 1 })).toBe(1);
    expect(getHumanPortionAmount({ grams: 770, quantity: 1.4 })).toBe(1.4);
  });

  it('converts an exact bowl draft back to internal grams', () => {
    expect(getGramsForHumanPortion({
      grams: 550,
      quantity: 1,
      humanAmount: 1.25,
    })).toBe(687.5);
  });

  it('falls back safely when the parser quantity is invalid', () => {
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

  it.each(['0', '-2', 'not a number'])('restores the previous amount for %j', (draft) => {
    expect(resolveAmountDraft(draft, 500)).toBe(500);
  });

  it('caps an entered amount at the parser safety limit', () => {
    expect(resolveAmountDraft('20000', 500)).toBe(15_000);
  });
});
