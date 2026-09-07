// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { publishScreenSelection, screenSelectionSnapshot, acceptedScreenSelection } from '@/components/assistant/screen-selection';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
const route = vi.hoisted(() => ({ path: '/dashboard/workout/atlas' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
afterEach(() => { cleanup(); publishScreenSelection(null)(); route.path = '/dashboard/workout/atlas'; });
const response = (request: CoachConversationRequest): CoachConversationResponse => ({
  version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: null,
  output: { answer: 'Resolved response', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
  telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
});
it('replays a selection to a lazy consumer and prevents an old route cleanup from erasing the new owner', () => {
  const first = publishScreenSelection({ path: route.path, label: 'Chest', anatomy: { group: 'chest' } });
  const second = publishScreenSelection({ path: '/dashboard/workout/exercises/e', label: 'Bench', actorId: 'A', entity: { kind: 'exercise', id: 'e' } });
  first();
  const value = screenSelectionSnapshot();
  expect(value?.label).toBe('Bench');
  expect(acceptedScreenSelection(value, route.path, 'A')).toBeNull();
  expect(acceptedScreenSelection(value, value!.path, 'B')).toBeNull();
  expect(acceptedScreenSelection(value, value!.path, 'A', 'B')).toBeNull();
  expect(acceptedScreenSelection(value, value!.path, 'A')?.entity?.id).toBe('e');
  second(); expect(screenSelectionSnapshot()).toBeNull();
});
it('sends current hints, preserves earlier turns, detaches via the chip and never sends on navigation', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  publishScreenSelection({ path: route.path, label: 'Chest', anatomy: { group: 'chest', subgroup: 'sternocostal', legRegion: 'all' } });
  const transport = vi.fn(async (request: CoachConversationRequest) => response(request));
  const view = render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={transport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect(screen.getByRole('button', { name: 'Remove screen selection: Chest' })).toBeTruthy();
  const send = async () => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await act(async () => {});
  };
  await send();
  expect(transport.mock.calls[0][0].context?.anatomy?.group).toBe('chest');
  expect(transport.mock.calls[0][0].context).not.toHaveProperty('label');
  act(() => { publishScreenSelection({ path: route.path, label: 'Back', anatomy: { group: 'back' } }); });
  await send();
  expect(transport.mock.calls[1][0].context?.anatomy).toEqual({ group: 'back' });
  expect(transport.mock.calls[0][0].context?.anatomy?.group).toBe('chest');
  fireEvent.click(screen.getByRole('button', { name: 'Remove screen selection: Back' }));
  await send();
  expect(transport.mock.calls[2][0].context).toMatchObject({ includeScreen: false });
  expect(transport.mock.calls[2][0].context).not.toHaveProperty('anatomy');
  route.path = '/dashboard/workout';
  view.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={transport} /></I18nProvider>);
  expect(transport).toHaveBeenCalledTimes(3);
});
