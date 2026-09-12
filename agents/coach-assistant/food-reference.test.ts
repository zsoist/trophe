import {expect,it,vi} from 'vitest';
import {createCoachCapabilityRegistry,capabilityChoiceSchema} from './capability-registry';
import {renderFoodReferences} from './food-reference';
import {runConversation} from './conversation';
import {fixtureRepository} from './fixtures';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const food={name:'Chicken breast, cooked',source:'usda',quality:'lab_verified',grams:100 as const,calories:165,proteinG:31};
it('returns bounded catalogue references with deterministic user-portion arithmetic and no second model call',async()=>{
 const repository=fixtureRepository({nutrition:[],workouts:[],plans:[]});repository.authorize=async()=>({actorId:id(1),subjectId:id(1),organizationId:id(2),timezone:'UTC',language:'en'});
 const lookup=vi.fn(async()=>food);
 const provider=vi.fn(async()=>({output:{tool:'food.reference',args:{queries:['chicken breast']}},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1}));
 const result=await runConversation({version:'coach-assistant.v2',conversationId:id(3),turnId:id(4),message:'Protein in 150 g of chicken breast?'},{actorId:id(1),repository,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({foodReference:lookup}),signal:new AbortController().signal,now:new Date('2026-09-12T12:00:00Z')});
 expect(result.ok,JSON.stringify(result.error)).toBe(true);expect(provider).toHaveBeenCalledTimes(1);expect(lookup).toHaveBeenCalledTimes(1);
 expect(result.output?.answer).toContain('247.5 kcal · 46.5 g protein');expect(result.output?.answer).toContain('not logged intake');
 expect(result.receipts).toEqual([]);expect(result.proposals).toEqual([]);
});
it('does not choose among multiple user quantities or assign a serving to multiple options',()=>{
 expect(renderFoodReferences({options:[food]},false,'100 g or 200 g')).not.toContain('you stated');
 expect(renderFoodReferences({options:[food,food]},false,'200 g')).not.toContain('you stated');
 expect(renderFoodReferences({options:[food]},true,'150 gramos')).toContain('46.5 g proteína');
});
it.each([{tool:'food.reference',args:{queries:['a','b','c']}},{tool:'food.reference',args:{queries:['chicken'],grams:100}},{tool:'food.reference',args:{queries:['chicken'],url:'https://example.com'}}])('rejects unbounded or invented tool arguments',choice=>{
 expect(capabilityChoiceSchema.safeParse(choice).success).toBe(false);
});
it('fails closed on invalid catalogue nutrition',()=>{
 expect(renderFoodReferences({options:[{...food,proteinG:NaN}]},false)).toBe('');
});
