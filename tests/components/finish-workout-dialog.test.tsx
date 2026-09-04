// @vitest-environment jsdom

import React, { useLayoutEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('keeps focus inside the dialog across parent re-renders and restores the trigger exactly once on unmount', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const triggerFocus = vi.spyOn(trigger, 'focus');
    const summary = { durationMinutes: 12, completedSets: 3, pendingSets: 0, painNotes: 0, prs: 0 };
    const view = render(<FinishWorkoutDialog summary={summary} onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Finish workout?' });
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    // The rest timer re-renders LiveWorkout every second with a fresh cancelFinish arrow.
    const latestKeepTraining = vi.fn();
    for (let tick = 0; tick < 3; tick += 1) {
      view.rerender(<FinishWorkoutDialog summary={summary} onKeepTraining={tick === 2 ? latestKeepTraining : vi.fn()} onSaveAndFinish={vi.fn()} />);
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(triggerFocus).not.toHaveBeenCalled();

    // Escape must still reach the newest callback identity.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(latestKeepTraining).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(triggerFocus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('uses the translucent scrim token for its backdrop', () => {
    render(<FinishWorkoutDialog summary={{ durationMinutes: 12, completedSets: 3, pendingSets: 0, painNotes: 0, prs: 0 }} onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} />);
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(backdrop.className).toContain('bg-[var(--scrim)]');
    expect(backdrop.className).toContain('backdrop-blur-sm');
    expect(backdrop.className).not.toContain('surface-overlay');
  });

  it('offers only verified discard for an empty workout', () => {
    const onDiscard = vi.fn();
    render(<FinishWorkoutDialog summary={{ durationMinutes: 0, completedSets: 0, pendingSets: 0, painNotes: 0, prs: 0 }} onKeepTraining={vi.fn()} onSaveAndFinish={vi.fn()} onDiscardEmpty={onDiscard} />);
    expect(screen.queryByRole('button', { name: 'Save and finish' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discard empty workout' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('blocks Escape in the same commit that saving begins', () => {
    const onKeepTraining = vi.fn();
    function SavingRace() {
      const [saving, setSaving] = useState(false);
      useLayoutEffect(() => {
        if (saving) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }, [saving]);
      return <>
        <button type="button" onClick={() => setSaving(true)}>Begin save</button>
        <FinishWorkoutDialog saving={saving} summary={{ durationMinutes: 12, completedSets: 3, pendingSets: 0, painNotes: 0, prs: 0 }} onKeepTraining={onKeepTraining} onSaveAndFinish={vi.fn()} />
      </>;
    }

    render(<SavingRace />);
    fireEvent.click(screen.getByRole('button', { name: 'Begin save' }));
    expect(onKeepTraining).not.toHaveBeenCalled();
  });
});
