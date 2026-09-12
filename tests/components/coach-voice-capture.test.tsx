// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VoiceController } from '@/components/assistant/voice-state';
import { VoiceCapture } from '@/components/assistant/VoiceCapture';
import { I18nProvider } from '@/lib/i18n';
import { startCoachAudioRecording } from '@/agents/coach-assistant/voice-contract';
import { COACH_AUDIO_LIMITS } from '@/agents/coach-assistant/voice-contract';
let callbacks: Parameters<typeof startCoachAudioRecording>[0];
function fixture() {
  const cancel = vi.fn(), stop = vi.fn();
  const start = vi.fn((options: typeof callbacks) => { callbacks = options; options.onRequesting(); return { active: true, cancel, stop }; });
  return { controller: new VoiceController(start), cancel, stop, start };
}
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); URL.createObjectURL = vi.fn(() => 'blob:local-audio'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('shows elapsed recording time and releases the timer on stop or cancellation', () => {
  vi.useFakeTimers();
  const { controller } = fixture();
  function Harness() {
    const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot);
    return <I18nProvider defaultLang="en"><VoiceCapture controller={controller} state={state} disabled={false} /></I18nProvider>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('Voice'));
  fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  act(() => callbacks.onRecording());
  act(() => vi.advanceTimersByTime(3250));
  expect(screen.getByText('Recording · 3 / 30 seconds')).toBeTruthy();
  act(() => controller.stop());
  expect(vi.getTimerCount()).toBe(0);
  act(() => controller.reset());
  act(() => { controller.start(); callbacks.onRecording(); });
  expect(vi.getTimerCount()).toBe(1);
  act(() => controller.reset());
  expect(vi.getTimerCount()).toBe(0);
});
it('captures locally, stops explicitly and revokes playback on reset without network calls', () => {
  const { controller, stop } = fixture();
  controller.start(); callbacks.onRecording(); controller.stop();
  expect(stop).toHaveBeenCalledOnce();
  callbacks.onComplete({ blob: new Blob(['audio'], { type: 'audio/webm' }), mimeType: 'audio/webm', durationMs: 3000, reason: 'stopped' });
  expect(controller.snapshot()).toMatchObject({ phase: 'ready', recording: { durationMs: 3000, url: 'blob:local-audio' } });
  expect(fetch).not.toHaveBeenCalled();
  controller.reset(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-audio');
});
it('cancels permission requests and ignores late completion after reset', () => {
  const { controller, cancel } = fixture(); controller.start(); controller.reset();
  callbacks.onComplete({ blob: new Blob(['late']), mimeType: 'audio/webm', durationMs: 3000, reason: 'stopped' });
  expect(cancel).toHaveBeenCalledOnce(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(controller.snapshot().phase).toBe('idle');
});
it('rejects oversize or invalid-duration recordings before creating playback URLs', () => {
  const { controller } = fixture();
  controller.start(); callbacks.onComplete({ blob: new Blob([new Uint8Array(COACH_AUDIO_LIMITS.fileBytes + 1)]), mimeType: 'audio/webm', durationMs: 1000, reason: 'stopped' });
  expect(controller.snapshot().error).toBe('limit');
  controller.start(); callbacks.onComplete({ blob: new Blob(['audio']), mimeType: 'audio/webm', durationMs: NaN, reason: 'stopped' });
  expect(controller.snapshot().error).toBe('limit'); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('labels local capture honestly and provides permission failure recovery without submitting a message', () => {
  const { controller } = fixture();
  function Harness() {
    const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot);
    return <I18nProvider defaultLang="en"><VoiceCapture controller={controller} state={state} disabled={false} /></I18nProvider>;
  }
  render(<Harness />); fireEvent.click(screen.getByText('Voice'));
  expect(screen.getByText(/Transcription and audio upload are not connected/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  act(() => callbacks.onError('permission-denied'));
  expect(screen.getByText(/Microphone permission was denied/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it('labels governed transcription accurately when a transport is connected', () => {
  const { controller } = fixture();
  const transcribe = vi.fn();
  function Harness() {
    const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot);
    return <I18nProvider defaultLang="en"><VoiceCapture controller={controller} state={state} disabled={false} conversationId={crypto.randomUUID()} transcribe={transcribe} /></I18nProvider>;
  }
  render(<Harness />); fireEvent.click(screen.getByText('Voice'));
  expect(screen.getByText(/Audio is uploaded only when you create the transcript, then discarded/)).toBeTruthy();
  expect(screen.queryByText(/Transcription and audio upload are not connected/)).toBeNull();
  expect(transcribe).not.toHaveBeenCalled();
});
it('stops answer playback before requesting the microphone and again on reset', () => {
  const start = vi.fn((options: typeof callbacks) => { callbacks = options; options.onRequesting(); return { active: true, cancel: vi.fn(), stop: vi.fn() }; });
  const stopPlayback = vi.fn();
  const controller = new VoiceController(start, stopPlayback);
  controller.start();
  expect(stopPlayback).toHaveBeenCalledTimes(1);
  controller.reset();
  expect(stopPlayback).toHaveBeenCalledTimes(2);
});
