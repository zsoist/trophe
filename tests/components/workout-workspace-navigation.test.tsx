// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

let pathname = WORKOUT_ROUTES.live;

vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({
  useWorkoutWorkspace: () => ({ state: { stage: 'home' } }),
}));

import { WorkoutWorkspaceHeader } from '@/components/workout/workspace/WorkoutWorkspaceHeader';

afterEach(cleanup);

describe('workout workspace navigation', () => {
  it('maps workspace stages to their routed workspaces', () => {
    expect(WORKOUT_ROUTES).toEqual({
      home: '/dashboard/workout',
      build: '/dashboard/workout/build',
      review: '/dashboard/workout/review',
      live: '/dashboard/workout/live',
      exercises: '/dashboard/workout/exercises',
    });
    expect(workoutRouteForStage('draft')).toBe(WORKOUT_ROUTES.build);
    expect(workoutRouteForStage('review')).toBe(WORKOUT_ROUTES.review);
    expect(workoutRouteForStage('live')).toBe(WORKOUT_ROUTES.live);
    expect(workoutRouteForStage('paused')).toBe(WORKOUT_ROUTES.live);
    expect(workoutRouteForStage('completed')).toBe(WORKOUT_ROUTES.home);
  });

  it('renders a labeled Back action, the title, Workout Home, and live status', () => {
    pathname = WORKOUT_ROUTES.live;
    render(<WorkoutWorkspaceHeader stage="live" />);

    expect(screen.getByRole('link', { name: /Back/i }).getAttribute('href')).toBe(WORKOUT_ROUTES.home);
    expect(screen.getByRole('heading', { name: 'Live Workout' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Workout Home' }).getAttribute('href')).toBe(WORKOUT_ROUTES.home);
    expect(screen.getByText('Live')).toBeTruthy();
  });
});
