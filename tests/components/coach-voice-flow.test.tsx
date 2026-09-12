// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { VoiceCapture } from '@/components/assistant/VoiceCapture';
import { VoiceAnswerPlayback } from '@/components/assistant/VoiceAnswerPlayback';
import { VoiceController } from '@/components/assistant/voice-state';
import type { VoiceTranscriptionTransport } from '@/components/assistant/voice-client';
import type { startCoachAudioRecording } from '@/agents/coach-assistant/voice-contract';

let callbacks: Parameters<typeof startCoachAudioRecording>[0];
const scope = { actorId: 'owner', organizationId: 'org', conversationId: 'conversation' };

function successfulTranscript(turnId: string) {
  return { version: 'coach-assistant.voice.v1' as const, ok: true as const, status: 'review_required' as const, scope, turnId,
    transcript: { text: 'Log 140 g', locale: 'en', languages: ['en'], source: 'synthetic_fixture' as const, trust: 'untrusted_transcript' as const },
    review: { token: 'fixture', expiresAt: new Date(Date.now() + 60_000).toISOString(), editable: true as const, audioRetention: 'discarded_after_transcription' as const }, durationMs: 1200 };
}

function fixture(transcribe: VoiceTranscriptionTransport, onSend = vi.fn(async () => 'sent' as const), compact = false) {
  const start = vi.fn((options: typeof callbacks) => { callbacks = options; options.onRequesting(); return { active: true, cancel: vi.fn(), stop: vi.fn() }; });
  const controller = new VoiceController(start, vi.fn());
  function Harness() {
    const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot);
    return <I18nProvider defaultLang="en"><VoiceCapture compact={compact} controller={controller} state={state} disabled={false} conversationId="conversation" transcribe={transcribe} onUse={() => true} onSend={onSend} /></I18nProvider>;
  }
  return { controller, start, onSend, Harness };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:voice');
  URL.revokeObjectURL = vi.fn();
});

it('keeps compact recording, processing, failure, and retry controls in one flowing popover', async () => {
  let reject!: (reason?: unknown) => void;
  const transcribe = vi.fn(() => new Promise<never>((_resolve, fail) => { reject = fail; }));
  const { Harness } = fixture(transcribe, vi.fn(async () => 'sent' as const), true);
  render(<Harness />);
  fireEvent.click(screen.getByLabelText('Voice'));
  fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  act(() => callbacks.onRecording());
  act(() => callbacks.onComplete({ blob: new Blob(['audio']), mimeType: 'audio/webm', durationMs: 1200, reason: 'stopped' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create editable transcript' }));
  const processing = screen.getByText('Preparing an editable transcript…').parentElement;
  const playback = screen.getByLabelText('Play your local recording');
  expect(processing?.parentElement).toBe(playback.parentElement?.parentElement);
  await act(async () => reject(new Error('offline')));
  expect(screen.getByRole('alert').textContent).toMatch(/could not be prepared/i);
  expect(screen.getByRole('button', { name: 'Create editable transcript' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Record again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Discard recording' })).toBeTruthy();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('moves from local recording through processing and editable review to an explicit send', async () => {
  let resolve!: (value: ReturnType<typeof successfulTranscript>) => void;
  const transcribe = vi.fn(() => new Promise<ReturnType<typeof successfulTranscript>>(done => { resolve = done; }));
  const { Harness, onSend } = fixture(transcribe);
  render(<Harness />);
  fireEvent.click(screen.getByText('Voice'));
  fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  act(() => callbacks.onRecording());
  act(() => callbacks.onComplete({ blob: new Blob(['audio'], { type: 'audio/webm' }), mimeType: 'audio/webm', durationMs: 1200, reason: 'stopped' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create editable transcript' }));
  expect(screen.getByText('Preparing an editable transcript…')).toBeTruthy();
  await act(async () => resolve(successfulTranscript('turn')));
  expect(screen.getByText(/does not come from your recording/)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit transcript' }), { target: { value: 'Log 145 g' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reviewed question' }));
  await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ status: 'review_required' }), 'Log 145 g'));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit transcript' })).toBeNull());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice');
});

it('keeps ambiguous numeric text in review and never sends it', async () => {
  const transcribe = vi.fn(async (_recording, metadata) => successfulTranscript(metadata.turnId));
  const { Harness, onSend } = fixture(transcribe);
  render(<Harness />);
  fireEvent.click(screen.getByText('Voice'));
  fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  act(() => callbacks.onRecording());
  act(() => callbacks.onComplete({ blob: new Blob(['audio']), mimeType: 'audio/webm', durationMs: 1200, reason: 'stopped' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create editable transcript' }));
  await screen.findByRole('textbox', { name: 'Edit transcript' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit transcript' }), { target: { value: 'Log 15 or 50 g' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reviewed question' }));
  expect(screen.getByRole('alert').textContent).toMatch(/Check the number/);
  expect(onSend).not.toHaveBeenCalled();
});

it('aborts processing on cancel and offers a fresh recording after review', async () => {
  let processingSignal: AbortSignal | undefined;
  const pending = vi.fn((_recording, _metadata, signal: AbortSignal) => { processingSignal = signal; return new Promise<never>(() => {}); });
  const first = fixture(pending);
  const view = render(<first.Harness />);
  fireEvent.click(screen.getByText('Voice')); fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  act(() => callbacks.onRecording()); act(() => callbacks.onComplete({ blob: new Blob(['audio']), mimeType: 'audio/webm', durationMs: 1200, reason: 'stopped' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create editable transcript' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel voice' }));
  expect(processingSignal?.aborted).toBe(true);
  view.unmount();

  const second = fixture(async (_recording, metadata) => successfulTranscript(metadata.turnId));
  render(<second.Harness />);
  fireEvent.click(screen.getByText('Voice')); fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  act(() => callbacks.onRecording()); act(() => callbacks.onComplete({ blob: new Blob(['audio']), mimeType: 'audio/webm', durationMs: 1200, reason: 'stopped' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create editable transcript' }));
  await screen.findByRole('button', { name: 'Record again' });
  fireEvent.click(screen.getByRole('button', { name: 'Record again' }));
  expect(second.start).toHaveBeenCalledTimes(2);
});

it('never autoplays a validated answer and exposes explicit device play and stop controls', async () => {
  const speak = vi.fn(); const cancel = vi.fn(); const pause = vi.fn(); const resume = vi.fn();
  class Utterance { lang = ''; rate = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak, cancel, pause, resume } });
  render(<I18nProvider defaultLang="en"><VoiceAnswerPlayback text="Validated answer" descriptor={{ status: 'available_on_request', conversationId: 'conversation', turnId: 'turn', textSource: 'validated_final_answer', syntheticVoice: true, autoplay: false, expiresInMs: 60_000, requiresResponseId: true }} /></I18nProvider>);
  const play = await screen.findByRole('button', { name: 'Listen with device voice' });
  expect(speak).not.toHaveBeenCalled();
  fireEvent.click(play);
  expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Validated answer', lang: 'en', rate: 1 }));
  fireEvent.click(screen.getByRole('button', { name: 'Pause voice playback' }));
  expect(pause).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Resume voice playback' }));
  expect(resume).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByRole('combobox', { name: 'Speed' }), { target: { value: '1.5' } });
  expect(screen.getByRole('status').textContent).toMatch(/restart from the beginning/);
  fireEvent.click(screen.getByRole('button', { name: 'Listen with device voice' }));
  expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ rate: 1.5 }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop voice playback' }));
  expect(cancel).toHaveBeenCalled();
});
