// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '@/lib/types';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

const detailState = vi.hoisted(() => ({
  lang: 'en',
  media: null as ExerciseMediaRecord | null,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.priority;
    return React.createElement('img', imageProps);
  },
}));

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  const [{ de }, { fr }, { it }, { nl }, { pt }] = await Promise.all([
    import('@/lib/locales/de'),
    import('@/lib/locales/fr'),
    import('@/lib/locales/it'),
    import('@/lib/locales/nl'),
    import('@/lib/locales/pt'),
  ]);
  const overlays: Record<string, Record<string, string>> = { de, fr, it, nl, pt };
  return {
    ...actual,
    useI18n: () => ({
      lang: detailState.lang,
      t: (key: string, params?: Record<string, string | number>) => {
        const core = detailState.lang === 'en' || detailState.lang === 'es' || detailState.lang === 'el'
          ? detailState.lang
          : null;
        const source = (core ? actual.translations[key]?.[core] : overlays[detailState.lang]?.[key])
          ?? actual.translations[key]?.en
          ?? key;
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
      if (!detailState.media) throw new Error('Exercise media fixture was not configured');
      return detailState.media;
    }),
  };
});

vi.mock('@/lib/workout/units', () => ({
  useWeightUnit: () => ['kg'],
  kgToDisplay: (value: number) => value,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { translations } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as italian } from '@/lib/locales/it';
import { nl } from '@/lib/locales/nl';
import { pt } from '@/lib/locales/pt';

const bench = {
  id: 'bench',
  name: 'Barbell Bench Press',
  name_es: null,
  name_el: null,
  muscle_group: 'chest',
  secondary_muscles: ['triceps'],
  equipment: 'Barbell',
  is_compound: true,
  instructions: 'Plant your feet firmly. Lower the bar with control. Exhale as you press. Avoid lifting your shoulders.',
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
    { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front' },
    { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front' },
    { id: 'rotator-cuff', label: 'Rotator cuff', role: 'stabilizer', view: 'back' },
  ],
  phases: [
    { id: 'setup', label: 'Setup', cue: 'Set your shoulders and grip before unracking.' },
    { id: 'work', label: 'Work', cue: 'Lower and press the bar with control.' },
    { id: 'finish', label: 'Finish', cue: 'Lock out safely and rerack the bar.' },
  ],
  provenance: { kind: 'repo-vector', source: 'test fixture', reviewedOn: '2026-09-02' },
};

const DETAIL_COPY_KEYS = [
  'workout.detail_instruction_title',
  'workout.detail_phase_label',
  'workout.detail_phase_setup',
  'workout.detail_phase_work',
  'workout.detail_phase_finish',
  'workout.detail_phase_setup_action',
  'workout.detail_phase_work_action',
  'workout.detail_phase_finish_action',
  'workout.detail_phase_setup_cue',
  'workout.detail_phase_work_cue',
  'workout.detail_phase_finish_cue',
  'workout.detail_fallback_poster_alt',
  'workout.detail_equipment_setup',
  'workout.detail_equipment_label',
  'workout.detail_technique_title',
  'workout.detail_evidence_title',
  'workout.detail_english_guidance',
  'workout.detail_no_anatomy',
  'workout.detail_history_loading',
  'workout.detail_history_retry',
  'workout.detail_close',
  'workout.motion_pause',
  'workout.motion_play',
  'workout.motion_playing',
  'workout.motion_paused',
  'workout.motion_reduced',
  'workout.motion_anatomy_only',
  'workout.motion_no_exact',
  'workout.motion_session_paused',
  'workout.motion_session_paused_action',
] as const;

beforeEach(() => {
  detailState.lang = 'en';
  detailState.media = exactMotionMedia;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('premium exercise detail', () => {
  it('leads with truthful controlled motion, then phases, named anatomy, setup, guidance, evidence, and action', () => {
    render(<ExerciseDetail exercise={bench} userId={null} onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Pause demonstration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Setup phase' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Work phase' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish phase' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pectoralis major, primary muscle$/i })).toBeTruthy();
    expect(screen.getAllByText('Pectoralis major').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Primary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Barbell')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Equipment & setup' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Technique guidance' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Training evidence' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Barbell Bench Press' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Work phase' }));
    expect(screen.getByText('Lower and press the bar with control.')).toBeTruthy();
  });

  it('keeps anatomy-only media static and never calls it a technique demonstration', () => {
    detailState.media = {
      ...exactMotionMedia,
      slug: 'honest-fallback',
      tier: 'verified-anatomy',
      motionSrc: undefined,
      motionType: undefined,
      posterSrc: '/workout-v2/body-areas/chest.webp',
    };

    render(<ExerciseDetail exercise={{ ...bench, id: 'landmine', name: 'Landmine Press' }} userId={null} />);

    expect(screen.getByText('Anatomy reference')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /demonstration/i })).toBeNull();
    expect(document.body.textContent).not.toContain('Technique demonstration');
  });

  it('visibly identifies English instruction fallback when localized exercise guidance is absent', () => {
    detailState.lang = 'es';
    render(<ExerciseDetail exercise={bench} userId={null} />);

    expect(screen.getByText('Indicaciones disponibles en inglés')).toBeTruthy();
    expect(screen.getByText('Plant your feet firmly.')).toBeTruthy();
  });

  it('shows an explicit anatomy empty state when no curated activations exist', () => {
    detailState.media = {
      ...exactMotionMedia,
      slug: 'honest-fallback',
      tier: 'honest-fallback',
      motionSrc: undefined,
      motionType: undefined,
      activations: [],
      posterSrc: '/workout-v2/body-areas/full-body.webp',
    };

    render(<ExerciseDetail exercise={{ ...bench, id: 'custom', name: 'Custom Press', muscle_group: 'full_body' }} userId={null} />);

    expect(screen.getByText('No verified muscle map is available yet.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Muscle activation atlas' })).toBeNull();
  });

  it('ships every new visible and aria string in all eight locale dictionaries', () => {
    const dictionaries: Record<string, Record<string, string | undefined>> = {
      en: Object.fromEntries(Object.entries(translations).map(([key, value]) => [key, value.en])),
      es: Object.fromEntries(Object.entries(translations).map(([key, value]) => [key, value.es])),
      el: Object.fromEntries(Object.entries(translations).map(([key, value]) => [key, value.el])),
      de,
      fr,
      it: italian,
      nl,
      pt,
    };

    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      for (const key of DETAIL_COPY_KEYS) {
        expect(dictionary[key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });
});
