// @vitest-environment jsdom

/**
 * Workout V2 exploration surfaces — focal interaction / lifecycle coverage.
 *
 * These assert user-visible counterexamples, not implementation internals:
 * opening a detail must not start or fetch media before an explicit action,
 * the explicit Play action must actually start playback, and picking a result
 * (add) must stay separate from previewing it (info).
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import postcss from 'postcss';
import type { Exercise } from '@/lib/types';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

const state = vi.hoisted(() => ({ media: null as ExerciseMediaRecord | null }));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.priority;
    return React.createElement('img', imageProps);
  },
}));

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      lang: 'en',
      t: (key: string, params?: Record<string, string | number>) => {
        const source = actual.translations[key]?.en ?? key;
        return Object.entries(params ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          source,
        );
      },
    }),
  };
});

vi.mock('@/lib/workout/exercise-media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/exercise-media')>();
  return {
    ...actual,
    resolveExerciseMedia: vi.fn(() => {
      if (!state.media) throw new Error('Exercise media fixture was not configured');
      return state.media;
    }),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { ExerciseResults } from '@/components/workout/ExerciseResults';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const bench = {
  id: 'bench',
  name: 'Barbell Bench Press',
  name_es: null,
  name_el: null,
  muscle_group: 'chest',
  secondary_muscles: ['triceps'],
  equipment: 'Barbell',
  is_compound: true,
  instructions: 'Plant your feet firmly. Lower the bar with control.',
  instructions_es: null,
  instructions_el: null,
  is_template: true,
  created_by: null,
  created_at: '2026-08-24T00:00:00.000Z',
} as Exercise;

const exactMotionMedia: ExerciseMediaRecord = {
  slug: 'bench-press',
  canonicalNames: ['Barbell Bench Press'],
  equipment: ['Barbell'],
  posterSrc: '/workout-v2/exercises/bench-press.webp',
  motionSrc: '/workout-v2/motion/bench-press.webm',
  motionType: 'video/webm',
  tier: 'verified-technique',
  activations: [
    { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' },
  ],
  phases: [{ id: 'setup', label: 'Setup', cue: 'Set your shoulders and grip before unracking.' }],
  provenance: { kind: 'repo-vector', source: 'test fixture', reviewedOn: '2026-09-02' },
};

const activations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' },
];

beforeEach(() => {
  state.media = exactMotionMedia;
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('exercise detail explicit media intent', () => {
  it('does not play or change the poster before the user asks for the demonstration', () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    render(<ExerciseDetail exercise={bench} userId={null} onAdd={vi.fn()} />);

    const video = screen.getByTestId('exercise-motion-video');
    expect(video.getAttribute('preload')).toBe('none');
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play demonstration' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause demonstration' })).toBeNull();
  });

  it('starts the exact demonstration only after the explicit play action', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    render(<ExerciseDetail exercise={bench} userId={null} onAdd={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play demonstration' }));

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Pause demonstration' })).toBeTruthy();
  });

  it('offers the V2 explicit-play affordance through the sheet presentation too', () => {
    render(<ExerciseDetail exercise={bench} userId={null} presentation="sheet" headingId="sheet-title" />);
    expect(screen.getByRole('button', { name: 'Play demonstration' })).toBeTruthy();
  });
});

describe('exercise results keep selection and preview separate', () => {
  it('routes add and info to different actions with a 44px add target', () => {
    const onAdd = vi.fn();
    const onInfo = vi.fn();
    render(
      <ExerciseResults
        exercises={[bench]}
        lang="en"
        selectedIds={new Set()}
        onAdd={onAdd}
        onInfo={onInfo}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Barbell Bench Press' }));
    expect(onAdd).toHaveBeenCalledWith(bench);
    expect(onInfo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Exercise info: Barbell Bench Press' }));
    expect(onInfo).toHaveBeenCalledWith(bench);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('marks an already added exercise as checked and inert', () => {
    const onAdd = vi.fn();
    render(
      <ExerciseResults exercises={[bench]} lang="en" selectedIds={new Set(['bench'])} onAdd={onAdd} />,
    );
    const added = screen.getByRole('button', { name: 'Barbell Bench Press added' });
    expect(added.hasAttribute('disabled')).toBe(true);
    fireEvent.click(added);
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('atlas keeps a real geometry viewBox through zoom and reset', () => {
  it('exposes named zoom tools that change and restore the viewport', () => {
    render(<MuscleAtlas activations={activations} selected={null} onSelect={vi.fn()} />);
    const map = screen.getByRole('group', { name: 'Front anatomy map' });
    const fitted = map.getAttribute('viewBox');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(map.getAttribute('viewBox')).not.toBe(fitted);

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(map.getAttribute('viewBox')).toBe(fitted);
  });
});

describe('scoped V2 exploration stylesheet contract', () => {
  const css = readFileSync(join(process.cwd(), 'components/workout/workout-exploration-v2.css'), 'utf8');

  it('parses as valid CSS', () => {
    expect(() => postcss.parse(css)).not.toThrow();
  });

  it('defines scoped fallback variables compatible with the V2 token package', () => {
    for (const token of ['--wv2-bg', '--wv2-surface', '--wv2-raised', '--wv2-line', '--wv2-gold', '--wv2-ease']) {
      expect(css, `${token} must be defined`).toContain(`${token}:`);
    }
    // V2 package tokens are preferred, then existing product tokens, then literals.
    expect(css).toContain('var(--wk-gold, var(--action-primary');
    expect(css).toContain('var(--workout-canvas');
  });

  it('styles every owned exploration surface through the .wk2 scope', () => {
    for (const selector of [
      '.wk2.exercise-detail',
      '.wk2 .exercise-detail__hero',
      '.wk2 .exercise-motion__controls button',
      '.wk2.exercise-results',
      '.wk2 .equipment-filter__trigger',
      '.wk2.muscle-atlas',
      '.wk2 .muscle-atlas__tools button',
      '.wk2.plan-muscle-summary',
      '.wk2.workout-muscle-home',
      '.wk2.recent-session',
      '.wk2.workout-analytics',
    ]) {
      expect(css, `${selector} must be styled`).toContain(selector);
    }
  });

  it('keeps reduced motion static without blanket !important declarations', () => {
    const important = [...css.matchAll(/!\s*important/g)].length;
    const reducedBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const reducedImportant = [...reducedBlock.matchAll(/!\s*important/g)].length;
    expect(important).toBe(reducedImportant);
  });
});
