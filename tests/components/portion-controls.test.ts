import { describe, expect, it } from 'vitest';
import {
  getPortionDisplayAmount,
  getPortionSizeOptions,
  isPortionClarificationQuestion,
  resolveAmountDraft,
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
