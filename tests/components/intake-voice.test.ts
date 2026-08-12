// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioRecordingResult } from '@/lib/microphone/recording-session';

type NativeVoiceOptions = {
  onListening: () => void;
  onTranscript: (transcript: string) => void;
  onComplete: (transcript: string) => void;
  onError: (error: string) => void;
};

type RecordedVoiceOptions = {
  onRequesting: () => void;
  onRecording: () => void;
  onComplete: (result: AudioRecordingResult) => void;
};

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  startAudioRecordingSession: vi.fn(),
  startSpeechRecognitionSession: vi.fn(),
  transcribeRecording: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'custom', 'exit', 'initial', 'transition', 'whileTap']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))), ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div') },
  };
});
vi.mock('@/components/ui', () => ({ Icon: () => React.createElement('span', { 'aria-hidden': true }) }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string) => ({
      'intake.voice_answer': 'Answer by voice',
      'intake.voice_stop': 'Stop',
      'intake.voice_start_aria': 'Answer this question by voice',
      'intake.voice_stop_aria': 'Stop voice answer',
      'intake.voice_requesting': 'Waiting for microphone permission…',
      'intake.voice_listening': 'Listening… speak naturally',
      'intake.voice_transcribing': 'Turning your answer into text…',
      'intake.voice_failed': 'Voice answer failed. Please try again.',
    } as Record<string, string>)[key] ?? key,
  }),
}));

const questions = [
  { id: 'sleep', position: 1, prompt: 'How is your sleep?', kind: 'text', required: false },
  { id: 'stress', position: 2, prompt: 'How is your stress?', kind: 'text', required: false },
];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn((table: string) => {
      if (table === 'client_profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { coach_id: 'coach-1' } }) }) }) };
      }
      if (table === 'questionnaire_questions') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: questions }) }) }) };
      }
      if (table === 'questionnaire_responses') {
        const builder = {
          eq: () => builder,
          maybeSingle: async () => ({ data: null }),
          upsert: async () => ({ error: null }),
        };
        return { select: () => builder, upsert: builder.upsert };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'Nick Coach' } }) }) }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));
vi.mock('@/lib/microphone/recording-session', () => ({
  startAudioRecordingSession: mocks.startAudioRecordingSession,
}));
vi.mock('@/lib/microphone/speech-recognition', () => ({
  startSpeechRecognitionSession: mocks.startSpeechRecognitionSession,
}));
vi.mock('@/lib/microphone/transcription-client', () => ({
  transcribeRecording: mocks.transcribeRecording,
}));

import IntakeWizard from '@/app/dashboard/intake/page';

async function openFirstQuestion() {
  const view = render(React.createElement(IntakeWizard));
  fireEvent.click(await screen.findByRole('button', { name: 'Let’s begin' }));
  await screen.findByText('How is your sleep?');
  return view;
}

describe('intake voice answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as Window & { SpeechRecognition?: new () => object }).SpeechRecognition = class {};
    delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    mocks.transcribeRecording.mockResolvedValue({ text: 'after late training', languages: ['en'] });
  });

  afterEach(() => cleanup());

  it('appends native interim and final speech without duplicating or erasing typed text', async () => {
    let options: NativeVoiceOptions | undefined;
    mocks.startSpeechRecognitionSession.mockImplementation(input => {
      options = input as NativeVoiceOptions;
      input.onListening();
      return { active: true, stop: vi.fn(), cancel: vi.fn() };
    });
    await openFirstQuestion();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'I sleep poorly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer this question by voice' }));
    options?.onTranscript('after late training');
    await waitFor(() => expect(textarea.value).toBe('I sleep poorly after late training'));
    options?.onComplete('after late training');
    await waitFor(() => expect(textarea.value).toBe('I sleep poorly after late training'));
  });

  it('uses recorded fallback and retains typed text while transcription is pending', async () => {
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    let recordingOptions: RecordedVoiceOptions | undefined;
    mocks.startAudioRecordingSession.mockImplementation(input => {
      recordingOptions = input as RecordedVoiceOptions;
      input.onRequesting();
      input.onRecording();
      return { active: true, stop: vi.fn(), cancel: vi.fn() };
    });
    await openFirstQuestion();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'I sleep poorly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer this question by voice' }));
    recordingOptions?.onComplete({
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      durationMs: 4_000,
      mimeType: 'audio/webm',
      reason: 'stopped',
    });

    expect(textarea.value).toBe('I sleep poorly');
    await waitFor(() => expect(textarea.value).toBe('I sleep poorly after late training'));
    expect(mocks.transcribeRecording).toHaveBeenCalledOnce();
  });

  it('cancels active media before moving to another question', async () => {
    const cancel = vi.fn();
    mocks.startSpeechRecognitionSession.mockImplementation(input => {
      input.onListening();
      return { active: true, stop: vi.fn(), cancel };
    });
    await openFirstQuestion();
    fireEvent.click(screen.getByRole('button', { name: 'Answer this question by voice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('How is your stress?');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels pending permission on unmount without uploading', async () => {
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    const cancel = vi.fn();
    mocks.startAudioRecordingSession.mockImplementation(input => {
      input.onRequesting();
      return { active: true, stop: vi.fn(), cancel };
    });
    const view = await openFirstQuestion();
    fireEvent.click(screen.getByRole('button', { name: 'Answer this question by voice' }));
    view.unmount();

    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.transcribeRecording).not.toHaveBeenCalled();
  });
});
