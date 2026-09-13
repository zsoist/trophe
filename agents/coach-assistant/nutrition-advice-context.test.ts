import {expect,it,vi} from 'vitest';
import {runConversationCandidate} from './conversation-candidate';
import {fixtureRepository} from './fixtures';
import {createCoachCapabilityRegistry} from './capability-registry';
const request={version:'coach-assistant.v2' as const,conversationId:'00000000-0000-4000-8000-000000000001',turnId:'00000000-0000-4000-8000-000000000002',message:'Dame sugerencias con proteína'};
const choices=['Tofu','Lentils','Chickpeas'].map(name=>({name,foods:[{name,grams:150}]}));
async function fixture(empty=false){
 const repo=fixtureRepository({nutrition:empty?[]:Array.from({length:6},(_,index)=>({id:`00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`,userId:'synthetic-client',date:'2026-09-13',calories:100,proteinG:5})),workouts:[],plans:[]});
 repo.personalContext=async()=>({rows:empty?[]:[{userId:'synthetic-client',preferences:{},memories:[],nutritionTargets:{calories:2300,proteinG:120},foodPreference:{profileId:'synthetic-client',version:'v1',preferences:{version:1 as const,dietPattern:'vegan' as const}}}],truncated:false});
 const reference=vi.fn();const estimate=vi.fn(async()=>[]);
 const provider=vi.fn(async(input)=>{const payload=JSON.parse(input.prompt);expect(new TextEncoder().encode(input.system+input.prompt+JSON.stringify(input.schema)).length).toBeLessThanOrEqual(7500);expect(payload.snapshot.language).toBe('es');expect(payload.snapshot.window.start).toBe('2026-09-13');
  if(!empty){expect(payload.evidence).toEqual(expect.arrayContaining([expect.objectContaining({id:'nutrition.target.proteinG',value:120}),expect.objectContaining({id:'nutrition.calories',value:600})]));expect(payload.foodPreference.preferences.dietPattern).toBe('vegan');}
  return {output:{answer:'Aquí tienes tres opciones; ya he registrado 900 kcal.',followUp:null,evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],limitations:[],escalation:false,mealAdviceChoices:choices},usage:{inputTokens:100,outputTokens:100},rawStatus:200,latencyMs:1};
 });
 const result=await runConversationCandidate({...request,context:{surface:'food',includeScreen:true,screenDate:'2026-09-01'}}, {actorId:'synthetic-client',mode:'model',repository:repo,now:new Date('2026-09-13T18:00:00Z'),signal:new AbortController().signal,offlineConversationProvider:provider,estimateMealAdvice:estimate,capabilityRegistry:createCoachCapabilityRegistry({foodReference:reference})});
 return {result,reference,estimate,provider};
}
it('advice bypasses Food parsing while gathering authorized today, targets and preferences',async()=>{const f=await fixture();expect(f.result.error).toBeUndefined();expect(f.result.ok).toBe(true);expect(f.reference).not.toHaveBeenCalled();expect(f.provider).toHaveBeenCalledTimes(1);expect(f.estimate).toHaveBeenCalledWith(choices,'es',expect.any(AbortSignal),expect.objectContaining({dietPattern:'vegan',timeoutMs:expect.any(Number)}));expect(f.result.receipts).toEqual([]);});
it('missing profile does not turn advice into a request to parse an absent food',async()=>{const f=await fixture(true);expect(f.result.error).toBeUndefined();expect(f.result.output?.answer).toContain('Opciones de comida');expect(f.result.output?.answer).not.toContain('900');expect(f.result.output?.answer).not.toContain('registrado');expect(f.estimate).toHaveBeenCalledTimes(1);expect(f.result.textFood).toBeUndefined();});
