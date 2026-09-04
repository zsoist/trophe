// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, number>) => ({
  'workout.finish_question': 'Finish workout?', 'workout.keep_training': 'Keep training',
  'workout.save_and_finish': 'Save and finish', 'workout.discard_empty': 'Discard empty workout',
  'workout.finish_duration': `Duration ${values?.n} min`, 'workout.finish_completed_sets': `${values?.n} completed sets`,
  'workout.finish_pending_sets': `${values?.n} pending sets`, 'workout.finish_pain_notes': `${values?.n} pain notes`,
  'workout.finish_prs': `${values?.n} PRs`, 'workout.saving': 'Saving…', 'workout.retry_recovery': 'Retry recovery',
  'workout.finish_blocked_loading': 'Finish is unavailable while the workout is being recovered.',
  'workout.finish_blocked_pending': 'Finish is unavailable while changes are still saving.',
  'workout.finish_blocked_failed': 'Finish is unavailable because a change could not be saved. Retry it first.',
  'workout.finish_blocked_recovery': 'Finish is unavailable until workout recovery is verified.',
}[key] ?? key) }) }));

import { FinishWorkoutDialog } from '@/components/workout/workspace/FinishWorkoutDialog';

const summary = { durationMinutes: 42, completedSets: 6, pendingSets: 2, painNotes: 1, prs: 1 };

afterEach(cleanup);

describe('FinishWorkoutDialog blocked reasons', () => {
  it('explains a pending-write block without offering retry', () => {
    render(<FinishWorkoutDialog summary={summary} blocked blockedReason="pending" onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save and finish' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('changes are still saving');
    expect(screen.queryByRole('button', { name: 'Retry recovery' })).toBeNull();
  });

  it('offers the retry affordance for failed writes and unverified recovery', () => {
    const onRetry = vi.fn();
    render(<FinishWorkoutDialog summary={summary} blocked blockedReason="failed" onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByRole('status').textContent).toContain('could not be saved');
    fireEvent.click(screen.getByRole('button', { name: 'Retry recovery' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();

    render(<FinishWorkoutDialog summary={summary} blocked blockedReason="recovery" onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByRole('status').textContent).toContain('recovery is verified');
    expect(screen.getByRole('button', { name: 'Retry recovery' })).toBeTruthy();
  });

  it('explains the recovery wait for a finishing session restored before its reads settle', () => {
    render(<FinishWorkoutDialog summary={summary} blocked blockedReason="loading" onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('being recovered');
  });

  it('renders no blocked explanation when the primary action is available', () => {
    render(<FinishWorkoutDialog summary={summary} onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save and finish' }).hasAttribute('disabled')).toBe(false);
  });
});
