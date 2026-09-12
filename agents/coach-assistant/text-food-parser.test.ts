import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { taskPolicies } from '@/agents/router/policies';
import { createGovernedCoachTransport, type GovernedCoachTransport } from './governed-transport';
import { decidePilotBudgetCommand, TEXT_FOOD_MAX_PHASES, type PilotAttemptRecord, type PilotBudgetStore } from './pilot-budget';
import { createTextFoodParserTransport, TEXT_FOOD_PROMPT_VERSION } from './text-food-parser';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(fail=false, profile: 'food_parse' | 'chat' = 'food_parse') {
 const records=new Map<string,PilotAttemptRecord>();const events:string[]=[];
 const store:PilotBudgetStore={async execute(command){events.push(command.operation);const result=decidePilotBudgetCommand({pilotId:id(1),budgetDay:'2026-09-12',capNanoUsd:3_000_000_000,chargedNanoUsd:0,turnAttemptCount:records.size,accountingBlocked:false,existing:records.get(command.binding.attemptId)},command);if(result.ok&&result.write!=='none')records.set(command.binding.attemptId,result.record);return {storage:'database',...result};}};
 const provider=vi.fn<GovernedCoachTransport>(async()=>{events.push('provider');if(fail)throw new Error('offline_failure');return {output:{value:'native'},responseModel:'gpt-5.6-luna',requestId:'req_fixture',rawStatus:200,latencyMs:1,usage:{inputTokens:100,outputTokens:20}};});
 const signal=new AbortController().signal;
 const governed=createGovernedCoachTransport({pilotId:id(1),actorId:id(2),turnId:id(3),identityParts:['food-fixture'],mode:'injected',reservationProfile:profile==='food_parse'?'food_parse':undefined,store,signal,transport:provider,allowedPromptVersions:[TEXT_FOOD_PROMPT_VERSION]});
 return {...createTextFoodParserTransport(governed.transport,signal),events,provider,signal};
}
const request=(signal:AbortSignal)=>({policy:taskPolicies.food_parse,signal,system:'native food prompt',prompt:'two eggs',schema:{type:'object'},validator:z.object({value:z.string()})});
it('admits each native phase before transport and settles through the shared authority',async()=>{
 const f=fixture();expect((await f.providerTransport(request(f.signal))).output).toEqual({value:'native'});await f.providerTransport(request(f.signal));f.assertComplete();
 expect(f.events).toEqual(['reserve','claim_dispatch','provider','settle','reserve','claim_dispatch','provider','settle']);
 expect(f.provider.mock.calls.every(([r])=>r.maxAttempts===1&&r.maxTokens===2000)).toBe(true);
});
it('latches a provider failure and refuses a native fallback without another paid attempt',async()=>{
 const f=fixture(true);await expect(f.providerTransport(request(f.signal))).rejects.toThrow();await expect(f.providerTransport(request(f.signal))).rejects.toThrow();expect(f.provider).toHaveBeenCalledTimes(1);expect(()=>f.assertComplete()).toThrow('food_parse_incomplete');
});
it('allows extraction, decomposition and estimates, with no two-call cap',async()=>{
 const f=fixture();await Promise.all([1,2,3].map(()=>f.providerTransport(request(f.signal))));f.assertComplete();expect(f.provider).toHaveBeenCalledTimes(3);
});
it('bounds parallel native phases to the algorithm maximum and refuses a partial result',async()=>{
 const f=fixture();const results=await Promise.allSettled(Array.from({length:TEXT_FOOD_MAX_PHASES+1},()=>f.providerTransport(request(f.signal))));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(TEXT_FOOD_MAX_PHASES);expect(results.at(-1)?.status).toBe('rejected');expect(f.provider).toHaveBeenCalledTimes(TEXT_FOOD_MAX_PHASES);expect(()=>f.assertComplete()).toThrow('food_parse_incomplete');
});
it('rejects oversized prompts before reserving or calling a provider',async()=>{
 const f=fixture();await expect(f.providerTransport({...request(f.signal),prompt:'x'.repeat(64000)})).rejects.toThrow('context_limit');expect(f.events).toEqual([]);
});
it('does not accept an arbitrary ungoverned provider',()=>{expect(()=>createTextFoodParserTransport(vi.fn(),new AbortController().signal)).toThrow('budget_blocked');});

it('rejects the smaller chat reservation for the native long Food prompt',()=>{expect(()=>fixture(false, 'chat')).toThrow('budget_blocked');});
