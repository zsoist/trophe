// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  await openRail({ phase: 'live', meterSupported: true, inputLevel: 0.6, transcript: [] });
  expect(screen.getByRole('img', { name: t('global_coach.live_waveform') })).toBeTruthy();
  expect(raf).not.toHaveBeenCalled();
  cleanup();
  (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  await openRail({ phase: 'live', meterSupported: true, inputLevel: 0.6, transcript: [] });
  await waitFor(() => expect(raf).toHaveBeenCalled());
});

it('never renders a fake level bar when the engine reports no real analyser', async () => {
  await openRail({ phase: 'live', transcript: [] });
  expect(screen.queryByRole('img', { name: t('global_coach.live_waveform') })).toBeNull();
  expect(screen.getByText(t('global_coach.live_no_level'))).toBeTruthy();
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
