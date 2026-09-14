// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { globalCoachTranslations } from '@/lib/locales/global-coach';

vi.mock('@/components/assistant/useGlobalCoachI18n', () => ({
  useGlobalCoachI18n: () => ({ t: (key: string) => globalCoachTranslations[key]?.en ?? key }),
}));

const ports = vi.hoisted(() => ({ make: vi.fn(), dispose: vi.fn() }));
vi.mock('@/lib/voice-live/browser-session', () => ({ createBrowserLiveSession: ports.make }));

import { LiveVoiceControl } from '@/components/assistant/LiveVoiceControl';

const t = (key: string) => globalCoachTranslations[key]?.en ?? key;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }));
  const snapshot = { phase: 'idle', transcript: [] };
  const subscribe = () => () => {};
  ports.make.mockReturnValue({
    dispose: ports.dispose,
    controller: { snapshot: () => snapshot, subscribe, startFromGesture: vi.fn(), stop: vi.fn() },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/**
 * A live voice session is opened from the in-composer launcher and closed from a control INSIDE the
 * rail, which unmounts on close. Without an explicit return, the browser drops focus on
 * `document.body`: a keyboard or assistive user loses their place in the Ask composer. The rail must
 * hand focus back to the launcher it was opened from, without scrolling the composer.
 */
it('returns focus to the launcher when the rail closes from its own close control', async () => {
  render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  const launcher = await screen.findByRole('button', { name: t('global_coach.live_title') });
  fireEvent.click(launcher);
  const close = await screen.findByRole('button', { name: t('global_coach.close') });
  const focus = vi.spyOn(launcher, 'focus');
  close.focus();
  await act(async () => { fireEvent.click(close); });
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(document.activeElement).toBe(launcher);
  expect(launcher.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: t('global_coach.close') })).toBeNull();
});

it('keeps focus on the launcher when the rail is collapsed from the launcher itself', async () => {
  render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  const launcher = await screen.findByRole('button', { name: t('global_coach.live_title') });
  fireEvent.click(launcher);
  await screen.findByRole('button', { name: t('global_coach.close') });
  await act(async () => { fireEvent.click(launcher); });
  expect(document.activeElement).toBe(launcher);
  expect(launcher.getAttribute('aria-expanded')).toBe('false');
});

// The host (Ask composer) owns focus when it replaces the durable conversation and already places
// it explicitly; the rail follows that close but must never pull focus back to the launcher.
it('closes on a conversation change without stealing focus from the host', async () => {
  const host = document.createElement('input');
  document.body.appendChild(host);
  const view = render(<LiveVoiceControl conversationId="one" onQuery={async () => 'answer'} />);
  const launcher = await screen.findByRole('button', { name: t('global_coach.live_title') });
  fireEvent.click(launcher);
  await screen.findByRole('button', { name: t('global_coach.close') });
  host.focus();
  await act(async () => { view.rerender(<LiveVoiceControl conversationId="two" onQuery={async () => 'answer'} />); });
  expect(screen.queryByRole('button', { name: t('global_coach.close') })).toBeNull();
  expect(document.activeElement).toBe(host);
  host.remove();
});
