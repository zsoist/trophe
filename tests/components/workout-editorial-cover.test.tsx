// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkoutEditorialCover, WorkoutEditorialSource } from '@/components/workout/WorkoutEditorialSource';
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
it('keeps product and non-Smith technique media unchanged', () => {
  const view=render(<WorkoutEditorialCover slug="smith-bench-press" canDemonstrate><p>Canonical media</p></WorkoutEditorialCover>);
  expect(screen.getByText('Canonical media')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  view.rerender(<WorkoutEditorialSource.Provider value="/private-editorial"><WorkoutEditorialCover slug="bench-press" canDemonstrate><p>Canonical media</p></WorkoutEditorialCover></WorkoutEditorialSource.Provider>);
  expect(screen.queryByRole('img')).toBeNull();
});
it('mounts canonical media only after explicit private editorial expansion', () => {
  const view=render(<WorkoutEditorialSource.Provider value="/private-editorial"><WorkoutEditorialCover slug="smith-bench-press" canDemonstrate><video data-testid="canonical-video" /></WorkoutEditorialCover></WorkoutEditorialSource.Provider>);
  expect(screen.getByRole('img').getAttribute('srcset')).toContain('768w');
  expect(screen.queryByTestId('canonical-video')).toBeNull();
  const details=view.container.querySelector('details')!;
  details.open=true; fireEvent(details,new Event('toggle'));
  expect(screen.getByTestId('canonical-video')).toBeTruthy();
  details.open=false; fireEvent(details,new Event('toggle'));
  expect(screen.queryByTestId('canonical-video')).toBeNull();
});
it('does not offer a demonstration for ineligible media', () => {
  const view=render(<WorkoutEditorialSource.Provider value="/private-editorial"><WorkoutEditorialCover slug="smith-bench-press" canDemonstrate={false}><p>Unavailable source</p></WorkoutEditorialCover></WorkoutEditorialSource.Provider>);
  expect(screen.getByRole('img')).toBeTruthy();
  expect(view.container.querySelector('details')).toBeNull();
});
