// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, number | string>) => ({
  'workout.weight_in_unit': 'Weight in kg', 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional',
  'workout.complete_set': 'Complete set', 'workout.undo_set': 'Undo set', 'workout.saving': 'Saving…',
  'workout.more_exercise_options': 'More exercise options', 'workout.report_pain': 'Report pain',
  'workout.info_technique': 'Technique', 'workout.plate_title': 'Plate calculator',
  'workout.superset_link': 'Link with next exercise', 'workout.remove_exercise': 'Remove exercise',
  'workout.resting': 'Resting', 'workout.rest_target': 'Rest target',
  'workout.rest_timer_label': 'Rest timer', 'workout.rest_complete': 'Rest complete',
  'workout.rest_started': `Rest started, ${values?.n}s target`,
}[key] ?? key) }) }));

import { ExerciseSetLogger } from '@/components/workout/workspace/ExerciseSetLogger';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window.navigator as { vibrate?: unknown }).vibrate;
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** jsdom implements neither API; define them as configurable own properties so the component's feature detection sees them. */
function stubHaptics(reducedMotion: boolean) {
  const vibrate = vi.fn().mockReturnValue(true);
  const matchMedia = vi.fn().mockReturnValue({ matches: reducedMotion });
  Object.defineProperty(window.navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
  return { vibrate, matchMedia };
}

const flushMicrotasks = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const liveRegion = () => document.querySelector('[aria-live="polite"]') as HTMLElement;

async function completeSetWithFakeTimers(props: Partial<React.ComponentProps<typeof ExerciseSetLogger>> = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
  const onUndo = vi.fn().mockResolvedValue(true);
  render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" restTargetSeconds={90} onComplete={vi.fn().mockResolvedValue('set-1')} onUndo={onUndo} {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Complete set' })); });
  await flushMicrotasks();
  return { onUndo };
}

describe('ExerciseSetLogger', () => {
  it('uses explicit set labels and hides secondary tools under More', () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press', isCompound: true, equipment: 'barbell' }} setNumber={1} unit="kg" onComplete={vi.fn()} />);
    expect(screen.getByLabelText('Weight in kg')).toBeTruthy();
    expect(screen.getByLabelText('Reps')).toBeTruthy();
    expect(screen.getByLabelText('RPE optional')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Complete set' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More exercise options' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Report pain' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More exercise options' }));
    expect(screen.getByRole('button', { name: 'Report pain' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove exercise' })).toBeTruthy();
  });

  it('converts entered values into a labeled completion request and exposes saving/completed states', async () => {
    let resolve!: (value: string | null) => void;
    const onComplete = vi.fn(() => new Promise<string | null>((done) => { resolve = done; }));
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={2} unit="kg" onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Weight in kg'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('RPE optional'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true);
    expect(onComplete).toHaveBeenCalledWith({ weight: 60, reps: 8, rpe: 7.5, isWarmup: false });
    resolve('set-2');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo set' })).toBeTruthy());
  });

  it('shows a rest target only after a set completes', async () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" restTargetSeconds={90} onComplete={vi.fn().mockResolvedValue('set-1')} />);
    expect(screen.queryByText(/Resting/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    expect(await screen.findByText(/Resting/)).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toMatch(/90s/);
  });

  it('does not start a fresh rest timer for a recovered completed set', () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" initialSetId="persisted-set" initialValue={{ weight: 60, reps: 8, rpe: 7, isWarmup: false }} onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Undo set' })).toBeTruthy();
    expect(screen.queryByText(/Resting/)).toBeNull();
  });

  it('restores the original rest context and elapsed clock immediately', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:30.000Z'));
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" initialSetId="persisted-set" initialCompletedAt="2026-08-25T12:00:00.000Z" initialValue={{ weight: 60, reps: 8, rpe: 7, isWarmup: false }} restTargetSeconds={90} onComplete={vi.fn()} />);
    expect(screen.getByText(/30s \/ 90s/)).toBeTruthy();
    vi.useRealTimers();
  });

  it('restores completed values for editing after undo', async () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" initialSetId="persisted-set" initialValue={{ weight: 60, reps: 8, rpe: 7, isWarmup: false }} onComplete={vi.fn()} onUndo={vi.fn().mockResolvedValue(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo set' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete set' })).toBeTruthy());
    expect((screen.getByLabelText('Weight in kg') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Reps') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('RPE optional') as HTMLInputElement).value).toBe('7');
  });

  it('clears a stale rest announcement when warm-up insertion reuses a planned row', async () => {
    const { rerender } = render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" onComplete={vi.fn().mockResolvedValue('set-1')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    expect(await screen.findByText('Rest started, 90s target', { selector: '[aria-live="polite"]' })).toBeTruthy();

    rerender(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={2} unit="kg" initialValue={{ weight: 40, reps: 10, isWarmup: true }} onComplete={vi.fn()} />);
    await waitFor(() => expect(liveRegion().textContent).toBe(''));
    expect(screen.getByRole('button', { name: 'Complete set' })).toBeTruthy();
  });

  it('re-enables completion when persistence rejects', async () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" onComplete={vi.fn().mockRejectedValue(new Error('offline'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete set' }).hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('button', { name: 'Undo set' })).toBeNull();
  });

  describe('quiet rest timer', () => {
    it('renders the counter as a non-live timer and announces exactly twice over a full rest', async () => {
      await completeSetWithFakeTimers();
      const timer = screen.getByRole('timer', { name: 'Rest timer' });
      expect(timer.getAttribute('aria-live')).not.toBe('polite');
      expect(timer.textContent).toMatch(/0s \/ 90s/);
      expect(screen.queryByRole('status')).toBeNull();

      const region = liveRegion();
      expect(region).toBeTruthy();
      const announcements: string[] = [region.textContent ?? ''];
      for (let second = 0; second < 92; second += 1) {
        advance(1_000);
        const text = region.textContent ?? '';
        if (text !== announcements.at(-1)) announcements.push(text);
      }
      expect(announcements.filter(Boolean)).toEqual(['Rest started, 90s target', 'Rest complete']);
    });

    it('shows a keyed completion chip instead of vanishing at the target', async () => {
      await completeSetWithFakeTimers();
      advance(89_000);
      expect(screen.getByRole('timer')).toBeTruthy();
      expect(screen.queryByText('Rest complete', { ignore: '[aria-live]' })).toBeNull();
      advance(2_000);
      expect(screen.queryByRole('timer')).toBeNull();
      const chip = screen.getByText('Rest complete', { ignore: '[aria-live]' });
      expect(chip.getAttribute('role')).toBeNull();
    });

    it('vibrates once at the target only when motion is not reduced', async () => {
      const { vibrate, matchMedia } = stubHaptics(false);
      await completeSetWithFakeTimers();
      advance(89_000);
      expect(vibrate).not.toHaveBeenCalled();
      advance(3_000);
      expect(vibrate).toHaveBeenCalledTimes(1);
      expect(vibrate).toHaveBeenCalledWith(200);
      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
      cleanup();

      vibrate.mockClear();
      matchMedia.mockReturnValue({ matches: true });
      await completeSetWithFakeTimers();
      advance(92_000);
      expect(vibrate).not.toHaveBeenCalled();
    });

    it('renders Undo as a ghost action with a cooldown so a double-tap cannot undo the set just logged', async () => {
      const { onUndo } = await completeSetWithFakeTimers();
      const undo = screen.getByRole('button', { name: 'Undo set' });
      expect(undo.className).toContain('btn-ghost');
      expect(undo.className).not.toContain('btn-gold');
      expect(undo.querySelector('svg.lucide-undo-2')).toBeTruthy();

      fireEvent.click(undo);
      fireEvent.click(undo);
      await flushMicrotasks();
      expect(onUndo).not.toHaveBeenCalled();

      advance(700);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo set' })); });
      await flushMicrotasks();
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onUndo).toHaveBeenCalledWith('set-1');
      expect(screen.getByRole('button', { name: 'Complete set' })).toBeTruthy();
      expect(screen.queryByRole('timer')).toBeNull();
    });

    it('clears the live rest announcement on undo so a repeated completion is announced again', async () => {
      await completeSetWithFakeTimers();
      expect(liveRegion().textContent).toBe('Rest started, 90s target');

      advance(700);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo set' })); });
      await flushMicrotasks();
      expect(liveRegion().textContent).toBe('');

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Complete set' })); });
      await flushMicrotasks();
      expect(liveRegion().textContent).toBe('Rest started, 90s target');
    });
  });

  it('disables edits and conflicting structure controls behind the mutation barrier', () => {
    render(<ExerciseSetLogger disabled exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" onComplete={vi.fn()} />);
    expect((screen.getByLabelText('Weight in kg') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Complete set' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'More exercise options' }).hasAttribute('disabled')).toBe(true);
  });
});
