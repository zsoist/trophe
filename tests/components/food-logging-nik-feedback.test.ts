import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUserStatedNutrients,
  extractNutrientClaims,
  repairNutrientClaimPortion,
} from '@/agents/food-parse/nutrient-claims';
import {
  normalizeItemsForPortionReview,
  getPortionSizeOptions,
  recalculatePortion,
  resolveAmountDraft,
} from '@/components/food/portion-controls';
import {
  startVoiceSession,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
  type VoiceInputError,
} from '@/components/food/voice-input';

class NikVoiceRecognition implements SpeechRecognitionLike {
  lang = '';
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  abortCalled = false;
  throwOnStart = false;

  start() {
    if (this.throwOnStart) throw new Error('recognition unavailable');
  }

  stop() {}

  abort() {
    this.abortCalled = true;
  }

  say(transcript: string, isFinal = false) {
    this.onresult?.({ results: [{ isFinal, 0: { transcript } }] });
  }
}

describe("Nik's food-logging feedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns an uncertain 500 g ajiaco into practical choices and accepts 700 g', () => {
    expect(getPortionSizeOptions(500)).toEqual([
      { size: 'small', grams: 350 },
      { size: 'medium', grams: 500 },
      { size: 'large', grams: 700 },
    ]);
    expect(resolveAmountDraft('', 500)).toBe(500);
    expect(resolveAmountDraft('700', 500)).toBe(700);
  });

  it('repairs the exact ajiaco bowl payload before the review renders', () => {
    const [ajiaco] = normalizeItemsForPortionReview([{
      food_name: 'ajiaco santafereño',
      grams: 550,
      quantity: 1,
      unit: 'bowl',
      portion_explicit: true,
    }], 'What portion size of ajiaco did you have (for example, a bowl or grams)?');

    expect(ajiaco).toMatchObject({
      grams: 550,
      quantity: 1,
      unit: 'bowl',
      portion_explicit: false,
    });
  });

  it('resolves the ajiaco warning and macros through size and exact-bowl interactions', () => {
    const estimated = {
      food_name: 'ajiaco santafereño',
      grams: 550,
      quantity: 1,
      unit: 'bowl',
      calories: 385,
      protein_g: 24.8,
      carbs_g: 44,
      fat_g: 13.8,
      fiber_g: 7.8,
      sugar_g: 0,
      portion_explicit: false,
      confidence: 0.6,
    };
    const small = recalculatePortion(estimated, 385);
    const exact = recalculatePortion(estimated, 687.5);

    expect(small).toMatchObject({
      grams: 385,
      quantity: 0.7,
      calories: 270,
      portion_explicit: true,
      confidence: 0.8,
    });
    expect(exact).toMatchObject({
      grams: 687.5,
      quantity: 1.25,
      calories: 481,
      portion_explicit: true,
    });
  });

  it('wires natural bowl amounts and resolved clarification state into the review UI', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/food/ParsedFoodList.tsx'),
      'utf8',
    );

    expect(source).toContain('normalizeItemsForPortionReview(');
    expect(source).toContain('canUseNaturalPortionDisplay({');
    expect(source).toContain('getHumanPortionAmount({');
    expect(source).toContain('getGramsForHumanPortion({');
    expect(source).toContain('showClarificationQuestion');
    expect(source).toContain('decimals={natural ? 2 : 0}');
  });

  it('keeps 13 g protein as a label fact while resolving the bar at 60 g', () => {
    const claims = extractNutrientClaims('protein bar with 13 g of protein');
    const repaired = repairNutrientClaimPortion({
      raw_text: 'protein bar with 13 g of protein',
      food_name: 'protein bar',
      quantity: 13,
      unit: 'g',
      portion_explicit: true,
      estimated_grams: 13,
    }, claims);
    const resolved = applyUserStatedNutrients({
      grams: 60,
      calories: 190,
      protein_g: 20,
      carbs_g: 18,
      fat_g: 6,
      fiber_g: 4,
      sugar_g: 3,
    }, claims);

    expect(claims).toEqual({ protein_g: 13 });
    expect(repaired).toMatchObject({ quantity: 1, unit: 'piece', portion_explicit: false });
    expect(resolved).toMatchObject({ grams: 60, protein_g: 13, carbs_g: 18, fat_g: 6 });
  });

  it('uses Nik\'s interim voice text once when Stop receives no browser end event', () => {
    const recognition = new NikVoiceRecognition();
    const completed: string[] = [];
    const errors: VoiceInputError[] = [];
    const session = startVoiceSession({
      recognition,
      language: 'en-US',
      onListening: () => {},
      onTranscript: () => {},
      onComplete: transcript => completed.push(transcript),
      onError: error => errors.push(error),
    });

    recognition.say('what date for the dinner');
    session.stop();
    vi.advanceTimersByTime(1_500);
    recognition.onend?.();

    expect(completed).toEqual(['what date for the dinner']);
    expect(errors).toEqual([]);
    expect(session.active).toBe(false);
  });

  it.each([
    ['start failure', true, 0, 'start-failed'],
    ['silent browser watchdog', false, 30_000, 'timeout'],
  ] as const)('returns to a terminal state after %s', (_name, throwOnStart, elapsed, expectedError) => {
    const recognition = new NikVoiceRecognition();
    recognition.throwOnStart = throwOnStart;
    const errors: VoiceInputError[] = [];
    const session = startVoiceSession({
      recognition,
      language: 'en-US',
      onListening: () => {},
      onTranscript: () => {},
      onComplete: () => {},
      onError: error => errors.push(error),
    });

    vi.advanceTimersByTime(elapsed);

    expect(errors).toEqual([expectedError]);
    expect(session.active).toBe(false);
    expect(recognition.abortCalled).toBe(!throwOnStart);
  });
});
