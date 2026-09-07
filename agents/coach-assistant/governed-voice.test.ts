import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fixtureRepository} from './fixtures';
import {audioBinding,audioFixtureLedger,silentCoachWebm} from './audio-test-fixtures';
import {createGovernedCoachTranscriber,createInjectedOpenAiCoachTranscriber} from './governed-voice';
import {transcribeCoachAudio} from './voice';
const setup=()=>{
 const b=audioBinding(),l=audioFixtureLedger(b),repository=fixtureRepository();repository.dataSource='authorized_records';
 repository.authorize=vi.fn(async()=>({actorId:b.actorId,subjectId:b.actorId,organizationId:b.organizationId,timezone:'UTC',language:'es'}));
 const fetchImpl=vi.fn<typeof fetch>(async(url,init)=>{
  expect(String(url)).toBe('https://api.openai.com/v1/audio/transcriptions');expect(init?.redirect).toBe('error');expect(l.calls).toEqual(['reserve','claim_dispatch']);
  expect((init?.body as FormData).get('model')).toBe('gpt-4o-mini-transcribe');expect((init?.body as FormData).get('language')).toBe('es');
  expect(init?.headers).toEqual({Authorization:'Bearer trophe-offline-placeholder'});
  return new Response(JSON.stringify({text:'Texto de fixture editable',usage:{input_tokens:10,output_tokens:4}}),{status:200});
 });
 const offlineTranscriber=createGovernedCoachTranscriber({mode:'injected',identity:b,budget:l.store,transport:createInjectedOpenAiCoachTranscriber(fetchImpl)});
 return {b,l,fetchImpl,repository,input:{conversationId:b.conversationId,turnId:b.turnId,locale:'es',durationMs:100},options:{actorId:b.actorId,repository,signal:new AbortController().signal,offlineTranscriber}};
};
describe('authenticated coach STT with explicit injected OpenAI transport',()=>{
 it('uses actual adapter/policy and duration validation, returns review only with tokens reconciled',async()=>{
  const s=setup(),result=await transcribeCoachAudio(silentCoachWebm(),s.input,s.options);
  expect(result).toMatchObject({ok:true,status:'review_required',transcript:{source:'synthetic_fixture'}});expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  expect(s.l.records.get(s.b.attemptId)).toMatchObject({state:'settled',chargedNanoUsd:32500});
 });
 it('forbids mismatched org/conversation/turn binding before provider and reservation',async()=>{
  for(const field of ['organizationId','conversationId','turnId'] as const){const s=setup();const identity={...s.b,[field]:randomUUID()};s.options.offlineTranscriber=createGovernedCoachTranscriber({mode:'injected',identity,budget:s.l.store,transport:createInjectedOpenAiCoachTranscriber(s.fetchImpl)});
   expect(await transcribeCoachAudio(silentCoachWebm(),s.input,s.options)).toMatchObject({error:'forbidden'});expect(s.fetchImpl).not.toHaveBeenCalled();expect(s.l.calls).toEqual([]);
  }
 });
 it('reauthorizes after claim; a revoked scope cannot reach HTTP transport',async()=>{
  const s=setup();const execute=s.l.store.execute;s.l.store.execute=async(c,signal)=>{const r=await execute(c,signal);if(c.operation==='claim_dispatch')s.repository.authorize=async()=>{throw new Error('forbidden');};return r;};
  expect(await transcribeCoachAudio(silentCoachWebm(),s.input,s.options)).toMatchObject({error:'forbidden'});expect(s.fetchImpl).not.toHaveBeenCalled();expect(s.l.records.get(s.b.attemptId)?.state).toBe('unknown');
 });
 it('rejects oversize/mime/empty bytes before reservation, and empty transcript from silent fixture',async()=>{
  for(const file of [new File(['bad'],'x',{type:'audio/mpeg'}),new File([],'x',{type:'audio/webm'}),new File([new Uint8Array(2*1024*1024+1)],'x',{type:'audio/webm'})]){
   const s=setup();expect(await transcribeCoachAudio(file,s.input,s.options)).toMatchObject({error:'invalid_audio'});expect(s.l.calls).toEqual([]);
  }
  const s=setup();s.fetchImpl.mockResolvedValue(new Response(JSON.stringify({text:'',usage:{input_tokens:10,output_tokens:0}})));
  expect(await transcribeCoachAudio(silentCoachWebm(),s.input,s.options)).toMatchObject({ok:false});expect(s.l.records.get(s.b.attemptId)).toMatchObject({state:'unknown',chargedNanoUsd:30000000});
 });
 it('retains usage-unknown reservation on provider errors and rejects cancelled results',async()=>{
  const s=setup();s.fetchImpl.mockResolvedValue(new Response('unavailable',{status:503}));expect(await transcribeCoachAudio(silentCoachWebm(),s.input,s.options)).toMatchObject({error:'provider_unavailable'});expect(s.l.records.get(s.b.attemptId)?.state).toBe('unknown');
  const late=setup(),abort=new AbortController();late.options.signal=abort.signal;late.fetchImpl.mockImplementation(async()=>{abort.abort();return new Response(JSON.stringify({text:'late',usage:{input_tokens:10,output_tokens:1}}));});
  expect(await transcribeCoachAudio(silentCoachWebm(),late.input,late.options)).toMatchObject({error:'cancelled'});expect(late.l.records.get(late.b.attemptId)?.chargedNanoUsd).toBe(30000000);
 });
});
