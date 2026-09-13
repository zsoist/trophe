// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { globalCoachTranslations } from '@/lib/locales/global-coach';

vi.mock('@/components/assistant/useGlobalCoachI18n', () => ({
  useGlobalCoachI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let text = globalCoachTranslations[key]?.en ?? key;
      if (values) for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value));
      return text;
    },
  }),
}));

const ports = vi.hoisted(() => ({ make: vi.fn(), dispose: vi.fn(), start: vi.fn(), stop: vi.fn(), mute: vi.fn(), subscribe: vi.fn(() => () => {}) }));
vi.mock('@/lib/voice-live/browser-session', () => ({ createBrowserLiveSession: ports.make }));

import { LiveVoiceControl, mergeVoiceTurns, voiceRowVisible, type VoiceChatEntry } from '@/components/assistant/LiveVoiceControl';
import type { LiveTranscriptRow } from '@/lib/voice-live/client-types';

const t = (key: string, values?: Record<string, string | number>) => {
  let text = globalCoachTranslations[key]?.en ?? key;
  if (values) for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value));
  return text;
};

const openRail = async (snapshot: Record<string, unknown>, extra: Record<string, unknown> = {}, onTranscript?: (row: LiveTranscriptRow) => void) => {
  ports.make.mockReturnValue({
    dispose: ports.dispose,
    controller: { snapshot: () => snapshot, subscribe: ports.subscribe, startFromGesture: ports.start, stop: ports.stop, ...extra },
  });
  const view = render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} onTranscript={onTranscript} />);
  fireEvent.click(await screen.findByRole('button', { name: t('global_coach.live_title') }));
  await screen.findByRole('button', { name: t(snapshot.phase === 'live' ? 'global_coach.live_end' : 'global_coach.live_start') });
  return view;
};

beforeEach(() => {
  vi.clearAllMocks();
  ports.subscribe.mockReturnValue(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

it('streams live transcript turns into the single chat history instead of printing them in the rail', async () => {
  const row: LiveTranscriptRow = { speaker: 'user', text: 'two eggs and toast', startMs: 0, endMs: 800 };
  const onTranscript = vi.fn();
  const snapshot = { phase: 'idle', transcript: [row] };
  ports.make.mockReturnValue({ dispose: ports.dispose, controller: { snapshot: () => snapshot, subscribe: ports.subscribe, startFromGesture: ports.start, stop: ports.stop } });
  render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} onTranscript={onTranscript} />);
  fireEvent.click(await screen.findByRole('button', { name: t('global_coach.live_title') }));
  await screen.findByRole('button', { name: t('global_coach.live_start') });
  expect(onTranscript).toHaveBeenCalledTimes(1);
  expect(onTranscript).toHaveBeenCalledWith({ ...row, id: 'pending:user:0:800' });
  // The rail must not duplicate the transcript over the thread.
  expect(screen.queryByText('two eggs and toast')).toBeNull();
});

it('never autoplays remote audio before an explicit start gesture', async () => {
  const view = await openRail({ phase: 'idle', transcript: [] });
  const audio = view.container.querySelector('audio');
  expect(audio).not.toBeNull();
  expect(audio!.hasAttribute('autoplay')).toBe(false);
});

it('counts down from the admitted server deadline and shows no count when no deadline is admitted', async () => {
  await openRail({ phase: 'live', admittedDeadlineMs: Date.now() + 120_000, transcript: [] });
  expect(await screen.findByText('120s left')).toBeTruthy();
  cleanup();
  await openRail({ phase: 'live', transcript: [] });
  expect(screen.queryByText(/s left$/)).toBeNull();
});

it('keeps microphone mute separate from pausing output and ending the conversation', async () => {
  const snapshot: Record<string, unknown> = { phase: 'live', canInterrupt: true, transcript: [] };
  ports.make.mockReturnValue({ dispose: ports.dispose, controller: { snapshot: () => snapshot, subscribe: ports.subscribe, startFromGesture: ports.start, stop: ports.stop, interrupt: vi.fn(), setMicrophoneMuted: ports.mute } });
  render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  fireEvent.click(await screen.findByRole('button', { name: t('global_coach.live_title') }));
  const mute = await screen.findByRole('button', { name: t('global_coach.live_mute_mic') });
  expect(screen.getByRole('button', { name: t('global_coach.live_interrupt') })).toBeTruthy();
  expect(screen.getByRole('button', { name: t('global_coach.live_end') })).toBeTruthy();
  fireEvent.click(mute);
  expect(ports.mute).toHaveBeenCalledWith(true);
  expect(ports.stop).not.toHaveBeenCalled();
  expect(ports.dispose).not.toHaveBeenCalled();
});

it('omits the mute control when the engine exposes no microphone mute port', async () => {
  await openRail({ phase: 'live', transcript: [] });
  expect(screen.queryByRole('button', { name: t('global_coach.live_mute_mic') })).toBeNull();
});

it('runs no waveform loop under reduced motion, but animates the real level otherwise', async () => {
  const raf = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  await openRail({ phase: 'live', meterSupported: true, inputLevel: 0.6, inputLevelUpdatedAtMs: Date.now(), transcript: [] });
  expect(screen.getByRole('img', { name: t('global_coach.live_waveform') })).toBeTruthy();
  expect(raf).not.toHaveBeenCalled();
  cleanup();
  (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  await openRail({ phase: 'live', meterSupported: true, inputLevel: 0.6, inputLevelUpdatedAtMs: Date.now(), transcript: [] });
  await waitFor(() => expect(raf).toHaveBeenCalled());
});

it('keeps a subscribed consumer animating through sustained equal-amplitude samples and expires it once samples stop', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  // One controlled clock for both the engine's epoch timestamps and the renderer's animation frames.
  let nowMs = 1_700_000_000_000;
  vi.spyOn(window.performance, 'now').mockImplementation(() => nowMs);
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  const flush = (advance = 0) => { nowMs += advance; const pending = frames.splice(0); for (const callback of pending) callback(nowMs); };
  const listeners = new Set<() => void>();
  let snapshot: Record<string, unknown> = { phase: 'live', meterSupported: true, inputLevel: 0.3, inputLevelUpdatedAtMs: nowMs, transcript: [] };
  ports.make.mockReturnValue({ dispose: ports.dispose, controller: {
    snapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    startFromGesture: ports.start, stop: ports.stop,
  } });
  render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  fireEvent.click(await screen.findByRole('button', { name: t('global_coach.live_title') }));
  await screen.findByRole('button', { name: t('global_coach.live_end') });
  const wave = screen.getByRole('img', { name: t('global_coach.live_waveform') });
  flush();
  expect(wave.dataset.signal).toBe('present');
  // Sustained IDENTICAL amplitude over more than the 180ms TTL: the engine's advancing real
  // timestamps are the measurement identity, so the trace keeps running instead of flattening.
  let lastStamp = nowMs;
  for (let index = 0; index < 7; index += 1) {
    nowMs += 50;
    lastStamp = nowMs;
    snapshot = { phase: 'live', meterSupported: true, inputLevel: 0.3, inputLevelUpdatedAtMs: nowMs, transcript: [] };
    act(() => { listeners.forEach(listener => listener()); });
    flush();
    expect(wave.dataset.signal).toBe('present');
  }
  // Real samples stop: the last measurement ages past the TTL and the trace goes static.
  flush(400);
  expect(wave.dataset.signal).toBe('absent');
  // The unchanged old timestamp arriving on an unrelated snapshot never rejuvenates it.
  snapshot = { phase: 'live', meterSupported: true, inputLevel: 0.3, inputLevelUpdatedAtMs: lastStamp, transcript: [] };
  act(() => { listeners.forEach(listener => listener()); });
  expect(frames).toHaveLength(0);
  expect(wave.dataset.signal).toBe('absent');
  // A visual state change clears the trace, and a cached timestamp may not revive it either.
  nowMs += 20;
  snapshot = { phase: 'live', meterSupported: true, microphoneMuted: true, inputLevel: 0.3, inputLevelUpdatedAtMs: nowMs, transcript: [] };
  act(() => { listeners.forEach(listener => listener()); });
  snapshot = { phase: 'live', meterSupported: true, inputLevel: 0.3, inputLevelUpdatedAtMs: nowMs, transcript: [] };
  act(() => { listeners.forEach(listener => listener()); });
  expect(frames).toHaveLength(0);
  expect(wave.dataset.signal).toBe('absent');
});

it('keeps the speaking trace and the mute control when only the microphone track is muted', async () => {
  // A muted microphone must never suppress a genuinely playing model answer.
  const snapshot: Record<string, unknown> = { phase: 'live', microphoneMuted: true, outputMeterSupported: true, outputLevel: 0.6, outputLevelUpdatedAtMs: Date.now(), meterSupported: true, inputLevel: 0.1, inputLevelUpdatedAtMs: Date.now(), transcript: [] };
  ports.make.mockReturnValue({ dispose: ports.dispose, controller: { snapshot: () => snapshot, subscribe: ports.subscribe, startFromGesture: ports.start, stop: ports.stop, setMicrophoneMuted: ports.mute } });
  const view = render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  fireEvent.click(await screen.findByRole('button', { name: t('global_coach.live_title') }));
  await screen.findByRole('button', { name: t('global_coach.live_end') });
  expect(screen.getByText(t('global_coach.live_speaking'))).toBeTruthy();
  expect(screen.getByRole('button', { name: t('global_coach.live_unmute_mic') }).getAttribute('aria-pressed')).toBe('true');
  expect(view.container.querySelector('[data-state="speaking"]')).not.toBeNull();
  expect(ports.stop).not.toHaveBeenCalled();
});

it('uses the admitted deadline and the real bridge state instead of inferred timings', async () => {
  await openRail({ phase: 'live', busy: true, meterSupported: true, inputLevel: 0.3, transcript: [] });
  // Thinking comes from the real busy flag; the decorative arc is not an audio level.
  expect(document.querySelector('[data-state="thinking"]')).not.toBeNull();
  expect(await screen.findByText(t('global_coach.live_working'))).toBeTruthy();
});

it('never renders a fake level bar when the engine reports no real analyser', async () => {
  await openRail({ phase: 'live', transcript: [] });
  expect(screen.queryByRole('img', { name: t('global_coach.live_waveform') })).toBeNull();
  expect(screen.getByText(t('global_coach.live_no_level'))).toBeTruthy();
});

// Positive fix regression for VISUAL-PREMIUM-004. AG4's reference repro (REVIEW-REFERENCE/
// voice-premium-v2-unsupported-input-repro.test.tsx) documented the defect: with meterSupported:false
// the renderer host was unmounted and the snapshot effect bailed before setViewState, freezing the
// status and suppressing a valid output trace. These assertions are the inverted expectation.
it('keeps a valid output trace and live phase transitions when only the input meter is unavailable', async () => {
  let snapshot: Record<string, unknown> = { phase: 'live', meterSupported: false, outputMeterSupported: true, outputLevel: 0.5, outputLevelUpdatedAtMs: Date.now(), transcript: [] };
  let notify = () => {};
  const view = await openRail(snapshot, { snapshot: () => snapshot, subscribe: (listener: () => void) => { notify = listener; return () => {}; } });
  const dock = () => view.container.querySelector('[data-state]')!;
  // The output analyser is attached, so the renderer must stay mounted (not replaced by a notice).
  expect(view.container.querySelector('[role="img"]')).not.toBeNull();
  expect(dock().getAttribute('data-state')).toBe('speaking');
  // The missing microphone level is still reported honestly, separately from the output trace.
  expect(screen.getByText(t('global_coach.live_no_level'))).toBeTruthy();
  // Phase/status is derived from the snapshot, not the renderer: real transitions are not frozen.
  await act(async() => { snapshot = { ...snapshot, outputLevel: null, outputLevelUpdatedAtMs: null, busy: true }; notify(); });
  expect(dock().getAttribute('data-state')).toBe('thinking');
  expect(screen.getByText(t('global_coach.live_working'))).toBeTruthy();
  await act(async() => { snapshot = { ...snapshot, busy: false, interrupted: true }; notify(); });
  expect(dock().getAttribute('data-state')).toBe('paused');
  expect(screen.getByText(t('global_coach.live_paused'))).toBeTruthy();
});

it('advances phase/status with no analyser in either direction instead of freezing on the notice', async () => {
  let snapshot: Record<string, unknown> = { phase: 'live', meterSupported: false, outputMeterSupported: false, transcript: [] };
  let notify = () => {};
  const view = await openRail(snapshot, { snapshot: () => snapshot, subscribe: (listener: () => void) => { notify = listener; return () => {}; } });
  const dock = () => view.container.querySelector('[data-state]')!;
  expect(view.container.querySelector('[role="img"]')).toBeNull();
  expect(screen.getByText(t('global_coach.live_no_level'))).toBeTruthy();
  await act(async() => { snapshot = { ...snapshot, busy: true }; notify(); });
  expect(dock().getAttribute('data-state')).toBe('thinking');
});

it('stops claiming speaking once the engine expires the output sampling', async () => {
  let snapshot: Record<string, unknown> = { phase: 'live', meterSupported: false, outputMeterSupported: true, outputLevel: 0.5, outputLevelUpdatedAtMs: Date.now(), transcript: [] };
  let notify = () => {};
  const view = await openRail(snapshot, { snapshot: () => snapshot, subscribe: (listener: () => void) => { notify = listener; return () => {}; } });
  const dock = () => view.container.querySelector('[data-state]')!;
  expect(dock().getAttribute('data-state')).toBe('speaking');
  // The engine nulls an expired sample rather than replaying the old level; the rail must follow.
  await act(async() => { snapshot = { ...snapshot, outputLevel: null, outputLevelUpdatedAtMs: null }; notify(); });
  expect(dock().getAttribute('data-state')).toBe('listening');
  expect(screen.queryByText(t('global_coach.live_speaking'))).toBeNull();
});

it('disposes the renderer on unmount so no stale animation outlives the session', async () => {
  const view = await openRail({ phase: 'live', meterSupported: true, inputLevel: 0.4, inputLevelUpdatedAtMs: Date.now(), transcript: [] });
  const host = view.container.querySelector('[role="img"]')!;
  expect(host.querySelector('svg')).not.toBeNull();
  view.unmount();
  expect(host.querySelector('svg')).toBeNull();
});

it('renders exactly one voice heading, with its close control, above the dock', async () => {
  const view = await openRail({ phase: 'live', transcript: [] });
  // One heading only: the duplicate inner title was removed.
  expect(screen.getAllByText(t('global_coach.live_title'))).toHaveLength(1);
  const header = screen.getByText(t('global_coach.live_title')).closest('header');
  expect(header).not.toBeNull();
  // The single heading owns the close control and precedes the dock in document order.
  expect(header!.querySelector(`button[aria-label="${t('global_coach.close')}"]`)).not.toBeNull();
  const dock = view.container.querySelector('[data-state]')!;
  expect(header!.contains(dock)).toBe(false);
  expect(header!.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('dedupes repeated provider event ids and revises the open group on a late fragment', () => {
  const first: LiveTranscriptRow & { eventId?: string } = { speaker: 'user', text: 'I ate two', startMs: 0, endMs: 900, eventId: 'evt-1' };
  const late = { speaker: 'user' as const, text: 'I ate two eggs', startMs: 700, endMs: 1_400, eventId: 'evt-2' };
  const merged = mergeVoiceTurns([], [first, late]);
  // One local group, revised in place — not two duplicated rows.
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({ id: 'evt-1', text: 'I ate two eggs', revision: true });
  // A re-delivered event id is ignored even if it would otherwise look like a fresh fragment.
  const redelivered = mergeVoiceTurns(merged, [{ speaker: 'user', text: 'I ate two', startMs: 0, endMs: 900, eventId: 'evt-1' } as LiveTranscriptRow]);
  expect(redelivered).toHaveLength(1);
  expect(redelivered[0].revision).toBe(true);
});

it('merges voice turns with stable ids, server order, and dedupe', () => {
  const rows: LiveTranscriptRow[] = [
    { speaker: 'assistant', text: 'Hi there', startMs: 1_200, endMs: 1_600 },
    { speaker: 'user', text: 'I ate two eggs', startMs: 0, endMs: 900 },
    { speaker: 'user', text: 'I ate two eggs', startMs: 0, endMs: 900 },
  ];
  const merged = mergeVoiceTurns([], rows);
  expect(merged.map(entry => entry.id)).toEqual(['user:0:900', 'assistant:1200:1600']);
  expect(mergeVoiceTurns(merged, rows)).toEqual(merged);
});

it('hides a streamed user fragment once the delegated chat turn carries it', () => {
  const row: VoiceChatEntry = { id: 'user:0:900', speaker: 'user', text: 'I ate two eggs and toast', startMs: 0, endMs: 900 };
  expect(voiceRowVisible(row, { user: [], assistant: [] })).toBe(true);
  expect(voiceRowVisible(row, { user: ['I ate two eggs and toast, log it please'], assistant: [] })).toBe(false);
});

it('updates cumulative engine captions with the same local id', () => {
  const first: LiveTranscriptRow = { id: 'row-1', eventId: 'a', speaker: 'user', text: 'I ate', startMs: 0, endMs: 100 };
  const revised = { ...first, eventId: 'b', text: 'I ate two eggs', endMs: 300 };
  expect(mergeVoiceTurns(mergeVoiceTurns([], [first]), [revised])).toEqual([revised]);
});
