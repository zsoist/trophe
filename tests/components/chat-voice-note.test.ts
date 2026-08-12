// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioRecordingResult } from '@/lib/microphone/recording-session';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  startAudioRecordingSession: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'transition']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))), ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: element('div'), img: element('img'), span: element('span') },
    useReducedMotion: () => true,
  };
});
vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span', { 'aria-hidden': true });
  return { Mic: Icon, Paperclip: Icon, Pause: Icon, Play: Icon, Square: Icon, X: Icon };
});
vi.mock('@/components/ui', () => ({ Icon: () => React.createElement('span', { 'aria-hidden': true }) }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'chat.loading': 'Loading…',
      'chat.empty': 'No messages yet',
      'chat.record_voice': 'Record voice note',
      'chat.recording': 'Recording',
      'chat.requesting_mic': 'Waiting for microphone permission…',
      'chat.stop_recording': 'Stop and attach',
      'chat.voice_ready': 'Voice note ready to send',
      'chat.remove_attachment': 'Remove attachment',
      'chat.send': 'Send message',
      'chat.attach_photo': 'Attach photo',
      'chat.placeholder': 'Message…',
      'chat.mic_denied': 'Microphone unavailable — check permissions',
      'chat.record_failed': 'Could not record voice note',
      'chat.no_audio': 'No audio was captured',
      'chat.recording_limit': 'Five-minute limit reached',
      'general.cancel': 'Cancel',
    } as Record<string, string>)[key] ?? key,
  }),
}));
vi.mock('@/lib/microphone/recording-session', () => ({
  startAudioRecordingSession: mocks.startAudioRecordingSession,
}));

vi.mock('@/lib/supabase', () => {
  const messageRow = {
    id: 'message-1', sender_role: 'client', body: '', read_at: null,
    created_at: '2026-08-12T12:00:00.000Z', attachment_path: 'voice.webm',
    attachment_type: 'audio', attachment_meta: { duration_s: 4 },
  };
  const messages = {
    select: () => {
      const query = {
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: [] }),
      };
      return query;
    },
    update: () => {
      const query = { eq: () => query, is: async () => ({ error: null }) };
      return query;
    },
    insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: messageRow, error: null }) }) }),
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: () => messages,
      channel: () => channel,
      removeChannel: vi.fn(),
      storage: {
        from: () => ({
          upload: mocks.upload,
          remove: vi.fn().mockResolvedValue({ error: null }),
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/voice' } }),
        }),
      },
    },
  };
});

import ChatThread from '@/components/shared/ChatThread';

type RecorderCallbacks = {
  onRequesting: () => void;
  onRecording: () => void;
  onComplete: (result: AudioRecordingResult) => void;
  onError: (error: string) => void;
  maxDurationMs: number;
};

function renderThread() {
  return render(React.createElement(ChatThread, {
    coachId: 'coach-1', clientId: 'client-1', viewerRole: 'client',
  }));
}

describe('chat voice notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:voice-note'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('attaches one local note on Stop and does not upload before Send', async () => {
    let callbacks: RecorderCallbacks | undefined;
    const stop = vi.fn();
    mocks.startAudioRecordingSession.mockImplementation(input => {
      callbacks = input as RecorderCallbacks;
      input.onRequesting();
      input.onRecording();
      stop.mockImplementation(() => input.onComplete({
        blob: new Blob(['recorded voice'.repeat(20)], { type: 'audio/webm;codecs=opus' }),
        durationMs: 4_200,
        mimeType: 'audio/webm;codecs=opus',
        reason: 'stopped',
      }));
      return { active: true, stop, cancel: vi.fn() };
    });
    renderThread();
    await screen.findByText('No messages yet');
    fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));

    expect(callbacks?.maxDurationMs).toBe(300_000);
    fireEvent.click(screen.getByRole('button', { name: 'Stop and attach' }));
    await screen.findByText('Voice note ready to send');
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.upload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
  });

  it('discards on Cancel and cancels pending permission on unmount', async () => {
    const cancel = vi.fn();
    mocks.startAudioRecordingSession.mockImplementation(input => {
      input.onRequesting();
      return { active: true, stop: vi.fn(), cancel };
    });
    const view = renderThread();
    await screen.findByText('No messages yet');
    fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
    expect(screen.getByText('Waiting for microphone permission…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(screen.queryByText('Voice note ready to send')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
    view.unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('attaches the shared lifecycle five-minute completion and reports its limit', async () => {
    let callbacks: RecorderCallbacks | undefined;
    mocks.startAudioRecordingSession.mockImplementation(input => {
      callbacks = input as RecorderCallbacks;
      input.onRecording();
      return { active: true, stop: vi.fn(), cancel: vi.fn() };
    });
    renderThread();
    await screen.findByText('No messages yet');
    fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
    callbacks?.onComplete({
      blob: new Blob(['recorded voice'.repeat(20)], { type: 'audio/mp4' }),
      durationMs: 300_000,
      mimeType: 'audio/mp4',
      reason: 'limit',
    });

    await screen.findByText('Voice note ready to send');
    expect(screen.getByText('Five-minute limit reached')).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('shows a localized permission error and returns to an idle recorder button', async () => {
    mocks.startAudioRecordingSession.mockImplementation(input => {
      input.onRequesting();
      input.onError('permission-denied');
      return { active: false, stop: vi.fn(), cancel: vi.fn() };
    });
    renderThread();
    await screen.findByText('No messages yet');
    fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));

    expect(screen.getByText('Microphone unavailable — check permissions')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeTruthy();
  });
});
