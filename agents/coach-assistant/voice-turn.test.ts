import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import type {CoachConversationRequest,CoachConversationResponse} from './contracts';
import {fixtureRepository} from './fixtures';
import type {CoachVoiceResult} from './voice-contract';
import {issueVoiceReviewToken} from './voice-review-token';
import {hasAmbiguousSpokenNumber,runReviewedVoiceTurn,type VoiceTextPipeline} from './voice-turn';
type SuccessfulVoice=Extract<CoachVoiceResult,{ok:true}>;

function setup(text='No cambies 70 kg; registra 145 g.'){
 const actorId=randomUUID(),organizationId=randomUUID(),conversationId=randomUUID(),turnId=randomUUID(),locale='es';
 const scope={actorId,organizationId,conversationId},review=issueVoiceReviewToken({...scope,turnId,locale,transcript:text});
 const voice:SuccessfulVoice={version:'coach-assistant.voice.v1',ok:true,status:'review_required',scope,turnId,transcript:{text,locale,languages:['es'],source:'synthetic_fixture',trust:'untrusted_transcript'},review:{...review,editable:true,audioRetention:'discarded_after_transcription'},durationMs:108};
 const repository=fixtureRepository();repository.dataSource='authorized_records';repository.authorize=vi.fn(async()=>({actorId,subjectId:actorId,organizationId,timezone:'America/Bogota',language:'es'}));
 const response=(request:CoachConversationRequest):CoachConversationResponse=>({version:'coach-assistant.v2',conversationId,turnId,ok:true,mode:'offline',dataSource:'authorized_records',snapshot:{id:randomUUID(),capturedAt:new Date().toISOString(),subjectId:actorId,organizationId,actorRole:'client',access:'self',scopeKey:'scope',surface:'food',screenIncluded:true,language:'es',units:{weight:'kg',energy:'kcal',protein:'g'},window:{start:'2026-09-08',end:'2026-09-08',days:1,timezone:'America/Bogota'},capabilities:[]},output:{answer:`Respuesta a: ${request.message}`,evidenceRefs:[],limitations:[],suggestions:[],escalation:{required:false,reason:null,draft:null}},evidence:[],proposals:[],receipts:[],attachments:[],telemetry:{model:null,provider:null,promptVersion:'fixture',modelCalls:0,dataReads:0,tokensIn:0,tokensOut:0,reasoningTokens:0,cacheReadTokens:0,cacheWriteTokens:0,latencyMs:1,costUsd:0,pricingVersion:'fixture'}});
 const pipeline:VoiceTextPipeline={run:vi.fn(async request=>response(request))};
 const request:Omit<CoachConversationRequest,'message'>={version:'coach-assistant.v2',conversationId,turnId,context:{surface:'food',includeScreen:true,displayWeightUnit:'kg'}};
 return {actorId,organizationId,conversationId,turnId,voice,repository,pipeline,request};
}

describe('reviewed offline voice continuation through the existing text pipeline',()=>{
 it('passes the exact edited language, units and negation once and returns only an optional TTS descriptor',async()=>{
  const s=setup(),edited='No cambies 70 kg; registra 140 g.';
  const result=await runReviewedVoiceTurn({voice:s.voice,editedText:edited,reviewed:true,request:s.request,offerSpeech:true},{actorId:s.actorId,repository:s.repository,pipeline:s.pipeline,signal:new AbortController().signal});
  expect(result).toMatchObject({ok:true,status:'answered',transcript:{text:edited,locale:'es',languages:['es'],source:'synthetic_fixture',trust:'untrusted_user_reviewed_data'},speech:{status:'available_on_request',syntheticVoice:true,autoplay:false,requiresResponseId:true}});
  expect(s.pipeline.run).toHaveBeenCalledOnce();expect(vi.mocked(s.pipeline.run).mock.calls[0][0]).toMatchObject({...s.request,message:edited});
 });
 it('requires clarification for ambiguous spoken numbers before the text pipeline can propose a mutation',async()=>{
  for(const text of ['registra 15 o 50, por favor','log fifteen or fifty grams','verwende 15 oder 50 g','καταχώρησε δύο ή τρία κιλά','usa 15/50 g']){
   const s=setup(text),result=await runReviewedVoiceTurn({voice:s.voice,editedText:text,reviewed:true,request:s.request},{actorId:s.actorId,repository:s.repository,pipeline:s.pipeline,signal:new AbortController().signal});
   expect(result).toEqual({ok:false,status:'clarification_required',error:'ambiguous_number'});expect(s.pipeline.run).not.toHaveBeenCalled();
  }
  expect(hasAmbiguousSpokenNumber('No cambies 70 kg; registra 140 g.')).toBe(false);
 });
 it('rejects forged, expired and changed actor, organization, conversation or turn before continuation',async()=>{
  const cases:Array<(s:ReturnType<typeof setup>)=>void>=[
   s=>{s.voice.review.token+='x';},
   s=>{const issued=issueVoiceReviewToken({...s.voice.scope,turnId:s.turnId,locale:'es',transcript:s.voice.transcript.text},Date.now()-600_000);s.voice.review={...issued,editable:true,audioRetention:'discarded_after_transcription'};},
   s=>{s.request={...s.request,conversationId:randomUUID()};},
   s=>{s.request={...s.request,turnId:randomUUID()};},
   s=>{s.request={...s.request,context:{...s.request.context!,clientId:randomUUID()}};},
  ];
  for(const change of cases){const s=setup();change(s);expect((await runReviewedVoiceTurn({voice:s.voice,editedText:s.voice.transcript.text,reviewed:true,request:s.request},{actorId:s.actorId,repository:s.repository,pipeline:s.pipeline,signal:new AbortController().signal})).ok).toBe(false);expect(s.pipeline.run).not.toHaveBeenCalled();}
  const s=setup();let calls=0;const original=s.repository.authorize;s.repository.authorize=async(...args)=>{const value=await original(...args);return ++calls===1?value:{...value,organizationId:randomUUID()};};
  expect(await runReviewedVoiceTurn({voice:s.voice,editedText:s.voice.transcript.text,reviewed:true,request:s.request},{actorId:s.actorId,repository:s.repository,pipeline:s.pipeline,signal:new AbortController().signal})).toMatchObject({ok:false,error:'forbidden'});
 });
 it('propagates cancellation and never offers speech for failed text output',async()=>{
  const cancelled=setup(),abort=new AbortController();abort.abort();expect(await runReviewedVoiceTurn({voice:cancelled.voice,editedText:cancelled.voice.transcript.text,reviewed:true,request:cancelled.request,offerSpeech:true},{actorId:cancelled.actorId,repository:cancelled.repository,pipeline:cancelled.pipeline,signal:abort.signal})).toEqual({ok:false,status:'error',error:'cancelled'});
  const failed=setup(),original=failed.pipeline.run;failed.pipeline.run=vi.fn(async(request,signal):Promise<CoachConversationResponse>=>({...await original(request,signal),ok:false,output:undefined,error:{code:'query_failed',retryable:true}}));
  expect(await runReviewedVoiceTurn({voice:failed.voice,editedText:failed.voice.transcript.text,reviewed:true,request:failed.request,offerSpeech:true},{actorId:failed.actorId,repository:failed.repository,pipeline:failed.pipeline,signal:new AbortController().signal})).toMatchObject({ok:false,error:'pipeline_failed'});
 });
});
