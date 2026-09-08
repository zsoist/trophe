import { describe,it,expect,vi } from 'vitest';
import { runConversationCandidate } from './conversation-candidate';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
const base={version:'coach-assistant.v2',conversationId:'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId:'aac3a82e-898c-4907-b9b9-75133bb6d27f',message:'How should I interpret my food records this week?'};
const options=()=>({mode:'model' as const,actorId:'synthetic-client',repository:fixtureRepository(),signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z')});
function provider(answer:string,followUp:string|null=null):OfflineConversationProvider {
  return vi.fn(async input=>{
    const context=JSON.parse(input.prompt);
    return {output:{answer,followUp,evidenceRefs:context.evidence.map((f:{id:string})=>f.id),entityRefs:[],facts:context.evidence.map((f:{id:string})=>({kind:'record_fact',evidenceId:f.id})),generalExplanationRefs:['records_are_partial_view'],limitations:['incomplete_records'],escalation:false},usage:{inputTokens:1100,outputTokens:250,reasoningTokens:50},latencyMs:1,rawStatus:200};
  });
}
describe('unapproved full conversation release candidate (injected transport, no per-turn oracle)',()=>{
  it.each([
    ['How should I interpret my food records this week?','A log offers a starting point for review rather than a complete picture of daily life. Checking whether entries represent the usual routine can help frame the next discussion.','What was hardest to record consistently?'],
    ['¿Y cómo podría organizarlo mejor?','Organizar la revisión alrededor de los momentos difíciles puede ayudar a formular una pregunta concreta. La explicación general debe mantenerse separada de los datos anotados.','¿Qué momento te resulta más difícil de organizar?'],
  ])('accepts a positive declarative explanation and open follow-up: %s',async(message,answer,followUp)=>{
    const transport=provider(answer,followUp);
    const result=await runConversationCandidate({...base,message,history:[{role:'user',text:'I want to understand this week’s food log.'}]},{...options(),offlineConversationProvider:transport});
    expect(result.error).toBeUndefined();expect(result.ok).toBe(true);expect(result.output?.answer).toContain(answer);expect(result.output?.suggestions).toEqual([followUp]);
    expect(result.evaluation).toMatchObject({release:'unapproved_candidate',semanticQualityVerified:false});
    expect(result.explanations?.[0]).toMatchObject({kind:'curated_general',id:'records_are_partial_view',source:'coach-general.v1'});
    expect(result.evidence.length).toBeGreaterThan(0);expect(result.receipts).toEqual([]);expect(result.proposals).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    'Your workout plan is now saved to your account.',
    'Your heart is healthier and your muscles are stronger according to these records.',
    'How would you maintain your stronger muscles and healthier heart shown by these records?',
    '6 sessions and 2 sets',
    'Your entries show that you skipped meals.',
    'Every planned repetition was completed exactly as prescribed.',
    'The entire prescription was fulfilled.',
  ])('rejects a known unsupported account/action/health claim: %s',async answer=>{
    const result=await runConversationCandidate(base,{...options(),offlineConversationProvider:provider(answer)});
    expect(result.ok).toBe(false);expect(result.output).toBeUndefined();expect(result.error?.code).toBe('invalid_output');
  });
  it('checks follow-up presuppositions and refuses fabricated curated sources',async()=>{
    const result=await runConversationCandidate(base,{...options(),offlineConversationProvider:provider('A log is a starting point for discussion.','How would you maintain your stronger muscles?')});
    expect(result.error?.code).toBe('invalid_output');
    const bad:OfflineConversationProvider=async input=>{
      const original=await provider('A log is a starting point for discussion.')(input);
      return {...original,output:{...(original.output as object),generalExplanationRefs:['physiology_proven']}};
    };
    expect((await runConversationCandidate(base,{...options(),offlineConversationProvider:bad})).error?.code).toBe('invalid_output');
  });
  it('does not enable candidate mode through request JSON or the ordinary contained entrypoint',async()=>{
    const transport=provider('A log is a starting point for discussion.');
    expect((await runConversation({...base,offlineCandidateEvaluation:true},{...options(),offlineConversationProvider:transport})).error?.code).toBe('invalid_input');
    expect((await runConversation(base,{...options(),offlineConversationProvider:transport})).error?.code).toBe('invalid_output');
    const config=options();config.repository.dataSource='authorized_records';
    expect((await runConversationCandidate(base,{...config,offlineConversationProvider:transport})).error?.code).toBe('budget_blocked');
  });
});
