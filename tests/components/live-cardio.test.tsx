// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'workout.cardio_run': 'Run', 'workout.duration_minutes': 'Duration in minutes',
  'workout.distance_optional': 'Distance optional', 'workout.effort': 'Effort',
  'workout.pause': 'Pause', 'workout.resume': 'Resume', 'workout.finish': 'Finish workout',
  'workout.log_completed': 'Log completed workout', 'workout.save_completed_question': 'Save completed workout?',
  'workout.save_workout': 'Save workout', 'workout.keep_editing': 'Keep editing', 'workout.saving': 'Saving…',
  'workout.invalid_cardio_metrics': 'Enter a valid distance and effort from 1 to 10.',
}[key] ?? key) }) }));

import { LiveCardio } from '@/components/workout/workspace/LiveCardio';

const runDraft = { version: 2 as const, kind: 'cardio' as const, name: 'Morning run', updatedAt: 1, activity: 'run' as const, durationMinutes: 30, distanceKm: 5, effort: 7 };

afterEach(cleanup);

describe('LiveCardio', () => {
  it('supports pause, resume, and explicit cardio fields in live mode', () => {
    const onPause = vi.fn(); const onResume = vi.fn(); const onFinish = vi.fn(); const onChange = vi.fn();
    const { rerender } = render(<LiveCardio draft={runDraft} mode="live" paused={false} elapsedMs={30_000} onPause={onPause} onResume={onResume} onFinish={onFinish} onChange={onChange} />);
    expect(screen.getByLabelText('Distance optional')).toBeTruthy();
    expect(screen.getByLabelText('Effort')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Distance optional'), { target: { value: '7.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ durationMinutes: 0, distanceKm: 7.5, effort: 7 });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPause).toHaveBeenCalledTimes(1);
    rerender(<LiveCardio draft={runDraft} mode="live" paused elapsedMs={30_000} onPause={onPause} onResume={onResume} onFinish={onFinish} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('disables finish and edits while a live mutation barrier is active', () => {
    render(<LiveCardio draft={runDraft} mode="live" disabled onFinish={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
    expect((screen.getByLabelText('Distance optional') as HTMLInputElement).disabled).toBe(true);
  });

  it('confirms retrospective cardio before calling the durable save boundary', () => {
    const onSave = vi.fn();
    render(<LiveCardio draft={runDraft} mode="retrospective" onSaveRetrospective={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log completed workout' }));
    expect(screen.getByRole('dialog', { name: 'Save completed workout?' })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save workout' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ durationMinutes: 30, distanceKm: 5, effort: 7 });
  });

  it('retains invalid cardio input and shows feedback before a live finish', () => {
    const onFinish = vi.fn();
    render(<LiveCardio draft={runDraft} mode="live" onFinish={onFinish} />);
    fireEvent.change(screen.getByLabelText('Distance optional'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Effort'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
    expect(screen.getByRole('alert').textContent).toContain('valid distance');
    expect((screen.getByLabelText('Distance optional') as HTMLInputElement).value).toBe('-1');
    expect((screen.getByLabelText('Effort') as HTMLInputElement).value).toBe('11');
    expect(onFinish).not.toHaveBeenCalled();
  });
});
