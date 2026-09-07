// @vitest-environment jsdom
import React, { useState, useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { PreferenceController, type PreferenceTransport } from '@/components/assistant/preference-state';
import { createPreferenceStore } from '@/agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { PrivateDraftControls } from '../../tools/anatomy/workout-review/draft-controls';
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
      <button onClick={() => workspace.updateDraftName('Manual')}>Manual edit</button>
      <output data-testid="actual">{workspace.state.draft?.name}:{workspace.state.draft?.kind === 'strength' ? workspace.state.draft.exercises[0]?.targetSets : ''}</output>
      <PrivateDraftControls controller={controller} state={state} conversationId={conversationId} transport={transport} /></>;
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
  expect(screen.getByText('After: Reviewed push')).toBeTruthy();
  expect(screen.getByText(/3 → 2 sets/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Updated in your private Workout draft.');
  expect(screen.getByTestId('actual').textContent).toBe('Reviewed push:2');
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
