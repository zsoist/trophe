// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const badgeLocale = vi.hoisted(() => ({ value: 'en' }));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'workout.media_verified_technique': badgeLocale.value === 'es' ? 'Técnica verificada' : 'Verified technique',
      'workout.media_verified_technique_detail': badgeLocale.value === 'es' ? 'Demostración exacta del movimiento y equipamiento' : 'Exact movement and equipment demonstration',
      'workout.media_anatomy_reference': badgeLocale.value === 'es' ? 'Referencia anatómica' : 'Anatomy reference',
      'workout.media_anatomy_reference_detail': badgeLocale.value === 'es' ? 'Funciones musculares verificadas; no es una demostración técnica' : 'Curated muscle roles; not a technique demonstration',
      'workout.media_no_exact_demo': badgeLocale.value === 'es' ? 'Aún no hay demostración exacta' : 'No exact demo yet',
      'workout.media_no_exact_demo_detail': badgeLocale.value === 'es' ? 'Usa las indicaciones del ejercicio y el equipamiento' : 'Use the exercise cues and equipment details',
      'workout.media_group_estimate': badgeLocale.value === 'es' ? 'Estimación por grupo muscular' : 'Muscle group estimate',
      'workout.media_group_estimate_detail': badgeLocale.value === 'es' ? 'Resalta la zona entrenada, no músculos específicos' : 'Highlights the trained area, not specific muscles',
    }[key] ?? key),
  }),
}));
import { ExerciseMediaBadge } from '@/components/workout/ExerciseMediaBadge';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

const exactMedia = { tier: 'verified-technique', motionSrc: '/workout-v2/motion/bench-press.webm' } as ExerciseMediaRecord;

afterEach(() => {
  cleanup();
  badgeLocale.value = 'en';
});

describe('ExerciseMediaBadge', () => {
  it('labels non-technique media honestly', () => {
    render(<ExerciseMediaBadge tier="verified-anatomy" />);
    expect(screen.getByText('Anatomy reference')).toBeTruthy();

    render(<ExerciseMediaBadge tier="honest-fallback" />);
    expect(screen.getByText('No exact demo yet')).toBeTruthy();
  });

  it('labels a muscle-group estimate as a group, never as an anatomy reference', () => {
    render(<ExerciseMediaBadge tier="group-estimate" />);
    const badge = screen.getByText('Muscle group estimate');
    expect(badge.getAttribute('title')).toBe('Highlights the trained area, not specific muscles');
    expect(badge.className).toContain('exercise-media-badge--group-estimate');
    expect(screen.queryByText('Anatomy reference')).toBeNull();
  });

  it('identifies only exact playable media as verified technique', () => {
    render(<ExerciseMediaBadge media={exactMedia} />);
    expect(screen.getByText('Verified technique')).toBeTruthy();
  });

  it('does not claim verified technique from a tier alone', () => {
    render(<ExerciseMediaBadge tier="verified-technique" />);
    expect(screen.getByText('No exact demo yet')).toBeTruthy();
    expect(screen.queryByText('Verified technique')).toBeNull();
  });

  it('does not let a loose verified tier override anatomy media', () => {
    render(<ExerciseMediaBadge tier="verified-technique" media={{ tier: 'verified-anatomy', motionSrc: '/workout-v2/motion/bench-press.webm' }} />);
    expect(screen.getByText('Anatomy reference')).toBeTruthy();
    expect(screen.queryByText('Verified technique')).toBeNull();
  });

  it('routes fallback labels and details through the active locale', () => {
    badgeLocale.value = 'es';
    render(<ExerciseMediaBadge tier="verified-anatomy" />);

    const badge = screen.getByText('Referencia anatómica');
    expect(badge.getAttribute('title')).toBe('Funciones musculares verificadas; no es una demostración técnica');
    expect(document.body.textContent).not.toContain('Anatomy reference');
  });
});
