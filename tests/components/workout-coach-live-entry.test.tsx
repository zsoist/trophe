// @vitest-environment jsdom

import React, { useState, useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { PreferenceController } from '@/components/assistant/preference-state';
import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import type { CoachContextSlot } from '@/components/assistant/GlobalCoach';

const actor = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000099';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
vi.mock('@/components/assistant/GlobalCoachEntry', () => ({
  GlobalCoachEntry: ({ contextSlot }: { contextSlot?: CoachContextSlot }) => {
    const [controller] = useState(() => new PreferenceController());
    const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
    return contextSlot?.({ identity: actor, controller, state, conversationId, transport: async () => { throw new Error('HTTP transport must not own the local draft'); } });
  },
}));

import { WorkoutCoachEntry } from '@/components/workout/workspace/WorkoutCoachEntry';

afterEach(cleanup);

function DraftHarness() {
  const workspace = useWorkoutWorkspace();
  return <>
    <button onClick={() => { workspace.createDraft({ name: 'Push', kind: 'strength' }); workspace.addDraftExercise('bench-press'); }}>Create draft</button>
    <output data-testid="draft">{workspace.state.draft?.name}:{workspace.state.draft?.kind === 'strength' ? workspace.state.draft.exercises[0]?.targetSets : ''}</output>
    <WorkoutCoachEntry />
  </>;
}

it('starts and applies a reviewed proposal from the real Workout-owned entry', async () => {
  render(<I18nProvider defaultLang="en"><WorkoutWorkspaceProvider userId={actor} storage={{ getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }}><DraftHarness /></WorkoutWorkspaceProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Draft name' }), { target: { value: '35-minute dumbbell workout' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sets for each exercise' }), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review draft change' }));
  expect(await screen.findByRole('button', { name: 'Confirm change' })).toBeTruthy();
  expect(screen.getByTestId('draft').textContent).toBe('Push:3');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Updated in your private Workout draft.');
  expect(screen.getByTestId('draft').textContent).toBe('35-minute dumbbell workout:2');
});
