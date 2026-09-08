// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import type { CoachResponse } from '@/agents/coach-assistant/contracts';
import WorkoutCoachSurface from '@/components/workout/coach/WorkoutCoachSurface';
import { WorkoutCoachEntry, type CoachTransport } from '@/components/workout/coach/WorkoutCoachEntry';
import { readCoachResponse, requestWorkoutCoach } from '@/components/workout/coach/client';

const answer = (text = 'One completed workout.'): CoachResponse => ({
  version: 'coach-assistant.v1', ok: true, mode: 'offline', dataSource: 'synthetic',
  output: { answer: text, evidenceRefs: ['today'], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
  evidence: [{ id: 'today', source: 'workout', sourceIds: ['record-1'], window: { start: '2026-09-06', end: '2026-09-06', days: 1, timezone: 'America/Bogota' }, completeness: 'complete', statement: 'One recorded session.', value: 1, unit: 'sessions' }],
  telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
});
const mount = (request: React.ComponentProps<typeof WorkoutCoachSurface>['example']) => render(<I18nProvider defaultLang="en"><WorkoutCoachSurface example={request} /></I18nProvider>);
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('does not mount the coach or call the API while its separate flag is off', () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_ASSISTANT_ENABLED', '0');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const view = render(<WorkoutCoachEntry />);
  expect(view.container.textContent).toBe(''); expect(fetch).not.toHaveBeenCalled();
});

it('allows only the explicit private example entry while the account flag stays off', async () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_ASSISTANT_ENABLED', '0');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<I18nProvider defaultLang="en"><WorkoutCoachEntry example={async () => answer()} /></I18nProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'My day' }));
  await screen.findByText('One completed workout.');
  expect(fetch).not.toHaveBeenCalled();
});

it('shows synthetic provenance, collapsed records and plain text without running any action', async () => {
  const request = vi.fn<CoachTransport>(async () => answer('<img src=x onerror=alert(1)>'));
  const view = mount(request);
  fireEvent.click(screen.getByRole('button', { name: 'My day' }));
  await screen.findByText('<img src=x onerror=alert(1)>');
  expect(view.container.querySelector('img')).toBeNull();
  expect(screen.getByText('Record summary · No AI model used')).toBeTruthy();
  expect(screen.getByText('Example data · Private prototype')).toBeTruthy();
  expect(screen.getByText('Records used').closest('details')?.open).toBe(false);
  expect(request.mock.calls[0][0]).toEqual({ intent: 'today', message: 'Explain my training today using my available records.' });
  fireEvent.click(screen.getByRole('button', { name: 'Close answer' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'My day' }));
});

it('cancels the request and ignores a late response after another intent is selected', async () => {
  let first!: (value: CoachResponse) => void;
  const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockResolvedValue(answer('This week.'));
  mount(request);
  fireEvent.click(screen.getByRole('button', { name: 'My day' }));
  const signal = request.mock.calls[0][1] as AbortSignal;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(signal.aborted).toBe(true);
  expect(screen.getByText('Request cancelled.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'My week' }));
  await screen.findByText('This week.');
  await act(async () => first(answer('Stale day.')));
  expect(screen.queryByText('Stale day.')).toBeNull();
});

it('retries only on explicit request and restores focus after Escape', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(answer());
  mount(request);
  fireEvent.click(screen.getByRole('button', { name: 'My day' }));
  await screen.findByRole('alert'); expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('One completed workout.');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close answer' }), { key: 'Escape' });
  expect(screen.queryByText('One completed workout.')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'My day' }));
});

it('ends a hung request at the deadline even if the transport ignores abort', async () => {
  vi.useFakeTimers();
  mount(() => new Promise(() => {}));
  fireEvent.click(screen.getByRole('button', { name: 'My day' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(50000); });
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});

it('keeps missing evidence honest and rejects dangling citations', async () => {
  const empty = answer('No available training records.'); empty.evidence = []; empty.output!.evidenceRefs = [];
  mount(async () => empty);
  fireEvent.click(screen.getByRole('button', { name: 'My day' }));
  await screen.findByText('There are no records to summarize for this period.');
  const invalid = answer(); invalid.output!.evidenceRefs = ['another-client-record'];
  expect(() => readCoachResponse(invalid)).toThrow('invalid_output');
});

it('does not send blank plan questions and never substitutes fixtures for the authenticated API', async () => {
  const request = vi.fn(async () => answer()); mount(request);
  fireEvent.click(screen.getByRole('button', { name: 'My plan' }));
  expect((screen.getByRole('button', { name: 'Ask about my plan' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Why these exercises?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about my plan' }));
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ ok: true, json: async () => answer() } as Response); vi.stubGlobal('fetch', fetch);
  await expect(requestWorkoutCoach({ intent: 'today', message: 'My day' }, new AbortController().signal)).rejects.toThrow('invalid_output');
  expect(fetch.mock.calls[0][0]).toBe('/api/coach-assistant');
});
