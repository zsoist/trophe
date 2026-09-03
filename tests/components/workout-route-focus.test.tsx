// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/dashboard/workout/build' }));
const workspace = vi.hoisted(() => ({
  state: { stage: 'draft', draft: null, startRequest: null, retrospectiveRequest: null },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const MotionDiv = ReactModule.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const { children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...rest } = props;
    void _initial; void _animate; void _exit; void _transition;
    return ReactModule.createElement('div', { ...rest, ref }, children as React.ReactNode);
  });
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { div: MotionDiv }, useReducedMotion: () => false };
});
vi.mock('@/components/workout/workspace/WorkoutWorkspaceHeader', () => ({ WorkoutWorkspaceHeader: () => null }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({
  WorkoutWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkoutWorkspace: () => workspace,
}));
vi.mock('@/components/workout/workspace/PlanExerciseCard', () => ({ PlanExerciseCard: () => null }));
vi.mock('@/components/workout/workspace/PlanMuscleSummary', () => ({ PlanMuscleSummary: () => null }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import WorkoutLayout from '@/app/dashboard/workout/layout';
import { WorkoutBuilder } from '@/components/workout/workspace/WorkoutBuilder';
import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';

afterEach(() => {
  cleanup();
  route.pathname = '/dashboard/workout/build';
  vi.clearAllMocks();
});

describe('workout route-owned focus', () => {
  it.each([
    ['builder', <WorkoutBuilder key="builder" exercises={[]} onSavePlan={vi.fn()} />],
    ['review', <WorkoutReview key="review" exercises={[]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />],
  ])('does not let the %s surface steal focus during initial hydration', async (_surface, child) => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    render(<WorkoutLayout>{child}</WorkoutLayout>);
    await act(async () => { await Promise.resolve(); });

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
