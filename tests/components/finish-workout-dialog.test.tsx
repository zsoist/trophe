// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, number>) => ({
  'workout.finish_question': 'Finish workout?', 'workout.keep_training': 'Keep training',
  'workout.save_and_finish': 'Save and finish', 'workout.discard_empty': 'Discard empty workout',
  'workout.finish_duration': `Duration ${values?.n} min`, 'workout.finish_completed_sets': `${values?.n} completed sets`,
  'workout.finish_pending_sets': `${values?.n} pending sets`, 'workout.finish_pain_notes': `${values?.n} pain notes`,
  'workout.finish_prs': `${values?.n} PRs`, 'workout.saving': 'Saving…',
}[key] ?? key) }) }));

import { FinishWorkoutDialog } from '@/components/workout/workspace/FinishWorkoutDialog';

afterEach(cleanup);

describe('FinishWorkoutDialog', () => {
  it('summarizes pending writes and keeps training without saving', () => {
    const onKeepTraining = vi.fn(); const onSave = vi.fn();
    render(<FinishWorkoutDialog summary={{ durationMinutes: 42, completedSets: 6, pendingSets: 2, painNotes: 1, prs: 1 }} onKeepTraining={onKeepTraining} onSaveAndFinish={onSave} />);
    expect(screen.getByRole('dialog', { name: 'Finish workout?' })).toBeTruthy();
    expect(screen.getByText('6 completed sets')).toBeTruthy();
    expect(screen.getByText('2 pending sets')).toBeTruthy();
    expect(screen.getByText('1 pain notes')).toBeTruthy();
    expect(screen.getByText('1 PRs')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep training' }));
    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers only verified discard for an empty workout', () => {
    const onDiscard = vi.fn();
    render(<FinishWorkoutDialog summary={{ durationMinutes: 0, completedSets: 0, pendingSets: 0, painNotes: 0, prs: 0 }} onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} onDiscardEmpty={onDiscard} />);
    expect(screen.queryByRole('button', { name: 'Save and finish' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discard empty workout' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
