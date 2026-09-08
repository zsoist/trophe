import { expect, it } from 'vitest';
import { run } from '@/agents/coach-assistant';
import { fixtureRepository } from '@/agents/coach-assistant/fixtures';
import { handleCoachRequest } from '@/agents/coach-assistant/handler';
import type { ReadArgs, Rows } from '@/agents/coach-assistant/repository';

it('retains attempted read accounting when a later source fails without exposing partial facts', async () => {
  const repository = fixtureRepository();
  let attempted = 0;
  const wrap = <T>(read: (args: ReadArgs) => Promise<Rows<T>>) =>
    async (args: ReadArgs): Promise<Rows<T>> => {
      if (++attempted === 2) throw new Error('private-error-canary');
      return read(args);
    };
  repository.plan = wrap(repository.plan.bind(repository));
  repository.workouts = wrap(repository.workouts.bind(repository));
  repository.nutrition = wrap(repository.nutrition.bind(repository));
  const result = await run({ message: 'Summarize today', intent: 'today' }, {
    actorId: 'synthetic-client', repository,
    now: new Date('2026-09-07T03:30:00Z'),
    signal: new AbortController().signal, mode: 'offline',
  });
  expect(attempted).toBe(2);
  expect(result.telemetry.dataReads).toBe(2);
  expect(result.error?.code).toBe('query_failed');
  expect(result.evidence).toEqual([]);
  expect(result.output).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('private-error-canary');
});

it.each(['{', new Uint8Array([0xff])])('classifies malformed request bytes as invalid input without opening a repository', async body => {
  let opened = 0;
  const response = await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant', { method: 'POST', body }), {
    env: { COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: 'allowed' },
    guard: async () => ({ userId: 'allowed' }),
    createRepository: () => { opened++; return fixtureRepository(); },
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe('invalid_input');
  expect(opened).toBe(0);
});
