// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseMotion } from '@/components/workout/ExerciseMotion';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

const benchMedia: ExerciseMediaRecord = {
  slug: 'bench-press',
  canonicalNames: ['Barbell Bench Press'],
  equipment: ['Barbell'],
  posterSrc: '/workout-v2/exercises/bench-press.webp',
  motionSrc: '/workout-v2/motion/bench-press.webm',
  motionType: 'video/webm',
  tier: 'verified-technique',
  activations: [],
  phases: [],
  provenance: { kind: 'repo-vector', source: 'test', reviewedOn: '2026-09-02' },
};

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ExerciseMotion', () => {
  it('provides a visible pause control for autoplay and pauses the video', () => {
    render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay />);

    fireEvent.click(screen.getByRole('button', { name: /pause demonstration/i }));

    expect(screen.getByTestId('exercise-motion-video')).toHaveProperty('paused', true);
    expect(screen.getByRole('button', { name: /play demonstration/i })).toBeTruthy();
  });

  it('uses only the poster when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" />);

    expect(screen.getByRole('img', { name: 'Bench press demonstration' }).getAttribute('src')).toBe(benchMedia.posterSrc);
    expect(screen.queryByTestId('exercise-motion-video')).toBeNull();
  });
});
