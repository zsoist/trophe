// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExerciseMediaBadge } from '@/components/workout/ExerciseMediaBadge';

describe('ExerciseMediaBadge', () => {
  it('labels non-technique media honestly', () => {
    render(<ExerciseMediaBadge tier="verified-anatomy" />);
    expect(screen.getByText('Anatomy reference')).toBeTruthy();

    render(<ExerciseMediaBadge tier="honest-fallback" />);
    expect(screen.getByText('No exact demo yet')).toBeTruthy();
  });

  it('identifies exact media as verified technique', () => {
    render(<ExerciseMediaBadge tier="verified-technique" />);
    expect(screen.getByText('Verified technique')).toBeTruthy();
  });
});
