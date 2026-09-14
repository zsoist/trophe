// @vitest-environment jsdom
//
// Real framer-motion (no mock): the mocked AnimatePresence used by
// workout-route-transition.test.tsx resolves the surface in the same commit, so
// it cannot observe a swap that completes without framer's onAnimationComplete
// (a zero-duration reduced-motion swap or an interrupted exit).
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/dashboard/workout', reduced: false }));

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: () => route.reduced };
});
vi.mock('@/components/workout/workspace/WorkoutWorkspaceHeader', () => ({ WorkoutWorkspaceHeader: () => null }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({
  WorkoutWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkoutWorkspace: () => ({ state: { stage: 'home', draft: null, startRequest: null, retrospectiveRequest: null } }),
}));

import WorkoutLayout from '@/app/dashboard/workout/layout';

function Destination({ name }: { name: string }) {
  return <main aria-label={`${name} landmark`}><h1>{name}</h1></main>;
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
const surface = () => screen.getByTestId('workout-route-transition');

afterEach(() => { cleanup(); route.pathname = '/dashboard/workout'; route.reduced = false; });

describe('workout route transition with real motion', () => {
  it('hands focus to the destination landmark on a normal forward navigation', async () => {
    const view = render(<WorkoutLayout><Destination name="Home" /></WorkoutLayout>);
    route.pathname = '/dashboard/workout/review';
    view.rerender(<WorkoutLayout><Destination name="Review" /></WorkoutLayout>);
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    // The surface is mid-enter: the 220ms tween still has to run.
    expect(surface().getAttribute('style')).toContain('translateX(');
    await settle();
    expect(surface().getAttribute('style')).toContain('transform: none');

    expect(surface().getAttribute('data-route-direction')).toBe('forward');
    expect(document.activeElement).toBe(screen.getByRole('main', { name: 'Review landmark' }));
  });

  it('reports back and hands focus over when reduced motion returns to an already-seen route', async () => {
    route.reduced = true;
    const view = render(<WorkoutLayout><Destination name="Home" /></WorkoutLayout>);
    route.pathname = '/dashboard/workout/review';
    view.rerender(<WorkoutLayout><Destination name="Review" /></WorkoutLayout>);
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('main', { name: 'Review landmark' }));

    // The zero-duration swap never completes a framer animation, so the
    // previous route must not depend on onAnimationComplete to advance.
    route.pathname = '/dashboard/workout';
    view.rerender(<WorkoutLayout><Destination name="Home again" /></WorkoutLayout>);
    await settle();

    expect(surface().getAttribute('data-route-direction')).toBe('back');
    // Reduced motion swaps without any transform.
    expect(surface().getAttribute('style') ?? '').not.toContain('translateX(');
    expect(document.activeElement).toBe(screen.getByRole('main', { name: 'Home again landmark' }));
  });

  it('does not refocus a route that is already focused when only the query changes', async () => {
    route.pathname = '/dashboard/workout/exercises';
    const view = render(<WorkoutLayout><Destination name="Exercises" /></WorkoutLayout>);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    route.pathname = '/dashboard/workout/exercises?replace=bench&return=build';
    view.rerender(<WorkoutLayout><Destination name="Exercises replacement" /></WorkoutLayout>);
    await settle();

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
