// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  callbacks: [] as Array<(event: string, session: { user: { id: string } } | null) => void>,
  unsubscribe: vi.fn(),
}));
const coach = vi.hoisted(() => ({ resetActor: vi.fn(), props: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback: (event: string, session: { user: { id: string } } | null) => void) => {
        auth.callbacks.push(callback);
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      }),
      getUser: vi.fn(() => new Promise(() => {})),
    },
  },
}));

vi.mock('@/components/assistant/GlobalCoach', () => ({
  default: (props: { identity: string } & Record<string, unknown>) => {
    coach.props.push(props);
    return <div>Coach for {props.identity}</div>;
  },
  resetGlobalCoachSession: vi.fn(),
  resetGlobalCoachSessionsForActor: coach.resetActor,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/log' }));

import AccountCoach from '@/components/assistant/AccountCoach';
import { requestVoiceTranscript } from '@/components/assistant/voice-client';

afterEach(() => {
  cleanup();
  auth.callbacks.length = 0;
  auth.unsubscribe.mockClear();
  coach.resetActor.mockClear();
  coach.props.length = 0;
  delete process.env.NEXT_PUBLIC_COACH_VOICE_FIXTURE_ENABLED;
  delete process.env.NEXT_PUBLIC_COACH_VOICE_LIVE_ENABLED;
});

it('ignores a stale auth callback after a route-owned coach has unmounted', async () => {
  const view = render(<AccountCoach />);
  const callback = auth.callbacks[0];
  await act(async () => callback('SIGNED_IN', { user: { id: 'actor-a' } }));
  expect(screen.getByText('Coach for actor-a')).toBeTruthy();

  view.unmount();
  await act(async () => callback('SIGNED_OUT', null));

  expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
  expect(coach.resetActor).not.toHaveBeenCalled();
});

it('passes the real transcription transport when the public live flag is enabled', async () => {
  process.env.NEXT_PUBLIC_COACH_VOICE_LIVE_ENABLED = '1';
  render(<AccountCoach />);
  await act(async () => auth.callbacks[0]('SIGNED_IN', { user: { id: 'actor-a' } }));

  expect(coach.props.at(-1)?.voiceTranscriptionTransport).toBe(requestVoiceTranscript);
});
