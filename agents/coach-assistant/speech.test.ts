import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fixtureRepository} from './fixtures';
import {audioBinding,audioFixtureLedger} from './audio-test-fixtures';
import {synthesizeCoachSpeech,validateCoachSpeechPlayback,type CoachSpeechTextPort} from './speech';
import {createOpenAiCoachSpeechProvider,type CoachSpeechProvider} from './speech-provider';
const setup=()=>{
 const b=audioBinding('tts'),l=audioFixtureLedger(b),repository=fixtureRepository();repository.dataSource='authorized_records';repository.authorize=async()=>({actorId:b.actorId,subjectId:b.actorId,organizationId:b.organizationId,timezone:'UTC',language:'es'});
 let current:Awaited<ReturnType<CoachSpeechTextPort['load']>>={kind:'final_answer',speechAllowed:true,text:'Tu resumen está listo para revisar.',revision:randomUUID(),sessionEpoch:randomUUID()};
 const texts:CoachSpeechTextPort={load:async()=>current};
 const provider=vi.fn<CoachSpeechProvider>(async()=>({audio:new Uint8Array([1,0,2,0]),mediaType:'audio/pcm',usage:{unit:'provider_tokens',inputTokens:20,outputTokens:10}}));
 return {b,l,provider,texts,current,setCurrent:(v:typeof current)=>{current=v;},input:{responseId:randomUUID(),conversationId:b.conversationId},options:{actorId:b.actorId,repository,texts,identity:b,mode:'injected' as 'injected'|'live',budget:l.store,provider:provider as CoachSpeechProvider|undefined,signal:new AbortController().signal}};
};
describe('governed optional speech output',()=>{
 it('reads only approved server final text, binds scope/hash and discloses synthetic voice',async()=>{
  const s=setup(),r=await synthesizeCoachSpeech(s.input,s.options);expect(r.ok).toBe(true);if(!r.ok)throw new Error('expected fixture');
  expect(r.value).toMatchObject({syntheticVoice:true,disclosure:'Voz generada por IA',source:'injected_provider'});expect(s.provider.mock.calls[0][0].text).toBe(s.current?.text);
  expect(await validateCoachSpeechPlayback(r.value,r.value.scope,s.texts,s.options.signal)).toBe(true);
  expect(await validateCoachSpeechPlayback({...r.value},r.value.scope,s.texts,s.options.signal)).toBe(false);
  s.setCurrent({...s.current!,revision:randomUUID()});expect(await validateCoachSpeechPlayback(r.value,r.value.scope,s.texts,s.options.signal)).toBe(false);
  s.setCurrent(null);expect(await validateCoachSpeechPlayback(r.value,r.value.scope,s.texts,s.options.signal)).toBe(false);
 });
 it('concrete TTS HTTP accepts valid PCM with missing usage, holds full cost and blocks next dispatch',async()=>{
  const s=setup();const fetchImpl=vi.fn<typeof fetch>(async(url,init)=>{
   expect(url).toBe('https://api.openai.com/v1/audio/speech');expect(init?.redirect).toBe('error');expect(s.l.calls).toEqual(['reserve','claim_dispatch']);expect(init?.headers).toMatchObject({Authorization:'Bearer trophe-offline-placeholder'});
   expect(JSON.parse(init?.body as string)).toEqual({model:'gpt-4o-mini-tts',voice:'coral',input:s.current?.text,response_format:'pcm',speed:1});return new Response(new Uint8Array([1,0,2,0]),{headers:{'Content-Type':'application/octet-stream'}});
  });s.options.provider=createOpenAiCoachSpeechProvider({fetchImpl});const r=await synthesizeCoachSpeech(s.input,s.options);
  expect(r).toMatchObject({ok:true,status:'ready',accounting:'held_unknown'});expect(s.l.records.get(s.b.attemptId)).toMatchObject({state:'unknown',chargedNanoUsd:30000000,usage:null,accountingAlert:true});
  expect(await synthesizeCoachSpeech(s.input,{...s.options,identity:{...s.b,attemptId:randomUUID(),agentRunId:randomUUID()}})).toMatchObject({ok:false,error:'budget_blocked'});expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it('never accepts client text, secrets or a proposal as speech-permitted final output',async()=>{
  const s=setup();expect(await synthesizeCoachSpeech({...s.input,text:'injected'},s.options)).toMatchObject({error:'invalid_input'});
  for(const value of [{...s.current!,speechAllowed:false},{...s.current!,text:'sk-'+'a'.repeat(30)},{...s.current!,kind:'proposal' as 'final_answer'}]){s.setCurrent(value);expect(await synthesizeCoachSpeech(s.input,s.options)).toMatchObject({error:'forbidden'});}expect(s.provider).not.toHaveBeenCalled();expect(s.l.calls).toEqual([]);
 });
 it('missing transport and cap0 have honest failure without network',async()=>{
  const s=setup();expect(await synthesizeCoachSpeech(s.input,{...s.options,provider:undefined})).toMatchObject({status:'not_connected'});
  expect(await synthesizeCoachSpeech(s.input,{...s.options,mode:'live'})).toMatchObject({error:'budget_blocked'});expect(s.provider).not.toHaveBeenCalled();expect(s.l.calls).toEqual([]);
 });
 it('withholds malformed, silent or too-long audio and retains reservation',async()=>{
  for(const audio of [new Uint8Array(0),new Uint8Array([1]),new Uint8Array(100),new Uint8Array(24000*2*31)]){const s=setup();s.provider.mockResolvedValue({audio,mediaType:'audio/pcm',usage:null});expect(await synthesizeCoachSpeech(s.input,s.options)).toMatchObject({error:'invalid_audio'});expect(s.l.records.get(s.b.attemptId)?.chargedNanoUsd).toBe(30000000);}
 });
 it('withholds regenerated/logout late result, propagates cancellation and bounds stalled transport',async()=>{
  for(const changed of ['revision','sessionEpoch','logout']){const s=setup(),original=s.provider.getMockImplementation()!;s.provider.mockImplementation(async i=>{s.setCurrent(changed==='logout'?null:{...s.current!,[changed]:randomUUID()});return original(i);});expect(await synthesizeCoachSpeech(s.input,s.options)).toMatchObject({error:'forbidden'});}
  const s=setup(),controller=new AbortController();s.options.signal=controller.signal;s.provider.mockImplementation(async()=>{controller.abort();return {audio:new Uint8Array([1,0]),mediaType:'audio/pcm',usage:null};});expect(await synthesizeCoachSpeech(s.input,s.options)).toMatchObject({error:'cancelled'});
  const stalled=setup();stalled.provider.mockImplementation(()=>new Promise(()=>{}));expect(await synthesizeCoachSpeech(stalled.input,{...stalled.options,deadlineMs:10})).toMatchObject({error:'deadline'});expect(stalled.l.records.get(stalled.b.attemptId)?.chargedNanoUsd).toBe(30000000);
 });
 it('binary transport rejects status/mime/silence without fake success and obeys live cap0 directly',async()=>{
  for(const response of [new Response('bad',{status:503}),new Response('bad',{headers:{'Content-Type':'text/html'}}),new Response(new Uint8Array(20),{headers:{'Content-Type':'audio/pcm'}})])await expect(createOpenAiCoachSpeechProvider({fetchImpl:vi.fn().mockResolvedValue(response)})({text:'text',signal:new AbortController().signal})).rejects.toThrow();
  await expect(createOpenAiCoachSpeechProvider()({text:'text',signal:new AbortController().signal})).rejects.toThrow('budget_blocked');
 });
});
