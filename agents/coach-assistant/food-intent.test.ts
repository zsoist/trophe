import {describe,expect,it,vi} from 'vitest';
import type {CoachConversationRequest} from './contracts';
import {runConversation} from './conversation';
import {fixtureRepository} from './fixtures';
import type {OfflineConversationProvider} from './open-conversation';

const conversationId='a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId='aac3a82e-898c-4907-b9b9-75133bb6d27f',entryId='bbc3a82e-898c-4907-b9b9-75133bb6d27f';
const output={answer:'I can prepare that quantity correction for review.',evidenceRefs:[] as string[],entityRefs:[] as string[],facts:[] as Array<{kind:'record_fact';evidenceId:string}>,followUp:null,limitations:[] as string[],escalation:false};
const request=(message:string,includeMeal=false):CoachConversationRequest=>({version:'coach-assistant.v2',conversationId,turnId,message,context:{surface:'food',includeScreen:includeMeal,...(includeMeal?{entity:{kind:'meal' as const,id:entryId}}:{})}});
const provider=(actionIntent:unknown):OfflineConversationProvider=>vi.fn(async input=>({output:{...output,evidenceRefs:(JSON.parse(input.prompt) as {evidence:Array<{id:string}>}).evidence.map(item=>item.id),actionIntent},usage:{inputTokens:300,outputTokens:80,reasoningTokens:10},latencyMs:1,rawStatus:200}));
const run=(message:string,target:{grams:number;previousGrams:number},foodQuantityIntentsEnabled=true,includeMeal=false)=>runConversation(request(message,includeMeal),{actorId:'synthetic-client',repository:fixtureRepository({nutrition:[],workouts:[],plans:[]}),mode:'model',now:new Date('2026-09-08T12:00:00Z'),signal:new AbortController().signal,offlineConversationProvider:provider({action:'food.quantity.update',target}),offlineInterpretationReview:async()=>({approved:true}),foodQuantityIntentsEnabled});

describe('provider-selected food quantity correction intent',()=>{
 it('binds a natural one-amount request to the server-resolved current Food quantity',async()=>{
  const adaptive=vi.fn<OfflineConversationProvider>(async input=>{
   expect(input.system).toContain('actionsAvailable is the complete allowlist');
   const payload=JSON.parse(input.prompt) as {evidence:Array<{id:string}>;actionsAvailable:Array<{action:string;target:unknown}>};
   expect(payload.actionsAvailable).toEqual([{action:'food.quantity.update',target:{previousGrams:250,grams:150}}]);
   return {output:{...output,evidenceRefs:payload.evidence.map(item=>item.id),actionIntent:payload.actionsAvailable[0]},usage:{inputTokens:300,outputTokens:80,reasoningTokens:10},latencyMs:1,rawStatus:200};
  });
  const result=await runConversation(request('Déjalo en 150 g',true),{
   actorId:'synthetic-client',repository:fixtureRepository({nutrition:[],workouts:[],plans:[]}),mode:'model',now:new Date('2026-09-08T12:00:00Z'),signal:new AbortController().signal,
   offlineConversationProvider:adaptive,offlineInterpretationReview:async()=>({approved:true}),foodQuantityIntentsEnabled:true,
   foodSelection:{status:'resolved',snapshot:{entryId,loggedDate:'2026-09-08',grams:250,version:'1'}},
  } as Parameters<typeof runConversation>[1]);
  expect(result.ok).toBe(true);
  expect(result.actionIntents).toEqual([expect.objectContaining({action:'food.quantity.update',target:{selection:'authorized_food_entry',entryHintId:entryId,previousGrams:250,grams:150}})]);
 });
 it.each([
  ['unavailable selection',{status:'unavailable',reason:'not_found'} as const,'Déjalo en 150 g'],
  ['stale stated quantity',{status:'resolved',snapshot:{entryId,loggedDate:'2026-09-08',grams:250,version:'1'}} as const,'Fueron 150 gramos, no 200'],
 ])('turns a model-selected Food correction with %s into a useful clarification and no writer intent',async(_label,foodSelection,message)=>{
  const adaptive=vi.fn<OfflineConversationProvider>(async input=>{
   const payload=JSON.parse(input.prompt) as {evidence:Array<{id:string}>;actionsAvailable:Array<{action:string;target:unknown}>};
   expect(payload.actionsAvailable).toEqual([{action:'food.quantity.update',target:{grams:150}}]);
   return {output:{...output,evidenceRefs:payload.evidence.map(item=>item.id),actionIntent:payload.actionsAvailable[0]},usage:{inputTokens:300,outputTokens:80,reasoningTokens:10},latencyMs:1,rawStatus:200};
  });
  const result=await runConversation(request(message,true),{
   actorId:'synthetic-client',repository:fixtureRepository({nutrition:[],workouts:[],plans:[]}),mode:'model',now:new Date('2026-09-08T12:00:00Z'),signal:new AbortController().signal,
   offlineConversationProvider:adaptive,offlineInterpretationReview:async()=>({approved:true}),foodQuantityIntentsEnabled:true,foodSelection,
  } as Parameters<typeof runConversation>[1]);
  expect(result.ok).toBe(true);expect(result.actionIntents).toEqual([]);expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);
  expect(result.output?.answer.toLowerCase()).toMatch(/select|seleccion|current|actual/);
 });
 it('binds the explicit old and new grams without proposing or mutating',async()=>{
  const result=await run('Fueron 150 gramos, no 250',{grams:150,previousGrams:250});
  expect(result.ok).toBe(true);expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);
 expect(result.actionIntents).toEqual([{id:expect.stringMatching(/^[a-f0-9]{64}$/),action:'food.quantity.update',source:'provider_tool',subjectId:'synthetic-client',scopeKey:result.snapshot?.scopeKey,surface:'food',target:{selection:'authorized_food_entry',entryHintId:null,previousGrams:250,grams:150},reviewRequired:true}]);
 });
 it('discards model prose for a bound Food mutation intent and renders deterministic review copy',async()=>{
  const unsafeProvider=provider({action:'food.quantity.update',target:{grams:150,previousGrams:250}});
  vi.mocked(unsafeProvider).mockImplementationOnce(async input=>({output:{...output,answer:'Cambié 250 gramos a 150 gramos y mejoré tu metabolismo.',evidenceRefs:(JSON.parse(input.prompt) as {evidence:Array<{id:string}>}).evidence.map(item=>item.id),actionIntent:{action:'food.quantity.update',target:{grams:150,previousGrams:250}}},usage:{inputTokens:300,outputTokens:80,reasoningTokens:10},latencyMs:1,rawStatus:200}));
  const result=await runConversation(request('Fueron 150 gramos, no 250'),{actorId:'synthetic-client',repository:fixtureRepository({nutrition:[],workouts:[],plans:[]}),mode:'model',now:new Date('2026-09-08T12:00:00Z'),signal:new AbortController().signal,offlineConversationProvider:unsafeProvider,offlineInterpretationReview:async candidate=>{expect(candidate.answer).toBe('I can prepare that quantity correction for review.');return {approved:true};},foodQuantityIntentsEnabled:true});
  expect(result.ok).toBe(true);expect(result.output?.answer).not.toContain('250');expect(result.output?.answer).not.toContain('150');expect(result.output?.answer).not.toContain('metabolismo');
  expect(result.actionIntents).toHaveLength(1);expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);
 });
 it.each(['Fueron 150 o 180 gramos, no 250','Fueron ciento cincuenta gramos, no 250','Fueron 150 gramos'])('does not expose an ambiguous or incomplete correction: %s',async message=>{
  const result=await run(message,{grams:150,previousGrams:250});expect(result.ok).toBe(true);expect(result.actionIntents).toEqual([]);
 });
 it('rejects provider quantities that differ from the explicit correction',async()=>{
  const result=await run('Fueron 150 gramos, no 250',{grams:180,previousGrams:250});expect(result.error?.code).toBe('invalid_output');expect(result.actionIntents).toEqual([]);
 });
 it('does not advertise the intent while the server action capability is disabled',async()=>{
  const result=await run('Fueron 150 gramos, no 250',{grams:150,previousGrams:250},false);expect(result.ok).toBe(true);expect(result.actionIntents).toEqual([]);
 });
 it('carries a visible meal id only as a resolver hint',async()=>{
  const result=await run('Fueron 150 gramos, no 250',{grams:150,previousGrams:250},true,true);
  expect(result.actionIntents).toEqual([expect.objectContaining({target:{selection:'authorized_food_entry',entryHintId:entryId,previousGrams:250,grams:150}})]);
 });
});
