import { describe,it,expect,vi } from 'vitest';
import { transcribeCoachAudio, type OfflineCoachTranscriber } from './voice';
import { prepareReviewedVoiceMessage, startCoachAudioRecording } from './voice-contract';
import { fixtureRepository } from './fixtures';
// Same existing 108ms silent Opus integration fixture as server-audio-duration.test.
const audio='GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAI3EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggFCTbuMU6uEHFO7a1OsggIh7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAyV0GNTGF2ZjYyLjEyLjEwMkSJiEBbAAAAAAAAFlSua+WuAQAAAAAAAFzXgQFzxYgsJ0xZKgl/uJyBACK1nIN1bmSIgQCGhkFfT1BVU1aqg2MuoFa7hATEtACDgQLhkZ+BAbWIQL9AAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBQB8AAAAAABJUw2f9c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2Mi4xMi4xMDJzc9djwItjxYgsJ0xZKgl/uGfIokWjh0VOQ09ERVJEh5VMYXZjNjIuMjguMTAyIGxpYm9wdXNnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjEwODAwMDAwMAAfQ7Z12OeBAKOLgQAAgAgL5jsjq2CjioEAFYAICKyzDsajioEAKYAICKyzDsajioEAPYAICKyzDsajioEAUYAICKyzDsaglqGKgQBlAAgIrLMOxpuBB3WihADN/mAcU7trkbuPs4EAt4r3gQHxggHE8IED';
const input={conversationId:'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId:'aac3a82e-898c-4907-b9b9-75133bb6d27f',locale:'es',durationMs:100};
const file=()=>new File([Buffer.from(audio,'base64')],'recording.webm',{type:'audio/webm;codecs=opus'});
const options=()=>({actorId:'synthetic-client',repository:fixtureRepository(),signal:new AbortController().signal});
const provider=()=>vi.fn<OfflineCoachTranscriber>().mockResolvedValue({output:{text:'Quiero revisar mi semana',languages:['es']},usage:{inputTokens:0,outputTokens:0},rawStatus:200,latencyMs:1});
describe('isolated coach voice adapter without paid STT',()=>{
  it('reuses recording-session cancellation to release a microphone granted after cancellation',async()=>{
    let grant!:(stream:{getTracks:()=>Array<{stop:()=>void}>})=>void;
    const stop=vi.fn();const complete=vi.fn();const createRecorder=vi.fn();
    const session=startCoachAudioRecording({onRequesting:vi.fn(),onRecording:vi.fn(),onComplete:complete,onError:vi.fn(),acquireStream:()=>new Promise(resolve=>{grant=resolve;}),createRecorder});
    session.cancel();grant({getTracks:()=>[{stop}]});
    await Promise.resolve();await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);expect(complete).not.toHaveBeenCalled();expect(createRecorder).not.toHaveBeenCalled();
  });
  it('measures the real container and returns editable text without submitting a conversation',async()=>{
    const transport=provider();const result=await transcribeCoachAudio(file(),input,{...options(),offlineTranscriber:transport});
    expect(result.ok).toBe(true);if(!result.ok)throw new Error('expected transcript');
    expect(result.durationMs).toBeGreaterThanOrEqual(100);expect(result.durationMs).toBeLessThanOrEqual(120);
    expect(result.status).toBe('review_required');expect(result.transcript).toMatchObject({locale:'es',source:'synthetic_fixture',trust:'untrusted_transcript'});
    expect(result.review).toMatchObject({editable:true,audioRetention:'discarded_after_transcription'});
    expect(result.review.token).toEqual(expect.any(String));expect(Date.parse(result.review.expiresAt)).toBeGreaterThan(Date.now());
    expect(result).not.toHaveProperty('audio');expect(result).not.toHaveProperty('file');expect(result).not.toHaveProperty('blob');
    expect(prepareReviewedVoiceMessage(result,result.scope,'Texto editado',false).ok).toBe(false);
    expect(prepareReviewedVoiceMessage(result,result.scope,'Texto editado',true)).toEqual({ok:true,message:'Texto editado'});
    expect(prepareReviewedVoiceMessage(result,{...result.scope,conversationId:input.turnId},'Texto editado',true)).toEqual({ok:false,error:'forbidden'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not invoke real STT or accept another subject or forged media',async()=>{
    const transport=provider();
    expect(await transcribeCoachAudio(file(),input,options())).toMatchObject({ok:false,status:'not_connected',error:'budget_blocked'});
    expect(await transcribeCoachAudio(file(),{...input,clientId:input.turnId},{...options(),offlineTranscriber:transport})).toMatchObject({error:'forbidden'});
    expect(await transcribeCoachAudio(new File(['not audio'],'recording.webm',{type:'audio/webm'}),input,{...options(),offlineTranscriber:transport})).toMatchObject({error:'invalid_audio'});
    expect(await transcribeCoachAudio(file(),{...input,durationMs:30001},{...options(),offlineTranscriber:transport})).toMatchObject({error:'invalid_input'});
    expect(transport).not.toHaveBeenCalled();
  });
  it('accepts a live transcriber only for authorized records and labels its output as untrusted provider text',async()=>{
    const config=options();config.repository.dataSource='authorized_records';
    const result=await transcribeCoachAudio(file(),input,{...config,offlineTranscriber:provider(),transcriptSource:'provider_transcript'});
    expect(result).toMatchObject({ok:true,transcript:{source:'provider_transcript',trust:'untrusted_transcript'}});
  });
  it('discards a transcript after revocation and cancels a stalled provider',async()=>{
    const config=options();let revoked=false;const auth=config.repository.authorize;
    config.repository.authorize=async(...args)=>{if(revoked)throw new Error('forbidden');return auth(...args);};
    const transport=provider();transport.mockImplementation(async()=>{revoked=true;return {output:{text:'text',languages:['es']},usage:{inputTokens:0,outputTokens:0},rawStatus:200,latencyMs:1};});
    expect(await transcribeCoachAudio(file(),input,{...config,offlineTranscriber:transport})).toMatchObject({ok:false,error:'forbidden'});
    const stalled=vi.fn<OfflineCoachTranscriber>(()=>new Promise(()=>{}));
    expect(await transcribeCoachAudio(file(),input,{...options(),offlineTranscriber:stalled,deadlineMs:10})).toMatchObject({error:'deadline'});
  });
});
