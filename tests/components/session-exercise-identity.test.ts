// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', props),
}));

import SessionExerciseIdentity from '@/components/workout/SessionExerciseIdentity';

describe('SessionExerciseIdentity', () => {
  it('shows the movement, useful context, and one clear expand control', () => {
    const onToggle = vi.fn();
    render(React.createElement(SessionExerciseIdentity, {
      name: 'Bench Press',
      exerciseName: 'Bench Press',
      equipment: 'Barbell',
      setCount: 3,
      lastPerformance: '80kg × 8',
      expanded: true,
      onToggle,
    }));

    expect(screen.getByRole('img', { name: 'Bench Press movement' })).toBeTruthy();
    expect(screen.getByText('3 sets · Barbell')).toBeTruthy();
    expect(screen.getByText('Last 80kg × 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Bench Press' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
