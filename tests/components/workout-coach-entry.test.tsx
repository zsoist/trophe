// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/lib/useClientNav', () => ({ useClientNav: () => [] }));
vi.mock('@/components/ui/BotNav', () => ({ BotNav: () => null }));
vi.mock('@/components/assistant/GlobalCoachEntry', () => ({ GlobalCoachEntry: ({ contextSlot }: { contextSlot?: unknown }) => <div data-testid="coach-entry" data-workout-context={String(Boolean(contextSlot))} /> }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceHeader', () => ({ WorkoutWorkspaceHeader: () => null }));
vi.mock('@/components/workout/workspace/WorkoutRouteTransition', () => ({ WorkoutRouteTransition: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({
  WorkoutWorkspaceProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="workout-provider">{children}</div>,
  useWorkoutWorkspace: () => ({ state: { stage: 'home', draft: null, startRequest: null, retrospectiveRequest: null } }),
}));

import { ClientShell } from '@/components/shared/ClientShell';
import WorkoutLayout from '@/app/dashboard/workout/layout';

beforeEach(() => { process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED = '1'; });
afterEach(() => { cleanup(); delete process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED; route.pathname = '/dashboard'; });

it('keeps the dashboard entry outside Workout and delegates Workout to its workspace-owned entry', async () => {
  const shell = render(<ClientShell><main /></ClientShell>);
  expect(screen.getByTestId('coach-entry').dataset.workoutContext).toBe('false');
  shell.unmount();

  route.pathname = '/dashboard/workout/build';
  const view = render(<ClientShell><WorkoutLayout><main /></WorkoutLayout></ClientShell>);
  const entries = await screen.findAllByTestId('coach-entry');
  expect(entries).toHaveLength(1);
  expect(entries[0].dataset.workoutContext).toBe('true');
  expect(screen.getByTestId('workout-provider').contains(entries[0])).toBe(true);
  view.unmount();
});
