// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const draft: WorkoutDraft = { version: 2, kind: 'cardio', name: 'Run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: 5, effort: 7 };
const harness = vi.hoisted(() => ({ discardDraft: vi.fn(), ensureClientRequestId: vi.fn(() => '11111111-1111-4111-8111-111111111111'), push: vi.fn(), getUser: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: harness.push }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: harness.getUser },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
  },
}));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => ({ state: { stage: 'review', draft }, discardDraft: harness.discardDraft, ensureClientRequestId: harness.ensureClientRequestId }) }));
vi.mock('@/components/workout/workspace/WorkoutReview', () => ({ WorkoutReview: ({ onLogCompleted }: { onLogCompleted: (value: WorkoutDraft) => void }) => <button onClick={() => onLogCompleted(draft)}>Log completed workout</button> }));
vi.mock('@/components/workout/workspace/RetrospectiveWorkoutLogger', () => ({ RetrospectiveWorkoutLogger: ({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) => <div><p>Retrospective logger</p><button onClick={onSaved}>Simulate saved</button><button onClick={onCancel}>Cancel logging</button></div> }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import WorkoutReviewPage from '@/app/dashboard/workout/review/page';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('WorkoutReviewPage retrospective seam', () => {
  it('opens durable retrospective logging and clears the draft only after save succeeds', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    render(<WorkoutReviewPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Log completed workout' }));
    expect(await screen.findByText('Retrospective logger')).toBeTruthy();
    expect(harness.discardDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate saved' }));
    expect(harness.discardDraft).toHaveBeenCalledTimes(1);
    expect(harness.push).toHaveBeenCalledWith('/dashboard/workout');
  });
});
