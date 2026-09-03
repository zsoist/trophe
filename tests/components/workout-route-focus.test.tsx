// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
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

  it('marks only the route destination landmark when moving focus after navigation', async () => {
    const { rerender } = render(
      <WorkoutLayout>
        <main>
          <button type="button">Start workout</button>
        </main>
      </WorkoutLayout>,
    );

    route.pathname = '/dashboard/workout/review';
    rerender(
      <WorkoutLayout>
        <main>
          <button type="button">Start workout</button>
        </main>
      </WorkoutLayout>,
    );
    await act(async () => { await Promise.resolve(); });

    const destination = document.querySelector('main');
    const control = document.querySelector('button');
    expect(destination?.getAttribute('data-workout-route-focus-target')).toBe('true');
    expect(document.activeElement).toBe(destination);
    expect(control?.hasAttribute('data-workout-route-focus-target')).toBe(false);
  });

  it('keeps a visible route landmark outline and the global control focus ring', () => {
    const stylesheet = postcss.parse(readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'));
    const rules = new Map<string, postcss.Rule>();
    stylesheet.walkRules((rule) => {
      rules.set(rule.selector, rule);
    });

    const routeFocusRule = rules.get(
      '.workout-route-transition [data-workout-route-focus-target="true"]:focus-visible',
    );
    const globalFocusRule = rules.get(':focus-visible');
    const declaration = (rule: postcss.Rule | undefined, property: string) =>
      rule?.nodes.find(
        (node): node is postcss.Declaration => node.type === 'decl' && node.prop === property,
      )?.value;

    expect(declaration(routeFocusRule, 'outline')).toBe('2px solid var(--focus-ring)');
    expect(declaration(routeFocusRule, 'outline-offset')).toBe('-2px');
    expect(declaration(globalFocusRule, 'outline')).toBe('2px solid var(--focus-ring)');
  });
});
