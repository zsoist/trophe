import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startVoiceSession,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
  type VoiceInputError,
} from '@/components/food/voice-input';

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  handlersAttachedAtStart = false;
  stopCalled = false;
  abortCalled = false;
  startError: Error | null = null;

  start() {
    this.handlersAttachedAtStart = Boolean(this.onresult && this.onerror && this.onend);
    if (this.startError) throw this.startError;
  }

  stop() {
    this.stopCalled = true;
  }

  abort() {
    this.abortCalled = true;
  }

  emitResult(parts: Array<{ transcript: string; isFinal: boolean }>) {
    this.onresult?.({
      results: parts.map(part => ({
        isFinal: part.isFinal,
        0: { transcript: part.transcript },
      })),
    });
  }

  emitError(error: string) {
    this.onerror?.({ error });
  }

  emitEnd() {
    this.onend?.();
  }
}

function makeCallbacks() {
  const completions: string[] = [];
  const errors: VoiceInputError[] = [];
  const transcripts: string[] = [];
  let listening = 0;
  return {
    completions,
    errors,
    transcripts,
    get listening() { return listening; },
    callbacks: {
      onListening: () => { listening += 1; },
      onTranscript: (value: string) => { transcripts.push(value); },
      onComplete: (value: string) => { completions.push(value); },
      onError: (error: VoiceInputError) => { errors.push(error); },
    },
  };
}

describe('voice input session', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('attaches handlers before start and completes exactly once with final speech', () => {
    const recognition = new FakeRecognition();
    const state = makeCallbacks();
    const session = startVoiceSession({ recognition, language: 'en-US', ...state.callbacks });

    expect(recognition.handlersAttachedAtStart).toBe(true);
    expect(state.listening).toBe(1);
    recognition.emitResult([{ transcript: 'ajiaco for dinner', isFinal: true }]);
    recognition.emitEnd();
    recognition.emitEnd();

    expect(state.completions).toEqual(['ajiaco for dinner']);
    expect(state.errors).toEqual([]);
    expect(session.active).toBe(false);
  });

  it('manual stop preserves interim speech if the browser never sends an end event', () => {
    const recognition = new FakeRecognition();
    const state = makeCallbacks();
    const session = startVoiceSession({ recognition, language: 'en-US', ...state.callbacks });

    recognition.emitResult([{ transcript: 'protein bar with thirteen grams protein', isFinal: false }]);
    session.stop();
    vi.advanceTimersByTime(1_500);

    expect(recognition.stopCalled).toBe(true);
    expect(state.completions).toEqual(['protein bar with thirteen grams protein']);
    expect(state.errors).toEqual([]);
  });

  it('recovers when recognition start throws synchronously', () => {
    const recognition = new FakeRecognition();
    recognition.startError = new Error('already started');
    const state = makeCallbacks();
    const session = startVoiceSession({ recognition, language: 'en-US', ...state.callbacks });

    expect(state.listening).toBe(0);
    expect(state.errors).toEqual(['start-failed']);
    expect(session.active).toBe(false);
  });

  it('maps browser permission denial to an actionable terminal error', () => {
    const recognition = new FakeRecognition();
    const state = makeCallbacks();
    const session = startVoiceSession({ recognition, language: 'en-US', ...state.callbacks });

    recognition.emitError('not-allowed');
    recognition.emitEnd();

    expect(state.errors).toEqual(['permission-denied']);
    expect(state.completions).toEqual([]);
    expect(session.active).toBe(false);
  });

  it('aborts and recovers when the browser emits nothing for thirty seconds', () => {
    const recognition = new FakeRecognition();
    const state = makeCallbacks();
    const session = startVoiceSession({ recognition, language: 'en-US', ...state.callbacks });

    vi.advanceTimersByTime(30_000);

    expect(recognition.abortCalled).toBe(true);
    expect(state.errors).toEqual(['timeout']);
    expect(state.completions).toEqual([]);
    expect(session.active).toBe(false);
  });

  it('ignores late duplicate events after a terminal error', () => {
    const recognition = new FakeRecognition();
    const state = makeCallbacks();
    startVoiceSession({ recognition, language: 'en-US', ...state.callbacks });

    recognition.emitError('network');
    recognition.emitResult([{ transcript: 'late speech', isFinal: true }]);
    recognition.emitEnd();
    vi.advanceTimersByTime(30_000);

    expect(state.errors).toEqual(['network']);
    expect(state.completions).toEqual([]);
  });
});
