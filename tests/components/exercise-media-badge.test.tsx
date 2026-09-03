// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExerciseMediaBadge } from '@/components/workout/ExerciseMediaBadge';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

const exactMedia = { tier: 'verified-technique', motionSrc: '/workout-v2/motion/bench-press.webm' } as ExerciseMediaRecord;

afterEach(cleanup);

describe('ExerciseMediaBadge', () => {
  it('labels non-technique media honestly', () => {
    render(<ExerciseMediaBadge tier="verified-anatomy" />);
    expect(screen.getByText('Anatomy reference')).toBeTruthy();

    render(<ExerciseMediaBadge tier="honest-fallback" />);
    expect(screen.getByText('No exact demo yet')).toBeTruthy();
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
});
