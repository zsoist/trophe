// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
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
  const store = createPreferenceStore([{ actorId: actor, subjectId: actor, organizationId: 'example', preferences: { ...defaultWorkoutPreferences } }], { hash: value => bytesToHex(sha256(utf8ToBytes(JSON.stringify(value)))), id: () => crypto.randomUUID() });
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
    snapshot: { id: 'snapshot', capturedAt: '2026-09-07T04:00:00Z', subjectId: actor, organizationId: 'example', surface: 'workout', screenIncluded: true, window: { start: '2026-09-07', end: '2026-09-07', days: 1, timezone: 'UTC' }, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, capabilities: [{ key: 'actions', status: 'available', reason: 'isolated_ephemeral' }] },
    profile: { language: 'en', timezone: 'UTC', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, preferences: { durationMinutes: 30 }, version: profile.version, source: 'isolated_fixture' },
    output: { answer: 'Your current records.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [], telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
  };
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} example={async request => ({ ...body, conversationId: request.conversationId, turnId: request.turnId })} preferenceTransport={transport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
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
