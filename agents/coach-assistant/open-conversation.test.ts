import { describe,it,expect,vi } from 'vitest';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
const request={version:'coach-assistant.v2',conversationId:'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId:'aac3a82e-898c-4907-b9b9-75133bb6d27f',message:'¿Y cómo podría organizarlo mejor?',history:[{role:'user',text:'Quiero entender mis comidas de esta semana.'},{role:'assistant',text:'Podemos revisar lo registrado.'}]};
const options=()=>({mode:'model' as const,actorId:'synthetic-client',repository:fixtureRepository(),signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z'),offlineInterpretationReview:async(candidate:{answer:string;followUp:string|null})=>({approved:candidate.answer===prose.answer&&candidate.followUp===prose.followUp})});
const prose={answer:'Podrías revisar si las comidas registradas representan tu rutina antes de decidir qué organizar.',evidenceRefs:[] as string[],entityRefs:[] as string[],facts:[] as Array<{kind:string;evidenceId:string}>,followUp:'¿Qué parte te cuesta más al elegir qué comer o encontrar tiempo para prepararlo?',limitations:[],escalation:false};
function provider(change?:(output:typeof prose,payload:Record<string,unknown>)=>unknown):OfflineConversationProvider {
  return vi.fn(async input=>{
    const payload=JSON.parse(input.prompt);
    const output={...prose,evidenceRefs:payload.evidence.map((f:{id:string})=>f.id)};
    return {output:change?change(output,payload):output,usage:{inputTokens:1000,outputTokens:250,reasoningTokens:40},latencyMs:1,rawStatus:200};
  });
}
describe('open v2 conversation with explicit synthetic provider',()=>{
  it('answers a free-text follow-up using bounded history and separately retained deterministic cards',async()=>{
    const transport=provider();
    const result=await runConversation(request,{...options(),offlineConversationProvider:transport});
    expect(result.error).toBeUndefined();expect(result.ok).toBe(true);
    expect(result.output?.answer).toContain(prose.answer);
    expect(result.output?.suggestions).toEqual([prose.followUp]);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.every(f=>f.source==='nutrition')).toBe(true);
    expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);
    expect(result.telemetry.modelCalls).toBe(1);expect(result.telemetry.costUsd).toBe(0);
    const call=vi.mocked(transport).mock.calls[0][0];
    expect(call.policy).toMatchObject({model:'gpt-5.6-luna',reasoningEffort:'low',maxCostUsd:0.0044});
    expect(call.maxAttempts).toBe(1);expect(call.maxTokens).toBe(2000);
    const payload=JSON.parse(call.prompt);expect(payload.history).toEqual(request.history);
    expect(call.prompt).not.toContain('synthetic-client');expect(call.prompt).not.toContain('synthetic-org');
  });
  it.each([
    (output:typeof prose)=>({...output,evidenceRefs:['missing-fact']}),
    (output:typeof prose)=>({...output,entityRefs:['entity:999']}),
    (output:typeof prose)=>({...output,answer:'Registraste 99999 calorías.'}),
    (output:typeof prose)=>({...output,answer:'He actualizado tu plan.'}),
    (output:typeof prose)=>({...output,facts:[{kind:'record_fact',evidenceId:'missing-fact'}]}),
  ])('rejects unbound references, entities, numbers and claimed mutations without retry',async change=>{
    const transport=provider(change);
    const result=await runConversation(request,{...options(),offlineConversationProvider:transport});
    expect(result.error?.code).toBe('invalid_output');expect(result.output).toBeUndefined();expect(result.evidence).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('renders quantified claims only as canonical typed facts and enforces the total output budget including reasoning',async()=>{
    const exact=provider((output,payload)=>{
      const fact=(payload.evidence as Array<{id:string;value:number|string;unit:string|null}>).find(f=>typeof f.value==='number')!;
      return {...output,facts:[{kind:'record_fact',evidenceId:fact.id}]};
    });
    expect((await runConversation(request,{...options(),offlineConversationProvider:exact})).ok).toBe(true);
    const excessive:OfflineConversationProvider=async()=>({output:prose,usage:{inputTokens:100,outputTokens:2001,reasoningTokens:1900},latencyMs:1,rawStatus:200});
    expect((await runConversation(request,{...options(),offlineConversationProvider:excessive})).error?.code).toBe('context_limit');
  });
  it('rejects swapped quantities despite valid references and rejects physiological assertions',async()=>{
    const swapped=provider(output=>({...output,answer:'6 sessions and 2 sets',facts:output.evidenceRefs.map(evidenceId=>({kind:'record_fact',evidenceId}))}));
    expect((await runConversation(request,{...options(),offlineConversationProvider:swapped})).error?.code).toBe('invalid_output');
    const physiology=provider(output=>({...output,answer:'Tus registros demuestran que tu metabolismo ha mejorado.'}));
    expect((await runConversation(request,{...options(),offlineConversationProvider:physiology})).error?.code).toBe('invalid_output');
  });
  it.each(['Your workout plan is now saved to your account.','Your heart is healthier and your muscles are stronger according to these records.','Your records show that you skipped meals.'])('rejects free declarative claims even when references exist',async answer=>{
    const transport=provider(output=>({...output,answer}));
    const result=await runConversation(request,{...options(),offlineConversationProvider:transport});
    expect(result.error?.code).toBe('invalid_output');expect(result.output).toBeUndefined();
  });
  it('keeps declarative explanations gated behind a separate explicit offline oracle',async()=>{
    const answer='The available entries leave open whether the log represents your usual routine.';
    const transport=provider(output=>({...output,answer}));
    const rejected=await runConversation(request,{...options(),offlineConversationProvider:transport,offlineInterpretationReview:async()=>({approved:false})});
    expect(rejected.error?.code).toBe('invalid_output');
    const approved=await runConversation(request,{...options(),offlineConversationProvider:transport,offlineInterpretationReview:async candidate=>{
      expect(candidate.answer).toBe(answer);expect(candidate.evidence.length).toBeGreaterThan(0);
      return {approved:true};
    }});
    expect(approved.output?.answer).toContain(answer);
    expect(approved.output?.answer).toContain('Offline oracle-reviewed');
  });
  it('requires independent review for questions and follow-ups too',async()=>{
    const answer='How would you maintain your stronger muscles and healthier heart shown by these records?';
    const transport=provider(output=>({...output,answer}));
    const result=await runConversation(request,{...options(),offlineConversationProvider:transport,offlineInterpretationReview:undefined});
    expect(result.error?.code).toBe('invalid_output');expect(result.output).toBeUndefined();
    const followUp=provider(output=>({...output,followUp:answer}));
    expect((await runConversation(request,{...options(),offlineConversationProvider:followUp})).error?.code).toBe('invalid_output');
  });
  it('rechecks authorization after generation and clears text on revocation',async()=>{
    const config=options();let revoked=false;
    const original=config.repository.authorize;
    config.repository.authorize=async(...args)=>{if(revoked)throw new Error('forbidden');return original(...args);};
    const transport=provider(output=>{revoked=true;return output;});
    const result=await runConversation(request,{...config,offlineConversationProvider:transport});
    expect(result.error?.code).toBe('forbidden');expect(result.output).toBeUndefined();expect(result.snapshot).toBeNull();
  });
  it('blocks real records or a missing injection at zero budget',async()=>{
    const transport=provider();const config=options();config.repository.dataSource='authorized_records';
    expect((await runConversation(request,{...config,offlineConversationProvider:transport})).error?.code).toBe('budget_blocked');
    expect((await runConversation(request,options())).error?.code).toBe('budget_blocked');
    expect(transport).not.toHaveBeenCalled();
  });
  it('keeps acute triage deterministic with no provider invocation',async()=>{
    const transport=provider();
    const result=await runConversation({...request,message:'I have chest pain and cannot breathe'}, {...options(),offlineConversationProvider:transport});
    expect(result.output?.escalation.reason).toBe('urgent_symptoms');expect(transport).not.toHaveBeenCalled();
  });
  it('handles provider failure and deadline without a hidden retry',async()=>{
    const transport=vi.fn<OfflineConversationProvider>().mockRejectedValue(new Error('private provider body'));
    const result=await runConversation(request,{...options(),offlineConversationProvider:transport});
    expect(result.error?.code).toBe('provider_unavailable');expect(JSON.stringify(result)).not.toContain('private provider');expect(transport).toHaveBeenCalledTimes(1);
    const stalled=vi.fn<OfflineConversationProvider>(()=>new Promise(()=>{}));
    const deadline=await runConversation(request,{...options(),deadlineMs:10,offlineConversationProvider:stalled});
    expect(deadline.error?.code).toBe('deadline');expect(deadline.output).toBeUndefined();
  });
});
