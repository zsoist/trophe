import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUserStatedNutrients,
  extractNutrientClaims,
  repairNutrientClaimPortion,
} from '@/agents/food-parse/nutrient-claims';
import {
  getPortionSizeOptions,
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
