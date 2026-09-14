// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const ports = vi.hoisted(() => ({ start: vi.fn(), dispose: vi.fn(), stop: vi.fn(), make: vi.fn() }));
vi.mock('@/components/assistant/useGlobalCoachI18n', () => ({ useGlobalCoachI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/voice-live/browser-session', () => ({ createBrowserLiveSession: ports.make }));
import { LiveVoiceControl } from '@/components/assistant/LiveVoiceControl';
const state = { phase: 'idle', error: null, canInterrupt: false, playbackBlocked: false, interrupted: false, busy: false, transcript: [] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }));
  ports.make.mockReturnValue({ dispose: ports.dispose, controller: { snapshot: () => state, subscribe: () => () => {}, startFromGesture: ports.start, stop: ports.stop } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('does not acquire a microphone or create a session merely by opening Ask or the voice controls', async () => {
  render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  fireEvent.click(await screen.findByRole('button', { name: 'global_coach.live_title' }));
  await screen.findByRole('button', { name: 'global_coach.live_start' });
  expect(ports.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'global_coach.live_start' }));
  expect(ports.start).toHaveBeenCalledTimes(1);
});
it('disposes live media on close and on a conversation change', async () => {
  const view = render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  fireEvent.click(await screen.findByRole('button', { name: 'global_coach.live_title' }));
  fireEvent.click(await screen.findByRole('button', { name: 'global_coach.close' }));
  expect(ports.dispose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'global_coach.live_title' }));
  await screen.findByRole('button', { name: 'global_coach.live_start' });
  view.rerender(<LiveVoiceControl conversationId="two" onQuery={async () => 'answer'} />);
  await waitFor(() => expect(ports.dispose).toHaveBeenCalledTimes(2));
});
it('hides the optional voice control when the server gate is closed', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) } as Response);
  render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button')).toBeNull();
  expect(ports.make).not.toHaveBeenCalled();
});
