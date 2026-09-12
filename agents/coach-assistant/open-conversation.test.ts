import { afterEach,describe,it,expect,vi } from 'vitest';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
const request={version:'coach-assistant.v2',conversationId:'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId:'aac3a82e-898c-4907-b9b9-75133bb6d27f',message:'¿Y cómo podría organizarlo mejor?',history:[{role:'user',text:'Quiero entender mis comidas de esta semana.'},{role:'assistant',text:'Podemos revisar lo registrado.'}]};
const options=()=>({mode:'model' as const,actorId:'synthetic-client',repository:fixtureRepository(),signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z'),offlineInterpretationReview:async(candidate:{answer:string;followUp:string|null})=>({approved:candidate.answer===prose.answer&&candidate.followUp===prose.followUp})});
const prose={answer:'Podrías revisar si las comidas registradas representan tu rutina antes de decidir qué organizar.',evidenceRefs:[] as string[],entityRefs:[] as string[],facts:[] as Array<{kind:string;evidenceId:string}>,followUp:'¿Qué parte te cuesta más al elegir qué comer o encontrar tiempo para prepararlo?',limitations:[],escalation:false};
afterEach(()=>{delete process.env.COACH_ASSISTANT_OUTPUT_DIAGNOSTICS_ENABLED;delete process.env.VERCEL_ENV;vi.restoreAllMocks();});
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
    const properties=call.schema.properties as Record<string,unknown>;const required=call.schema.required as string[];
    expect(new Set(required)).toEqual(new Set(Object.keys(properties)));expect(properties.actionIntent).toMatchObject({anyOf:expect.arrayContaining([{type:'null'}])});
    const payload=JSON.parse(call.prompt);expect(payload.history).toEqual(request.history);
    expect(call.prompt).not.toContain('synthetic-client');expect(call.prompt).not.toContain('synthetic-org');
  });
  it.each([
    (output:typeof prose)=>({...output,evidenceRefs:['missing-fact']}),
    (output:typeof prose)=>({...output,entityRefs:['entity:999']}),
    (output:typeof prose)=>({...output,answer:'Registraste 99999 calorías.'}),
    (output:typeof prose)=>({...output,answer:'He actualizado tu plan.'}),
    (output:typeof prose)=>({...output,facts:[{kind:'record_fact',evidenceId:'missing-fact'}]}),
    (output:typeof prose)=>({...output,userStatementRef:'history'}),
  ])('rejects unbound references, entities, numbers and claimed mutations without retry',async change=>{
    const transport=provider(change);
    const result=await runConversation(request,{...options(),offlineConversationProvider:transport});
    expect(result.error?.code).toBe('invalid_output');expect(result.output).toBeUndefined();expect(result.evidence).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('emits only a closed rejection stage while preserving the public invalid_output contract',async()=>{
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const privateOutput='SENSITIVE_MODEL_OUTPUT 150 gramos';
    const transport=provider(output=>({...output,answer:privateOutput}));
    const result=await runConversation(request,{...options(),offlineConversationProvider:transport});
    expect(result.error?.code).toBe('invalid_output');
    expect(result.output).toBeUndefined();expect(transport).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();
    const diagnostic=String(warning.mock.calls[0]?.[0]);
    expect(JSON.parse(diagnostic)).toEqual({event:'coach_conversation_output_rejected',code:'numeric_prose'});
    expect(diagnostic).not.toContain(privateOutput);expect(diagnostic).not.toContain('150 gramos');
  });
  it('aligns candidate food guidance with the conservative prose validator',async()=>{
    const transport=provider(output=>({...output,answer:'Podrías combinar verduras, proteína y una fuente de carbohidratos según tus preferencias.',followUp:'¿Tienes alguna preferencia alimentaria?',generalExplanationRefs:[]}));
    const result=await runConversation(request,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
    expect(result.ok).toBe(true);expect(result.output?.answer).toContain('verduras');
    const call=vi.mocked(transport).mock.calls[0][0];
    expect(call.policy.promptVersion).toBe('coach-assistant.conversation.v5-candidate.5-live02');
    expect(call.system).toContain('For food guidance, describe concrete meal components and choices in neutral terms');
    expect(call.system).toContain('avoid the words salud, saludable, health and healthy');
  });
  it.each([
    {answer:'Recorded quantity 15 kilograms.',code:'numeric_prose',category:'numeric_token',position:18},
    {answer:'Every workout entry is available.',code:'candidate_universal_claim',category:'universal_or_completion_token',position:0},
    {answer:'Estás saludable.',code:'candidate_sensitive_claim',category:'sensitive_claim_token',position:6},
  ] as const)('emits a typed $code diagnostic in explicitly flagged Preview without retaining prose',async({answer,code,category,position})=>{
    process.env.COACH_ASSISTANT_OUTPUT_DIAGNOSTICS_ENABLED='1';process.env.VERCEL_ENV='preview';
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const transport=provider(output=>({...output,answer,generalExplanationRefs:[]}));
    const result=await runConversation(request,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
    expect(result.error?.code).toBe('invalid_output');expect(result.output).toBeUndefined();expect(transport).toHaveBeenCalledOnce();
    const diagnostic=JSON.parse(String(warning.mock.calls[0]?.[0]));
    expect(diagnostic).toEqual({event:'coach_conversation_output_rejected',code,diagnostic:{schemaVersion:'coach-assistant.output-rejection-diagnostic.v1',outputSchemaVersion:'coach-assistant.candidate-output.v1',promptVersion:'coach-assistant.conversation.v5-candidate.5-live02',rule:code,category,field:'answer',path:'output.answer',position,positionEncoding:code==='numeric_prose'?'original':'nfkd_without_marks',correlation:expect.stringMatching(/^[a-f0-9]{16}$/)}});
    expect(JSON.stringify(diagnostic)).not.toContain(answer);expect(JSON.stringify(diagnostic)).not.toContain('kilograms');expect(JSON.stringify(diagnostic)).not.toContain('workout entry');expect(JSON.stringify(diagnostic)).not.toContain('saludable');expect(JSON.stringify(diagnostic)).not.toContain('Estás');expect(JSON.stringify(diagnostic)).not.toContain('Estas');
  });
  it('locates a sensitive follow-up with static metadata only',async()=>{
    process.env.COACH_ASSISTANT_OUTPUT_DIAGNOSTICS_ENABLED='1';process.env.VERCEL_ENV='preview';
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const followUp='¿Tu corazón está saludable?';
    const transport=provider(output=>({...output,answer:'Se puede elegir entre alimentos variados.',followUp,generalExplanationRefs:[]}));
    const result=await runConversation(request,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
    expect(result.error?.code).toBe('invalid_output');expect(result.output).toBeUndefined();
    const diagnostic=JSON.parse(String(warning.mock.calls[0]?.[0]));
    expect(diagnostic).toEqual({event:'coach_conversation_output_rejected',code:'candidate_sensitive_claim',diagnostic:{schemaVersion:'coach-assistant.output-rejection-diagnostic.v1',outputSchemaVersion:'coach-assistant.candidate-output.v1',promptVersion:'coach-assistant.conversation.v5-candidate.5-live02',rule:'candidate_sensitive_claim',category:'sensitive_claim_token',field:'followUp',path:'output.followUp',position:4,positionEncoding:'nfkd_without_marks',correlation:expect.stringMatching(/^[a-f0-9]{16}$/)}});
    expect(JSON.stringify(diagnostic)).not.toContain(followUp);expect(JSON.stringify(diagnostic)).not.toContain('corazón');expect(JSON.stringify(diagnostic)).not.toContain('corazon');
  });
  it('keeps detailed diagnostics disabled outside Preview even when the flag is set',async()=>{
    process.env.COACH_ASSISTANT_OUTPUT_DIAGNOSTICS_ENABLED='1';process.env.VERCEL_ENV='production';
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const transport=provider(output=>({...output,answer:'Recorded quantity 15 kilograms.',generalExplanationRefs:[]}));
    const result=await runConversation(request,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
    expect(result.error?.code).toBe('invalid_output');
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toEqual({event:'coach_conversation_output_rejected',code:'numeric_prose'});
  });
  it('allows a useful distinction for the reviewed transcript without promoting its quantity to a recorded fact',async()=>{
    const voiceRequest={...request,message:'I did not lift 15 kilograms today. What is the difference between a workout plan and a workout log?',context:{surface:'workout' as const,includeScreen:true},history:[]};
    const safeAnswer='A statement in an editable transcript and a recorded training entry are separate sources. A plan describes intended training; a log contains recorded training entries.';
    const safeProvider:OfflineConversationProvider=vi.fn(async()=>({output:{...prose,answer:safeAnswer,evidenceRefs:[],entityRefs:[],facts:[],followUp:null,limitations:[],escalation:false,actionIntent:null,generalExplanationRefs:[]},usage:{inputTokens:1000,outputTokens:250,reasoningTokens:40},latencyMs:1,rawStatus:200}));
    const allowed=await runConversation(voiceRequest,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:safeProvider});
    expect(allowed.ok).toBe(true);expect(allowed.output?.answer).toContain(safeAnswer);
    expect(allowed.output?.answer).not.toContain('15');expect(allowed.output?.answer).not.toContain('kilograms');
    expect(allowed.proposals).toEqual([]);expect(allowed.actionIntents).toEqual([]);expect(allowed.receipts).toEqual([]);
    expect(vi.mocked(safeProvider).mock.calls[0][0].prompt).toContain(voiceRequest.message);

    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const echoProvider:OfflineConversationProvider=vi.fn(async()=>({output:{...prose,answer:'Your workout log contains a set at 15 kilograms.',evidenceRefs:[],entityRefs:[],facts:[],followUp:null,limitations:[],escalation:false,actionIntent:null,generalExplanationRefs:[]},usage:{inputTokens:1000,outputTokens:250,reasoningTokens:40},latencyMs:1,rawStatus:200}));
    const rejected=await runConversation(voiceRequest,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:echoProvider});
    expect(rejected.error?.code).toBe('invalid_output');expect(rejected.output).toBeUndefined();
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toEqual({event:'coach_conversation_output_rejected',code:'numeric_prose'});
  });
  it.each([
    'I did not lift 15 kilograms today. What is the difference between a workout plan and a workout log?',
    'Hoy no comí 220 gramos. ¿Cómo debo interpretar un plan frente a un registro?',
  ])('renders the current user statement as unverified input without turning it into account evidence: %s',async message=>{
    const voiceRequest={...request,message,context:{surface:'workout' as const,includeScreen:true},history:[]};
    const transport:OfflineConversationProvider=vi.fn(async()=>({output:{...prose,answer:'The reviewed statement is user-provided context. A plan describes intent, while a log contains recorded entries.',evidenceRefs:[],entityRefs:[],facts:[],userStatementRef:'current_message',followUp:null,limitations:[],escalation:false,actionIntent:null,generalExplanationRefs:[]},usage:{inputTokens:1000,outputTokens:250,reasoningTokens:40},latencyMs:1,rawStatus:200}));
    const result=await runConversation(voiceRequest,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
    expect(result.error).toBeUndefined();expect(result.ok).toBe(true);expect(result.output?.answer).not.toContain('User statement (unverified)');expect(result.output?.answer).not.toContain(message);
    expect(result.output?.evidenceRefs).toEqual([]);expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.proposals).toEqual([]);expect(result.actionIntents).toEqual([]);expect(result.receipts).toEqual([]);
    const payload=JSON.parse(vi.mocked(transport).mock.calls[0][0].prompt);
    expect(payload).toMatchObject({message,messageProvenance:{source:'current_user_message',trust:'untrusted_user_data',authority:'statement_only'}});
  });
  it('allows a strictly negative record limitation but rejects positive or mixed physiology beside the same typed sources',async()=>{
    const message='I did not lift 15 kilograms today. What does my recorded workout data show?';
    const voiceRequest={...request,message,context:{surface:'workout' as const,includeScreen:true},history:[]};
    const providerFor=(answer:string):OfflineConversationProvider=>vi.fn(async input=>{
      const payload=JSON.parse(input.prompt);const fact=payload.evidence.find((item:{id:string})=>item.id==='workout.completedSessions');
      return {output:{...prose,answer,evidenceRefs:[fact.id],entityRefs:[],facts:[{kind:'record_fact',evidenceId:fact.id}],userStatementRef:'current_message',followUp:null,limitations:[],escalation:false,actionIntent:null,generalExplanationRefs:[]},usage:{inputTokens:1000,outputTokens:250,reasoningTokens:40},latencyMs:1,rawStatus:200};
    });
    const safeDisclaimer='The records do not establish muscle activation.';
    const transport=providerFor(safeDisclaimer);
    const result=await runConversation(voiceRequest,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
    expect(result.error).toBeUndefined();expect(result.ok).toBe(true);
    expect(result.output?.answer).toContain(safeDisclaimer);
    expect(result.output?.answer).not.toContain('User statement (unverified)');
    expect(result.output?.answer).not.toContain(message);
    expect(result.output?.answer).toContain('Recorded facts:');
    expect(result.proposals).toEqual([]);expect(result.actionIntents).toEqual([]);expect(result.receipts).toEqual([]);
    for(const answer of [
      'The records establish muscle activation.',
      'The records do not establish muscle activation, but your muscles are stronger.',
      'The records do not establish muscle activation; your heart is healthier.',
      'The records do not establish muscle activation. You should increase your rest.',
      'The records do not establish muscle activation. This means your recovery needs improvement.',
    ]){
      const rejected=await runConversation(voiceRequest,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:providerFor(answer)});
      expect(rejected.error?.code).toBe('invalid_output');expect(rejected.output).toBeUndefined();
    }
    const ungrounded:OfflineConversationProvider=vi.fn(async()=>({output:{...prose,answer:safeDisclaimer,evidenceRefs:[],entityRefs:[],facts:[],userStatementRef:'current_message',followUp:null,limitations:[],escalation:false,actionIntent:null,generalExplanationRefs:[]},usage:{inputTokens:1000,outputTokens:250,reasoningTokens:40},latencyMs:1,rawStatus:200}));
    expect((await runConversation(voiceRequest,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:ungrounded})).error?.code).toBe('invalid_output');
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
  it.each([
    {answer:'Podrías elegir una comida con verduras, proteína y una fuente de carbohidratos que encaje con tus preferencias.',ok:true},
    {answer:'Una comida puede combinar alimentos variados.',ok:true},
    {answer:'Se puede elegir entre opciones variadas.',ok:true},
    {answer:'Esta comida tiene opciones variadas.',ok:true},
    {answer:'Podrías elegir una comida saludable que encaje con tus preferencias.',ok:false},
    {answer:'Una alimentación saludable puede incluir opciones variadas.',ok:false},
    {answer:'Tu salud está mejor.',ok:false},
    {answer:'Estás saludable.',ok:false},
    {answer:'Está saludable.',ok:false},
    {answer:'Eres saludable.',ok:false},
    {answer:'Pareces saludable.',ok:false},
    {answer:'Te ves saludable.',ok:false},
    {answer:'Tienes buena salud.',ok:false},
    {answer:'Tienes una alimentación saludable.',ok:false},
    {answer:'Usted tiene una alimentación saludable.',ok:false},
    {answer:'Ustedes tienen una alimentación saludable.',ok:false},
    {answer:'Tu cuerpo está saludable.',ok:false},
    {answer:'Tus músculos están más fuertes.',ok:false},
  ])('keeps Spanish health terms behind the conservative candidate boundary: $answer',async({answer,ok})=>{
    const transport=provider(output=>({...output,answer,followUp:null,generalExplanationRefs:[]}));
    const result=await runConversation(request,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
    expect(result.ok).toBe(ok);
    expect(result.output?.answer).toBe(ok?answer:undefined);
    expect(result.error?.code).toBe(ok?undefined:'invalid_output');
  });
  it('applies the same health boundary to follow-ups while allowing neutral food guidance',async()=>{
    const allowedTransport=provider(output=>({...output,answer:'Se puede elegir entre alimentos variados.',followUp:'¿Tienes alguna preferencia alimentaria?',generalExplanationRefs:[]}));
    const allowed=await runConversation(request,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:allowedTransport});
    expect(allowed.ok).toBe(true);expect(allowed.output?.suggestions).toEqual(['¿Tienes alguna preferencia alimentaria?']);
    for(const followUp of ['¿Tienes una alimentación saludable?','¿Usted tiene una alimentación saludable?','¿Ustedes tienen una alimentación saludable?']){
      const transport=provider(output=>({...output,answer:'Se puede elegir entre alimentos variados.',followUp,generalExplanationRefs:[]}));
      const result=await runConversation(request,{...options(),offlineCandidateEvaluation:true,offlineConversationProvider:transport});
      expect(result.error?.code).toBe('invalid_output');expect(result.output).toBeUndefined();
    }
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
    expect(approved.output?.answer).not.toContain('Offline oracle-reviewed');
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
