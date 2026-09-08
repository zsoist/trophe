// @vitest-environment jsdom
import React, { useState, useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { PreferenceController, type PreferenceTransport } from '@/components/assistant/preference-state';
import { createPreferenceStore } from '@/agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { WorkoutDraftCoachControls } from '@/components/assistant/WorkoutDraftCoachControls';
import { hashWorkspace } from '../../tools/anatomy/workout-review/preferences';
import { REVIEW_USER } from '../../tools/anatomy/workout-review/store';
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
afterEach(cleanup);
const conversationId = '00000000-0000-4000-8000-000000000099';
function mount(lost = false) {
  const store = createPreferenceStore([{ actorId: REVIEW_USER, subjectId: REVIEW_USER, organizationId: 'example', preferences: defaultWorkoutPreferences }], { hash: hashWorkspace, id: () => crypto.randomUUID() });
  const calls: Parameters<PreferenceTransport>[0][] = [];
  const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
  function Harness() {
    const workspace = useWorkoutWorkspace();
    const [controller] = useState(() => new PreferenceController());
    const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
    const transport: PreferenceTransport = async (operation, signal) => {
      store.bindWorkspace(REVIEW_USER, REVIEW_USER, workspace.state);
      calls.push(operation);
      const result = store.execute(REVIEW_USER, operation, signal);
      if (lost && operation.operation === 'apply') { lost = false; throw new Error('Lost response after commit'); }
      return result;
    };
    return <><button onClick={() => { workspace.createDraft({ name: 'Push', kind: 'strength' }); workspace.addDraftExercise('bench-press'); }}>Create draft</button>
      <button onClick={() => {
        const draft = workspace.state.draft;
        if (!draft || draft.kind !== 'strength') return;
        void controller.proposeDraft(conversationId, hashWorkspace(workspace.state), {
          ...structuredClone(draft), name: '35-minute dumbbell workout', updatedAt: Date.now(),
          exercises: draft.exercises.map(exercise => ({ ...exercise, exerciseId: 'dumbbell-bench-press', exerciseName: 'Dumbbell bench press', targetSets: 4, restSeconds: 60 })),
        }, transport);
      }}>Ask for 35-minute dumbbells</button>
      <button onClick={() => workspace.updateDraftName('Manual')}>Manual edit</button>
      <output data-testid="actual">{workspace.state.draft?.name}:{workspace.state.draft?.kind === 'strength' ? workspace.state.draft.exercises[0]?.targetSets : ''}</output>
      <WorkoutDraftCoachControls identity={REVIEW_USER} controller={controller} state={state} conversationId={conversationId} transport={transport} allowDirectProposal /></>;
  }
  render(<I18nProvider defaultLang="en"><WorkoutWorkspaceProvider userId={REVIEW_USER} storage={storage}><Harness /></WorkoutWorkspaceProvider></I18nProvider>);
  return { calls, store };
}
async function propose() {
  fireEvent.click(await screen.findByRole('button', { name: 'Create draft' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft name' }), { target: { value: 'Reviewed push' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sets for each exercise' }), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review draft change' }));
  await screen.findByRole('button', { name: 'Confirm change' });
}
it('reviews canonical name and sets before updating the actual shared draft', async () => {
  const { calls } = mount(); await propose();
  expect(screen.getByTestId('actual').textContent).toBe('Push:3');
  expect(screen.getByRole('region', { name: 'Before' }).textContent).toContain('Push');
  expect(screen.getByRole('region', { name: 'After' }).textContent).toContain('Reviewed push');
  expect(screen.getByText('Suggested by Ask Trophē · only this Workout draft will change.')).toBeTruthy();
  expect(screen.getByText(/3 → 2 sets/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Updated in your private Workout draft.');
  expect(screen.getByTestId('actual').textContent).toBe('Reviewed push:2');
  expect(calls.map(call => call.operation)).toEqual(['propose', 'apply']);
});
it('shows the exact 35-minute dumbbell alternative, source and impact before confirmation', async () => {
  const { calls } = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ask for 35-minute dumbbells' }));
  await screen.findByRole('button', { name: 'Confirm change' });
  expect(screen.getByRole('region', { name: 'Before' }).textContent).toContain('bench-press · 3 × 8-12');
  expect(screen.getByRole('region', { name: 'After' }).textContent).toContain('35-minute dumbbell workout');
  expect(screen.getByRole('region', { name: 'After' }).textContent).toContain('Dumbbell bench press · 4 × 8-12 · 60s rest');
  expect(screen.getByText(/Impact: Dumbbell bench press 3 → 4 sets/)).toBeTruthy();
  expect(screen.getByText('Suggested by Ask Trophē · only this Workout draft will change.')).toBeTruthy();
  expect(screen.getByTestId('actual').textContent).toBe('Push:3');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Updated in your private Workout draft.');
  expect(screen.getByTestId('actual').textContent).toBe('35-minute dumbbell workout:4');
  expect(calls.map(call => call.operation)).toEqual(['propose', 'apply']);
});
it('keeps manual edits and never claims an old proposal was applied', async () => {
  const { calls } = mount(); await propose();
  fireEvent.click(screen.getByRole('button', { name: 'Manual edit' }));
  await screen.findByText('Your draft changed. Review a new proposal before applying.');
  expect(screen.queryByRole('button', { name: 'Confirm change' })).toBeNull();
  expect(screen.getByTestId('actual').textContent).toBe('Manual:3');
  expect(calls.map(call => call.operation)).toEqual(['propose']);
});
it('recovers a lost receipt once and applies only the still-current workspace', async () => {
  const { calls } = mount(true); await propose();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Check change status' }));
  await waitFor(() => expect(screen.getByTestId('actual').textContent).toBe('Reviewed push:2'));
  await screen.findByText('Updated in your private Workout draft.');
  expect(calls.map(call => call.operation)).toEqual(['propose', 'apply', 'receipt']);
  expect(calls[2]).toMatchObject({ actionId: (calls[1] as { actionId: string }).actionId });
});
it('can resolve an uncertain receipt after a manual edit without replacing that edit', async () => {
  const { calls } = mount(true); await propose();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByRole('button', { name: 'Check change status' });
  fireEvent.click(screen.getByRole('button', { name: 'Manual edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check change status' }));
  await screen.findByText('Your draft changed. Review a new proposal before applying.');
  expect(screen.getByTestId('actual').textContent).toBe('Manual:3');
  expect(screen.queryByText('Updated in your private Workout draft.')).toBeNull();
  expect(calls.map(call => call.operation)).toEqual(['propose', 'apply', 'receipt']);
});
