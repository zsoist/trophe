// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/dashboard/workout', reduced: false }));

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const MotionDiv = ReactModule.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const { children, initial, animate, exit, transition, ...rest } = props;
    return ReactModule.createElement('div', {
      ...rest, ref,
      'data-motion-initial': JSON.stringify(initial),
      'data-motion-animate': JSON.stringify(animate),
      'data-motion-exit': JSON.stringify(exit),
      'data-motion-transition': JSON.stringify(transition),
    }, children as React.ReactNode);
  });
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { div: MotionDiv }, useReducedMotion: () => route.reduced };
});
vi.mock('@/components/workout/workspace/WorkoutWorkspaceHeader', () => ({ WorkoutWorkspaceHeader: () => null }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ WorkoutWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children }));

import WorkoutLayout from '@/app/dashboard/workout/layout';

function Destination({ name }: { name: string }) {
  return <main aria-label={`${name} landmark`}><h1>{name}</h1></main>;
}

afterEach(() => { cleanup(); route.pathname = '/dashboard/workout'; route.reduced = false; vi.restoreAllMocks(); });

describe('workout route transition', () => {
  it('does not steal focus on hydration, then uses one brief right-to-left forward transition and focuses the destination landmark', async () => {
    const outside = document.createElement('button');
    document.body.append(outside); outside.focus();
    const view = render(<WorkoutLayout><Destination name="Workout home" /></WorkoutLayout>);
    expect(document.activeElement).toBe(outside);

    route.pathname = '/dashboard/workout/exercises';
    await act(async () => { view.rerender(<WorkoutLayout><Destination name="Exercises" /></WorkoutLayout>); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const transition = screen.getByTestId('workout-route-transition');
    expect(transition.getAttribute('data-route-direction')).toBe('forward');
    expect(transition.getAttribute('data-motion-initial')).toContain('"x":18');
    expect(transition.getAttribute('data-motion-transition')).toContain('"duration":0.22');
    expect(document.activeElement).toBe(screen.getByRole('main', { name: 'Exercises landmark' }));
    outside.remove();
  });

  it('moves from the left for back/home and swaps immediately without transform under reduced motion', async () => {
    route.pathname = '/dashboard/workout/review';
    const view = render(<WorkoutLayout><Destination name="Review" /></WorkoutLayout>);
    route.pathname = '/dashboard/workout';
    route.reduced = true;
    await act(async () => { view.rerender(<WorkoutLayout><Destination name="Workout home" /></WorkoutLayout>); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const transition = screen.getByTestId('workout-route-transition');
    expect(transition.getAttribute('data-route-direction')).toBe('back');
    expect(transition.getAttribute('data-motion-initial')).toBe('false');
    expect(transition.getAttribute('data-motion-exit')).toBeNull();
    expect(transition.getAttribute('data-motion-transition')).toContain('"duration":0');
  });
});
