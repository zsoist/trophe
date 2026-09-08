// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ExerciseDetailPage from '@/app/dashboard/workout/exercises/[id]/page';
import { screenSelectionSnapshot, publishScreenSelection } from '@/components/assistant/screen-selection';
const state = vi.hoisted(() => ({ id: '00000000-0000-4000-8000-000000000001', reads: new Map<string, (data: unknown) => void>() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: state.id }), usePathname: () => `/dashboard/workout/exercises/${state.id}`, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) }, from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: () => new Promise(resolve => state.reads.set(id, resolve)) }) }) }) } }));
vi.mock('@/components/workout/workspace/RoutedExerciseDetail', () => ({ RoutedExerciseDetail: ({ exercise }: { exercise: { name: string } }) => <p>{exercise.name}</p> }));
afterEach(() => { cleanup(); publishScreenSelection(null)(); vi.unstubAllEnvs(); state.reads.clear(); });
it('publishes only the loaded exercise and clears immediately while another route loads or fails', async () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED', '1');
  const first = state.id;
  const view = render(<ExerciseDetailPage />);
  expect(screenSelectionSnapshot()).toBeNull();
  await act(async () => state.reads.get(first)!({ data: { id: first, name: 'Bench' }, error: null }));
  expect(screenSelectionSnapshot()).toMatchObject({ actorId: 'actor', entity: { id: first }, label: 'Bench' });
  state.id = '00000000-0000-4000-8000-000000000002';
  view.rerender(<ExerciseDetailPage />);
  expect(screenSelectionSnapshot()).toBeNull();
  expect(screen.queryByText('Bench')).toBeNull();
  await act(async () => state.reads.get(state.id)!({ data: null, error: null }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screenSelectionSnapshot()).toBeNull();
});
