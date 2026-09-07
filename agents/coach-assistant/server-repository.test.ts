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
  it.each([
    [[{target_sets:3,target_reps:'10'}],3,30,false],
    [[{target_sets:3,target_reps:'8-12'}],3,null,false],
    [[{target_sets:3,target_reps:'10'},{target_sets:2,target_reps:null}],5,null,false],
    [[{target_sets:null,target_reps:'10'}],0,null,true],
  ])('validates every bounded raw template target in code',async(targets,sets,reps,partial)=>{
    const repository=createServerRepository({connect:async()=>({query:async q=>({rows:q.text.includes('FROM workout_programs')?[{
      id:'p',userId:'subject',startsOn:null,status:'active',daysTruncated:false,days:[{id:'d',weekday:0,templateId:'t',targets}],
    }]:[]}),release:()=>{}})});
    const result=await repository.plan({context:{actorId:'actor',subjectId:'subject',organizationId:'org',timezone:'UTC',language:'en'},window:{start:'2026-09-06',end:'2026-09-06',days:1,timezone:'UTC'},limit:2,signal:new AbortController().signal});
    expect(result.rows[0].days[0].targetSets).toBe(sets);
    expect(result.rows[0].days[0].targetReps).toBe(reps);
    expect(result.truncated).toBe(partial);
  });
});
