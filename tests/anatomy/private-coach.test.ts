import { afterEach, expect, it, vi } from 'vitest';
import { privateCoachTransport } from '../../tools/anatomy/workout-review/coach';
import { makeReviewData } from '../../tools/anatomy/workout-review/store';
import { createEmptyDraft, type CardioDraft } from '../../lib/workout/workspace-state';

afterEach(() => vi.useRealTimers());
const translate = (key: string) => key;
it('derives synthetic day and week evidence from completed tab records, excluding warmups', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T17:00:00Z'));
  const data = makeReviewData();
  data.sets.push({ ...data.sets[0], id: 'warmup', is_warmup: true });
  const transport = privateCoachTransport(() => data, () => null, translate);
  const signal = new AbortController().signal;
  const today = await transport({ intent: 'today', message: 'today' }, signal);
  const week = await transport({ intent: 'week', message: 'week' }, signal);
  expect(today).toMatchObject({ dataSource: 'synthetic', mode: 'offline', telemetry: { modelCalls: 0, dataReads: 0 } });
  expect(today.evidence[0].value).toBe(3);
  expect(week.evidence[0].value).toBe(6);
  expect(week.evidence[0].sourceIds).toEqual(data.sessions.map(item => item.id));
});

it('does not fabricate a plan in the empty scenario and uses the offered plan count', async () => {
  const data = makeReviewData();
  const transport = privateCoachTransport(() => data, () => null, translate, 5);
  const request = { intent: 'plan', message: 'why' } as const;
  expect((await transport(request, new AbortController().signal)).evidence[0].value).toBe(5);
  data.scenario = 'empty';
  expect((await transport(request, new AbortController().signal)).evidence).toEqual([]);
  const abort = new AbortController(); abort.abort();
  await expect(transport(request, abort.signal)).rejects.toThrow('Aborted');
});

it('describes a cardio draft in minutes instead of claiming there is no plan', async () => {
  const draft = { ...createEmptyDraft('cardio'), durationMinutes: 20 } as CardioDraft;
  const transport = privateCoachTransport(makeReviewData, () => draft, translate, 3);
  const response = await transport({ intent: 'plan', message: 'My plan' }, new AbortController().signal);
  expect(response.evidence[0]).toMatchObject({ source: 'plan', value: 20, unit: 'minutes' });
  expect(response.output?.answer).toBe('coach_assistant.sample_cardio');
});
