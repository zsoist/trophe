// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { ContextCards } from '@/components/assistant/ContextCards';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { PreferenceController } from '@/components/assistant/preference-state';
import type { CoachActionResult, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import { createPreferenceStore } from '@/agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout' }));
const actor = '00000000-0000-4000-8000-000000000001';
const conversation = '00000000-0000-4000-8000-000000000002';
function fixture() {
  const store = createPreferenceStore([{ actorId: actor, subjectId: actor, organizationId: 'example', preferences: { ...defaultWorkoutPreferences }, memories: [{ id: '00000000-0000-4000-8000-000000000010', text: 'I prefer mornings.', source: 'agent_inference', createdAt: '2026-09-06T12:00:00Z', scope: 'user', confirmation: 'unconfirmed', version: 'memory-v1' }] }], { hash: value => bytesToHex(sha256(utf8ToBytes(JSON.stringify(value)))), id: () => crypto.randomUUID() });
  const transport = vi.fn(async (operation: unknown, _signal: AbortSignal) => { void _signal; return store.execute(actor, operation); });
  return { store, transport };
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('reviews before applying and displays an actual isolated receipt without changing the fixture until confirmation', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const { store, transport } = fixture();
  const profile = store.read(actor, actor)!;
  const body: Omit<CoachConversationResponse, 'conversationId' | 'turnId'> = {
    version: 'coach-assistant.v2', ok: true, mode: 'offline', dataSource: 'synthetic',
    snapshot: { id: 'snapshot', capturedAt: '2026-09-07T04:00:00Z', subjectId: actor, organizationId: 'example', actorRole: 'client', access: 'self', scopeKey: 'a'.repeat(64), surface: 'workout', screenIncluded: true, window: { start: '2026-09-07', end: '2026-09-07', days: 1, timezone: 'UTC' }, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, capabilities: [{ key: 'actions', status: 'available', reason: 'isolated_ephemeral' }] },
    profile: { language: 'en', timezone: 'UTC', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, preferences: { durationMinutes: 30 }, version: profile.version, source: 'isolated_fixture' },
    output: { answer: 'Your current records.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    memories: profile.memories, evidence: [], proposals: [], receipts: [], attachments: [], telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
  };
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} example={async request => ({ ...body, conversationId: request.conversationId, turnId: request.turnId })} preferenceTransport={transport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My profile' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Your current records.');
  fireEvent.click(screen.getByText('Your profile & memory'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Workout duration' }), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  await screen.findByText('Change your usual workout from 30 to 20 minutes.');
  expect(store.read(actor, actor)?.preferences.durationMinutes).toBe(30);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Updated in this isolated preview. Account settings were not changed.');
  expect(store.read(actor, actor)?.preferences.durationMinutes).toBe(20);
  expect(transport.mock.calls.map(call => (call[0] as { operation: string }).operation)).toEqual(['propose', 'apply']);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm memory' }));
  await screen.findByRole('button', { name: 'Confirm change' });
  expect(store.read(actor, actor)!.memories[0].confirmation).toBe('unconfirmed');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Not confirmed by you')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit memory' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Corrected memory' }), { target: { value: 'I prefer evenings.' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Review change' }).at(-1)!);
  await screen.findByText('After: I prefer evenings.');
  expect(store.read(actor, actor)!.memories[0].text).toBe('I prefer mornings.');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Confirmed by you');
  expect(store.read(actor, actor)!.memories[0]).toMatchObject({ text: 'I prefer evenings.', source: 'agent_inference', createdAt: '2026-09-06T12:00:00Z' });
  expect(screen.getByText('Typical workout: 20 minutes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Delete memory' }));
  await screen.findByRole('button', { name: 'Confirm change' });
  expect(store.read(actor, actor)!.memories).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('No memories in this context.');
  expect(store.read(actor, actor)!.memories).toHaveLength(0);
  expect(screen.getByText('Typical workout: 20 minutes')).toBeTruthy();

});

it('queries the same action receipt after a lost apply response and never resubmits the write', async () => {
  const { store, transport } = fixture(); const controller = new PreferenceController();
  await controller.propose(conversation, store.read(actor, actor)!.version, 20, transport);
  const lost = vi.fn(async (operation: unknown) => { store.execute(actor, operation); throw new Error('Connection lost after commit'); });
  await controller.apply(conversation, lost);
  expect(store.read(actor, actor)?.preferences.durationMinutes).toBe(20);
  expect(controller.snapshot().uncertain).toBe(true);
  await controller.apply(conversation, lost);
  expect(lost).toHaveBeenCalledTimes(1);
  await controller.check(transport);
  expect(controller.snapshot()).toMatchObject({ uncertain: false, receipt: { status: 'applied' } });
  expect((transport.mock.calls.at(-1)![0] as { operation: string }).operation).toBe('receipt');
});

it('keeps the original receipt lookup after a new conversation but discards an unconfirmed proposal', async () => {
  const { store, transport } = fixture();
  const controller = new PreferenceController();
  await controller.propose(conversation, store.read(actor, actor)!.version, 20, transport);
  controller.moveConversation();
  expect(controller.snapshot()).toMatchObject({ proposal: null, uncertain: false });

  await controller.propose(conversation, store.read(actor, actor)!.version, 20, transport);
  const lost = vi.fn(async (operation: unknown) => { store.execute(actor, operation); throw new Error('Connection lost after commit'); });
  await controller.apply(conversation, lost);
  controller.moveConversation();
  expect(controller.snapshot()).toMatchObject({ uncertain: true, proposal: { action: 'preference.update' } });
  await controller.check(transport);
  expect(controller.snapshot()).toMatchObject({ uncertain: false, receipt: { status: 'applied' } });
  expect(transport.mock.calls.at(-1)![0]).toMatchObject({ operation: 'receipt', conversationId: conversation });
});

it('keeps cancelled apply uncertain and discards a late receipt after identity reset', async () => {
  const { store, transport } = fixture(); const controller = new PreferenceController();
  await controller.propose(conversation, store.read(actor, actor)!.version, 20, transport);
  let settle!: (result: CoachActionResult) => void;
  const apply = vi.fn((operation: unknown, _signal: AbortSignal) => { void _signal; const receipt = store.execute(actor, operation); return new Promise<CoachActionResult>(resolve => { settle = () => resolve(receipt); }); });
  void controller.apply(conversation, apply); controller.cancel();
  expect(controller.snapshot().uncertain).toBe(true); expect(apply.mock.calls[0][1].aborted).toBe(true);
  controller.reset(); await act(async () => settle({} as CoachActionResult));
  expect(controller.snapshot()).toMatchObject({ receipt: null, proposal: null, pending: false, uncertain: false });
});

it('recovers a lost deletion receipt with its null version and keeps deleted context invalidated after dismissal', async () => {
  const { store, transport } = fixture(); const controller = new PreferenceController();
  const memory = store.read(actor, actor)!.memories[0];
  await controller.proposeMemory(conversation, memory, { action: 'memory.delete' }, transport);
  const lost = vi.fn(async (operation: unknown) => { store.execute(actor, operation); throw new Error('Lost after apply'); });
  await controller.apply(conversation, lost);
  expect(controller.snapshot().uncertain).toBe(true);
  await controller.check(transport);
  expect(controller.snapshot()).toMatchObject({ uncertain: false, receipt: { status: 'applied', resourceVersion: null }, memories: { [memory.id]: null }, confirmed: null });
  controller.dismiss();
  expect(controller.snapshot().memories[memory.id]).toBeNull();
  expect(lost).toHaveBeenCalledTimes(1);
  controller.reset();
  expect(controller.snapshot().memories).toEqual({});
});


it('uses a newer authorized database profile after an older applied receipt', async () => {
  const controller = new PreferenceController();
  const propose = vi.spyOn(controller, 'propose').mockResolvedValue();
  const transport = vi.fn();
  const response = {
    profile: { language: 'en', timezone: 'UTC', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, preferences: { durationMinutes: 20 }, version: '5', source: 'authorized_profile' },
    snapshot: { capabilities: [{ key: 'actions', status: 'available' }] }, memories: [],
  } as unknown as CoachConversationResponse;
  const state = { ...controller.snapshot(), confirmed: { durationMinutes: 45, version: '4', storage: 'database' as const } };
  const view = render(<I18nProvider defaultLang="en"><ContextCards response={response} conversationId={conversation} controller={controller} state={state} transport={transport} /></I18nProvider>);
  fireEvent.click(screen.getByText('Your profile & memory'));
  expect(screen.getByText('Typical workout: 20 minutes')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  expect(propose).toHaveBeenLastCalledWith(conversation, '5', 60, transport, undefined);
  const older = { ...response, profile: { ...response.profile!, version: '3' } };
  view.rerender(<I18nProvider defaultLang="en"><ContextCards response={older} conversationId={conversation} controller={controller} state={state} transport={transport} /></I18nProvider>);
  expect(screen.getByText('Typical workout: 45 minutes')).toBeTruthy();
});
