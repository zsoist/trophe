// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ replace: vi.fn(), getUser: vi.fn(), stage: 'live' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: harness.replace }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => ({ state: { stage: harness.stage } }) }));
vi.mock('@/components/workout/workspace/LiveWorkout', () => ({ LiveWorkout: ({ exercises, userId }: { exercises: unknown[]; userId: string }) => <p>Live logger {userId} {exercises.length}</p> }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: harness.getUser },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [{ id: 'bench' }], error: null }) }) }),
  },
}));

import LiveWorkoutPage from '@/app/dashboard/workout/live/page';

afterEach(() => { cleanup(); vi.clearAllMocks(); harness.stage = 'live'; });

describe('live workout route', () => {
  it('loads the authenticated exercise library for the recovered live session', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    render(<LiveWorkoutPage />);
    expect(await screen.findByText('Live logger nik 1')).toBeTruthy();
  });

  it('routes non-live recovery states back to their workspace screen', async () => {
    harness.stage = 'review';
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    render(<LiveWorkoutPage />);
    await vi.waitFor(() => expect(harness.replace).toHaveBeenCalledWith('/dashboard/workout/review'));
  });
});
