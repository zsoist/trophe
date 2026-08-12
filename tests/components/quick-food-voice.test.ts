// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  startAudioRecordingSession: vi.fn(),
  startSpeechRecognitionSession: vi.fn(),
  transcribeRecording: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'whileTap']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div'), p: element('p'), span: element('span') },
    useReducedMotion: () => true,
  };
});

vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span', { 'aria-hidden': true });
  return {
    Barcode: Icon, Camera: Icon, CheckCircle2: Icon, HelpCircle: Icon, Loader2: Icon,
    Mic: Icon, MicOff: Icon, Plus: Icon, RotateCcw: Icon, Send: Icon, X: Icon,
  };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string) => ({
      'food.quick_placeholder': 'What did you eat?',
      'food.voice': 'Voice',
      'food.voice_start_aria': 'Start voice input',
      'food.voice_stop': 'Stop',
      'food.voice_stop_aria': 'Stop voice recording',
      'food.voice_requesting': 'Waiting for microphone permission…',
      'food.listening': 'Listening…',
      'food.voice_transcribing': 'Turning your recording into text…',
      'food.voice_permission_title': 'Microphone access needed',
      'food.voice_permission_denied': 'Microphone access is blocked.',
      'food.voice_permission_desktop': 'Allow the microphone in site settings.',
      'food.voice_permission_retry': 'Try again',
      'food.voice_permission_dismiss_aria': 'Dismiss microphone help',
      'food.voice_recording_failed': 'Could not record audio.',
      'food.voice_transcription_failed': 'Could not transcribe audio.',
    } as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpcClient: { food: { corrections: { captureAdjustment: { mutate: vi.fn() } } } },
}));
vi.mock('@/components/food/ParsedFoodList', () => ({ default: () => null }));
vi.mock('@/components/food/PhotoScanCard', () => ({ default: () => null }));
vi.mock('@/components/food/BarcodeLookupModal', () => ({ default: () => null }));
vi.mock('@/lib/microphone/recording-session', () => ({
  startAudioRecordingSession: mocks.startAudioRecordingSession,
}));
vi.mock('@/lib/microphone/speech-recognition', () => ({
  startSpeechRecognitionSession: mocks.startSpeechRecognitionSession,
}));
vi.mock('@/lib/microphone/transcription-client', () => ({
  transcribeRecording: mocks.transcribeRecording,
  TranscriptionClientError: class extends Error {},
}));

import QuickFoodInput from '@/components/food/QuickFoodInput';

function renderInput() {
  return render(React.createElement(QuickFoodInput, {
    userId: 'user-1',
    mealType: 'breakfast',
    date: '2026-08-12',
    onLogged: vi.fn(),
    onSearchMode: vi.fn(),
  }));
}

describe('QuickFoodInput voice behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    mocks.transcribeRecording.mockResolvedValue({ text: 'two eggs and toast', languages: ['en'] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses recorded fallback when native speech recognition is unavailable', () => {
    mocks.startAudioRecordingSession.mockImplementation(options => {
      options.onRequesting();
      return { active: true, stop: vi.fn(), cancel: vi.fn() };
    });
    renderInput();

    const button = screen.getByRole('button', { name: 'Start voice input' });
    expect(button.className).toContain('min-h-11');
    fireEvent.click(button);

    expect(mocks.startAudioRecordingSession).toHaveBeenCalledOnce();
    expect(screen.getByText('Waiting for microphone permission…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop voice recording' })).toBeTruthy();
  });

  it('stops once, transcribes once, and parses the returned literal transcript', async () => {
    const stop = vi.fn();
    mocks.startAudioRecordingSession.mockImplementation(options => {
      options.onRequesting();
      options.onRecording();
      stop.mockImplementation(() => options.onComplete({
        blob: new Blob(['audio'], { type: 'audio/webm' }),
        durationMs: 8_000,
        mimeType: 'audio/webm',
        reason: 'stopped',
      }));
      return { active: true, stop, cancel: vi.fn() };
    });
    renderInput();
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop voice recording' }));

    await waitFor(() => expect(mocks.transcribeRecording).toHaveBeenCalledOnce());
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/food/parse', expect.objectContaining({
      body: JSON.stringify({ text: 'two eggs and toast', language: 'en' }),
    })));
    expect(stop).toHaveBeenCalledOnce();
  });

  it('shows permission recovery instead of attempting a second capture path', () => {
    (window as Window & { SpeechRecognition?: new () => object }).SpeechRecognition = class {};
    mocks.startSpeechRecognitionSession.mockImplementation(options => {
      options.onError('permission-denied');
      return { active: false, stop: vi.fn(), cancel: vi.fn() };
    });
    renderInput();
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));

    expect(screen.getByText('Microphone access needed')).toBeTruthy();
    expect(screen.getByText('Allow the microphone in site settings.')).toBeTruthy();
    expect(mocks.startAudioRecordingSession).not.toHaveBeenCalled();
  });

  it('falls back after a synchronous native startup failure without losing the recorder session', () => {
    (window as Window & { SpeechRecognition?: new () => object }).SpeechRecognition = class {};
    const cancel = vi.fn();
    mocks.startSpeechRecognitionSession.mockImplementation(options => {
      options.onError('start-failed');
      return { active: false, stop: vi.fn(), cancel: vi.fn() };
    });
    mocks.startAudioRecordingSession.mockImplementation(options => {
      options.onRequesting();
      return { active: true, stop: vi.fn(), cancel };
    });
    const view = renderInput();
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));

    expect(mocks.startAudioRecordingSession).toHaveBeenCalledOnce();
    view.unmount();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels pending permission on unmount without transcribing', () => {
    const cancel = vi.fn();
    mocks.startAudioRecordingSession.mockImplementation(options => {
      options.onRequesting();
      return { active: true, stop: vi.fn(), cancel };
    });
    const view = renderInput();
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    view.unmount();

    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.transcribeRecording).not.toHaveBeenCalled();
  });
});
