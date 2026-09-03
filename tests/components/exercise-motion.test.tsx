// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
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
    const serverMarkup = renderToString(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" />);
    expect(serverMarkup).toContain('data-testid="exercise-motion-video"');

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    expect(vi.mocked(window.matchMedia)).not.toHaveBeenCalled();

    render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" />);

    return waitFor(() => {
      expect(screen.getByRole('img', { name: 'Bench press demonstration' }).getAttribute('src')).toBe(benchMedia.posterSrc);
      expect(screen.queryByTestId('exercise-motion-video')).toBeNull();
    });
  });

  it.each([
    { name: 'a missing source', media: { ...benchMedia, motionSrc: undefined } },
    { name: 'a non-technique tier', media: { ...benchMedia, tier: 'verified-anatomy' as const } },
  ])('renders an honest poster without technique controls for $name', ({ media }) => {
    render(<ExerciseMotion media={media} alt="Bench press demonstration" autoplay />);

    expect(screen.getByRole('img', { name: 'Bench press demonstration' }).getAttribute('src')).toBe(benchMedia.posterSrc);
    expect(screen.queryByTestId('exercise-motion-video')).toBeNull();
    expect(screen.queryByRole('button', { name: /demonstration/i })).toBeNull();
  });

  it('pauses an exact demonstration when it leaves the viewport or the document is hidden', async () => {
    let notify: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) { notify = callback; }
      disconnect() {}
      observe() {}
    });
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay />);

    notify?.([{ isIntersecting: false }]);
    await waitFor(() => expect(pause).toHaveBeenCalled());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(pause).toHaveBeenCalledTimes(2));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
});
