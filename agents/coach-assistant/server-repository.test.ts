import { describe, expect, it } from 'vitest';
import { createServerRepository } from './server-repository';

describe('real query adapter boundaries', () => {
  it('reads data under authenticated RLS with bound owner/date/row limits', async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    let released = false;
    const repository = createServerRepository({ connect: async () => ({
      query: async (q: { text: string; values?: unknown[] }) => { calls.push(q); return { rows: [] }; },
      release: () => { released = true; },
    }) });
    await repository.nutrition({ context: { actorId:'actor', subjectId:'subject', organizationId:'org', timezone:'UTC', language:'en' },
      window:{ start:'2026-09-01',end:'2026-09-07',days:7,timezone:'UTC' },limit:128,signal:new AbortController().signal });
    expect(calls.map(c => c.text).join('\n')).toContain('SET LOCAL ROLE authenticated');
    expect(calls.find(c => c.text.includes('FROM food_log'))?.values).toEqual(['subject','2026-09-01','2026-09-07',129]);
    expect(calls.some(c => c.text === 'ROLLBACK')).toBe(true);
    expect(released).toBe(true);
  });
  it('destroys only its leased connection on abort', async () => {
    const controller = new AbortController();
    let destroyed = false;
    const repository = createServerRepository({ connect: async () => ({
      query: async () => { controller.abort(); return { rows: [] }; },
      release: (destroy?: boolean) => { destroyed = Boolean(destroy); },
    }) });
    await expect(repository.nutrition({ context:{ actorId:'actor',subjectId:'subject',organizationId:'org',timezone:'UTC',language:'en' },
      window:{ start:'2026-09-01',end:'2026-09-07',days:7,timezone:'UTC' },limit:128,signal:controller.signal })).rejects.toThrow();
    expect(destroyed).toBe(true);
  });
});
