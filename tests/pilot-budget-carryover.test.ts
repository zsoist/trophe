import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {db} from '@/db/client';
import {createPilotBudgetStore} from '@/lib/workout/pilot-budget-service';
import {COACH_ATTEMPT_RESERVATION_NANO_USD as reserve,type PilotAttemptBinding} from '@/agents/coach-assistant/pilot-budget';
import {COACH_PRICING_VERSION} from '@/agents/coach-assistant/economics';
const actor=randomUUID(),pilot=randomUUID(),org=randomUUID();
const binding=():PilotAttemptBinding=>({actorId:actor,pilotId:pilot,attemptId:randomUUID(),agentRunId:randomUUID(),turnId:randomUUID(),model:'gpt-5.6-luna',pricingVersion:COACH_PRICING_VERSION,requestHash:'a'.repeat(64),reservedNanoUsd:reserve});
const carried=()=>({binding:{...binding(),actorId:randomUUID()},admissionDay:'2026-09-12',state:'unknown',chargedNanoUsd:reserve,usage:null,accountingAlert:false});
async function run(records:unknown[],options:{day?:string;charged?:number;count?:number;cap?:number;request?:PilotAttemptBinding}={}){
 const request=options.request??binding();
 const execute=vi.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{organization_id:org,cap_nano_usd:String(options.cap??reserve),operating_target_nano_usd:String(options.cap??reserve),budget_day:options.day??'2026-09-13',server_budget_day:options.day??'2026-09-13',charged_nano_usd:String(options.charged??reserve),attempt_count:options.count??records.length,accounting_blocked:false,allowed:true,carryover_records:records}]}).mockResolvedValueOnce({rows:[{id:actor}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValue({rows:[]});
 const transaction=vi.fn(async work=>work({execute}));
 const result=await createPilotBudgetStore({transaction} as unknown as typeof db,actor).execute({operation:'reserve',binding:request},new AbortController().signal);
 return {result,execute};
}
it('retains unknown source reservations across Bogotá days and never grants a second budget',async()=>{
 for(const day of ['2026-09-13','2026-09-14']){
  const {result,execute}=await run([carried()],{day});expect(result).toMatchObject({ok:false,error:'budget_blocked'});
  expect(JSON.stringify(execute.mock.calls)).not.toContain('INSERT INTO public.agent_runs');
 }
});
it('permits only the remaining capacity while preserving imported attempt count',async()=>{
 const {result,execute}=await run([carried()],{cap:reserve*2});expect(result).toMatchObject({ok:true});
 expect(JSON.stringify(execute.mock.calls)).toContain('attempt_count=attempt_count+');
});
it('fails closed on missing carried attempts or incorrect aggregate',async()=>{
 expect((await run([carried()],{count:2})).result).toMatchObject({ok:false,error:'uncertain'});
 expect((await run([carried()],{charged:0})).result).toMatchObject({ok:false,error:'uncertain'});
});
it('rejects malformed, foreign-pilot, duplicate and replayed source attempts',async()=>{
 const record=carried();
 for(const records of [[{}],[{...record,binding:{...record.binding,pilotId:randomUUID()}}],[record,record]])expect((await run(records)).result).toMatchObject({ok:false});
 expect((await run([record],{request:{...record.binding,actorId:actor}})).result).toMatchObject({ok:false,error:'idempotency_conflict'});
});
it('does not reset the lifetime attempt ceiling at transfer',async()=>{
 const records=Array.from({length:4096},()=>({...carried(),state:'released',chargedNanoUsd:0}));
 expect((await run(records,{charged:0})).result).toMatchObject({ok:false,error:'budget_blocked'});
});
