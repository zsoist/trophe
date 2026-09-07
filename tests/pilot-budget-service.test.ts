import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { db } from '@/db/client';
import { createPilotBudgetStore } from '@/lib/workout/pilot-budget-service';
import { COACH_ATTEMPT_RESERVATION_NANO_USD as reserve, type PilotAttemptBinding } from '@/agents/coach-assistant/pilot-budget';
import { COACH_PRICING_VERSION } from '@/agents/coach-assistant/economics';
const actor = randomUUID();
const binding = (): PilotAttemptBinding => ({ actorId: actor, pilotId: randomUUID(), attemptId: randomUUID(), agentRunId: randomUUID(), turnId: randomUUID(), model: 'gpt-5.6-luna', pricingVersion: COACH_PRICING_VERSION, requestHash: 'a'.repeat(64), reservedNanoUsd: reserve });
describe('persistent budget writer fail-closed boundaries', () => {
  it('never queries when the command actor differs from the authenticated caller or the request was cancelled', async () => {
    const transaction = vi.fn();
    const store = createPilotBudgetStore({ transaction } as unknown as typeof db, actor);
    expect(await store.execute({ operation: 'reserve', binding: { ...binding(), actorId: randomUUID() } }, new AbortController().signal)).toMatchObject({ ok: false, error: 'budget_blocked' });
    const cancelled = new AbortController(); cancelled.abort();
    expect(await store.execute({ operation: 'reserve', binding: binding() }, cancelled.signal)).toMatchObject({ ok: false, error: 'cancelled' });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('cannot turn a missing charged attempt into available budget', async () => {
    const input = binding();
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ organization_id: randomUUID(), cap_nano_usd: String(20 * reserve), charged_nano_usd: String(reserve), attempt_count: 1, accounting_blocked: false, allowed: true }] }).mockResolvedValueOnce({ rows: [{ id: actor }] }).mockResolvedValueOnce({ rows: [] });
    const transaction = vi.fn(async work => work({ execute }));
    const result = await createPilotBudgetStore({ transaction } as unknown as typeof db, actor).execute({ operation: 'reserve', binding: input }, new AbortController().signal);
    expect(result).toEqual({ storage: 'database', ok: false, error: 'uncertain' });
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it('does not grant dispatch after an ambiguous transaction failure', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('connection lost around commit'));
    const result = await createPilotBudgetStore({ transaction } as unknown as typeof db, actor).execute({ operation: 'claim_dispatch', binding: binding() }, new AbortController().signal);
    expect(result).toEqual({ storage: 'database', ok: false, error: 'uncertain' });
  });
});

import { PgDialect } from 'drizzle-orm/pg-core';
import { createAudioBudgetStore } from '@/lib/workout/pilot-budget-service';
import { audioBinding } from '@/agents/coach-assistant/audio-test-fixtures';
import type { MultimodalRecord } from '@/agents/coach-assistant/multimodal-budget';
import type { SQL } from 'drizzle-orm';
/** Executes SQL adapter against injected transaction results, not a PostgreSQL server. */
function mixedDatabase(pilotId:string,organizationId:string){
 const dialect=new PgDialect(),records=new Map<string,MultimodalRecord>(),statements:string[]=[];
 const config={organization_id:organizationId,cap_nano_usd:'100000000',charged_nano_usd:'0',attempt_count:0,accounting_blocked:false,allowed:true};
 const database={transaction:async(work:(tx:{execute:(q:SQL)=>Promise<unknown>})=>Promise<unknown>)=>work({execute:async q=>{
  const {sql:statement,params}=dialect.sqlToQuery(q);statements.push(statement);
  if(statement.includes('FROM private.coach_pilot_budgets')){expect(statement).toContain('FOR UPDATE');expect(params).toContain(pilotId);return {rows:[{...config}]};}
  if(statement.includes('FROM public.profiles'))return {rows:[{id:actor}]};
  if(statement.includes('FROM public.agent_runs')){expect(statement).toContain('FOR UPDATE');return {rows:[...records.values()].map(record=>({id:record.binding.agentRunId,user_id:record.binding.actorId,organization_id:organizationId,model:record.binding.model,record:structuredClone(record)}))};}
  if(statement.includes('INSERT INTO public.agent_runs')||statement.includes('UPDATE public.agent_runs')){
   const json=params.find(p=>typeof p==='string'&&(p.startsWith('{"coachPilot":')||p.startsWith('{"binding":')));if(typeof json!=='string')throw new Error('missing metadata');const parsed=JSON.parse(json);const record:MultimodalRecord=parsed.coachPilot??parsed;records.set(record.binding.agentRunId,record);
  }
  if(statement.includes('SET charged_nano_usd=charged_nano_usd+')){config.charged_nano_usd=String(Number(config.charged_nano_usd)+Number(params[0]));config.attempt_count+=Number(params[1]);config.accounting_blocked=Boolean(params[2]);}
  return {rows:[]};
 }})};return {database:database as unknown as typeof db,records,config,statements};
}
describe('same-account multimodal SQL adapter (injected transaction)',()=>{
 it('reconciles mixed text/audio rows into one aggregate, then blocks both after unknown audio',async()=>{
  const audio={...audioBinding(),actorId:actor};const d=mixedDatabase(audio.pilotId,audio.organizationId),textStore=createPilotBudgetStore(d.database,actor),audioStore=createAudioBudgetStore(d.database,actor),signal=new AbortController().signal;
  const text={...binding(),pilotId:audio.pilotId,turnId:audio.turnId};
  expect(await textStore.execute({operation:'reserve',binding:text},signal)).toMatchObject({ok:true,write:'insert'});
  expect(await audioStore.execute({operation:'reserve',binding:audio},signal)).toMatchObject({ok:true,write:'insert'});
  expect(Number(d.config.charged_nano_usd)).toBe(reserve+audio.reservedNanoUsd);expect(d.records.size).toBe(2);
  expect(await audioStore.execute({operation:'claim_dispatch',binding:audio},signal)).toMatchObject({ok:true,dispatchGranted:true});
  expect(await audioStore.execute({operation:'claim_dispatch',binding:audio},signal)).toMatchObject({ok:true,dispatchGranted:false});
  expect(await textStore.execute({operation:'claim_dispatch',binding:text},signal)).toMatchObject({ok:false,error:'budget_blocked'});
  expect(await audioStore.execute({operation:'mark_unknown',binding:audio},signal)).toMatchObject({ok:true,record:{state:'unknown'}});
  expect(d.config.accounting_blocked).toBe(true);expect(Number(d.config.charged_nano_usd)).toBe(reserve+audio.reservedNanoUsd);
  expect(await textStore.execute({operation:'claim_dispatch',binding:text},signal)).toMatchObject({ok:false,error:'budget_blocked'});
  expect(d.statements.join('\n')).not.toMatch(/CREATE TABLE|INSERT INTO private/);
 });
 it('rejects audio organization mismatch and deleted/reclassified attempts without restoring spend',async()=>{
  const audio={...audioBinding(),actorId:actor},d=mixedDatabase(audio.pilotId,audio.organizationId),store=createAudioBudgetStore(d.database,actor),signal=new AbortController().signal;
  expect(await store.execute({operation:'reserve',binding:{...audio,organizationId:randomUUID()}},signal)).toMatchObject({ok:false,error:'budget_blocked'});
  expect(await store.execute({operation:'reserve',binding:audio},signal)).toMatchObject({ok:true});d.records.clear();
  expect(await store.execute({operation:'claim_dispatch',binding:audio},signal)).toMatchObject({ok:false,error:'uncertain'});expect(d.config.charged_nano_usd).toBe('30000000');
 });
 it('releases only after known usage settlement and retains existing Luna record compatibility',async()=>{
  const audio={...audioBinding('tts'),actorId:actor},d=mixedDatabase(audio.pilotId,audio.organizationId),store=createAudioBudgetStore(d.database,actor),signal=new AbortController().signal;
  await store.execute({operation:'reserve',binding:audio},signal);await store.execute({operation:'claim_dispatch',binding:audio},signal);
  expect(await store.execute({operation:'settle',binding:audio,usage:{unit:'provider_tokens',inputTokens:20,outputTokens:10}},signal)).toMatchObject({ok:true,record:{state:'settled',chargedNanoUsd:132000}});
  expect(d.config.charged_nano_usd).toBe('132000');expect(d.config.attempt_count).toBe(1);
 });
});
