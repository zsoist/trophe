import { z } from 'zod';
import { taskPolicies } from '@/agents/router/policies';
import type { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
import type { ProviderResult } from '@/agents/runtime/types';
import type { CoachConversationRequest, CoachConversationResponse, CoachEvidence } from './contracts';
import { COACH_CONVERSATIONAL_PROMPT_VERSION, COACH_CONVERSATIONAL_SYSTEM_PROMPT } from './prompt.v4';

/** Same existing structured-provider input, injected only for synthetic evaluation. */
export type OfflineConversationProvider=(input:Parameters<typeof invokeStructuredProvider>[0])=>Promise<ProviderResult<unknown>>;
/** Explicit offline evaluation gate, supplied by an independent fixture oracle.
 * Never configured by request JSON, the generator, or the HTTP handler.
 */
export type OfflineInterpretationReview=(input:{answer:string;followUp:string|null;limitations:string[];evidenceRefs:string[];evidence:CoachEvidence[];signal:AbortSignal})=>Promise<{approved:boolean}>;
export const openConversationSchema=z.object({
  answer:z.string().trim().min(1).max(1800),
  evidenceRefs:z.array(z.string().max(100)).max(24),
  entityRefs:z.array(z.string().regex(/^entity:[1-9]\d*$/)).max(24),
  facts:z.array(z.object({kind:z.literal('record_fact'),evidenceId:z.string().max(100)}).strict()).max(24),
  followUp:z.string().trim().min(1).max(400).nullable(),
  limitations:z.array(z.enum(['insufficient_evidence','incomplete_records','professional_review_needed'])).max(3),escalation:z.boolean(),
}).strict();

/** Deterministic bounds and source binding do not establish semantic truth of prose.
 * Independent adversarial review and a paid quality evaluation remain necessary.
 */
export async function generateOpenConversation(input:CoachConversationRequest,response:CoachConversationResponse,provider:OfflineConversationProvider,signal:AbortSignal,reviewInterpretation?:OfflineInterpretationReview):Promise<void> {
  if(response.dataSource!=='synthetic')throw new Error('budget_blocked');
  const facts=response.evidence;
  const entities=[...new Set(facts.flatMap(f=>f.sourceIds))].map((id,index)=>({alias:`entity:${index+1}`,evidenceRefs:facts.filter(f=>f.sourceIds.includes(id)).map(f=>f.id)}));
  const payload={message:input.message,history:input.history??[],
    snapshot:response.snapshot?{surface:response.snapshot.surface,language:response.snapshot.language,units:response.snapshot.units,window:response.snapshot.window}:null,
    evidence:facts.map(({id,source,statement,value,unit,completeness})=>({id,source,statement,value,unit,completeness})),entities,
    profile:response.profile?{language:response.profile.language,timezone:response.profile.timezone,units:response.profile.units,preferences:response.profile.preferences}:null,
    memories:(response.memories??[]).map(({text,confirmation,source})=>({text,confirmation,source})),
    limitations:response.output?.limitations.filter(value=>value!=='open_ended_interpretation_not_connected'),actionsAvailable:false};
  const system=COACH_CONVERSATIONAL_SYSTEM_PROMPT+(reviewInterpretation?'\nAn independent offline interpretation oracle is configured for this fixture. Declarative explanations may be proposed in answer, grounded in cited evidence. They will be withheld unless that separate oracle approves. All numeric, receipt, entity, medical and action restrictions still apply.':'');
  const prompt=JSON.stringify(payload);
  const schema=z.toJSONSchema(openConversationSchema);
  // UTF-8 bytes bound tokens conservatively, including schema/system overhead.
  if(new TextEncoder().encode(system+prompt+JSON.stringify(schema)).length>7500)throw new Error('context_limit');
  signal.throwIfAborted();
  response.telemetry.modelCalls++;
  response.telemetry.promptVersion=COACH_CONVERSATIONAL_PROMPT_VERSION;
  if(response.telemetry.modelCalls>2)throw new Error('context_limit');
  let generated:ProviderResult<unknown>;
  try { generated=await provider({policy:{...taskPolicies.coach_assistant,promptVersion:COACH_CONVERSATIONAL_PROMPT_VERSION},system,prompt,schema,validator:openConversationSchema,signal,maxTokens:2000,maxAttempts:1,store:false}); }
  catch { signal.throwIfAborted();throw new Error('provider_unavailable'); }
  signal.throwIfAborted();
  const usage=generated.usage;
  const counts=[usage.inputTokens,usage.outputTokens,usage.reasoningTokens??0,usage.cacheReadTokens??0,usage.cacheWriteTokens??0];
  if(counts.some(value=>!Number.isSafeInteger(value)||value<0)||usage.inputTokens>8000||usage.outputTokens>2000||(usage.reasoningTokens??0)>usage.outputTokens)throw new Error('context_limit');
  response.telemetry.tokensIn=usage.inputTokens;response.telemetry.tokensOut=usage.outputTokens;
  response.telemetry.reasoningTokens=usage.reasoningTokens??0;response.telemetry.cacheReadTokens=usage.cacheReadTokens??0;response.telemetry.cacheWriteTokens=usage.cacheWriteTokens??0;
  // Injected fixture counters are diagnostics, not measured live usage or cost.
  const parsed=openConversationSchema.safeParse(generated.output);
  if(!parsed.success||generated.rawStatus<200||generated.rawStatus>=300)throw new Error('invalid_output');
  const output=parsed.data;
  if(output.evidenceRefs.some(id=>!facts.some(f=>f.id===id))||output.entityRefs.some(alias=>!entities.some(e=>e.alias===alias&&e.evidenceRefs.some(id=>output.evidenceRefs.includes(id)))))throw new Error('invalid_output');
  if(output.facts.some(fragment=>!facts.some(f=>f.id===fragment.evidenceId&&output.evidenceRefs.includes(f.id))))throw new Error('invalid_output');
  // Questions and suggestions can also contain unsupported presuppositions.
  // Every prose field requires the independent offline oracle; no grammar bypass.
  if(!reviewInterpretation)throw new Error('invalid_output');
  const prose=[output.answer,output.followUp??'',...output.limitations].join('\n');
  // Quantified record claims are rendered ONLY as full canonical statements.
  // A bag of valid values cannot establish which metric a number describes.
  if(/\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil)\b/i.test(prose))throw new Error('invalid_output');
  // Ref existence cannot authorize physiological or causal assertions in prose.
  // Such discussion requires a separate qualified evidence/evaluation path.
  if(/\b(?:activation|activacion|fatigue|fatiga|metabolism|metabolismo|hypertrophy|hipertrofia|caloric deficit|deficit calorico|caused|causado|proves|demuestra)\b/i.test(output.answer.normalize('NFKD').replace(/\p{M}/gu,'')))throw new Error('invalid_output');
  if(/https?:\/\/|\b(?:i have|i've|i)\s+(?:already\s+)?(?:saved|updated|changed|sent|approved|deleted|booked|confirmed)|\b(?:he|hemos|ya)\s+(?:guardado|actualizado|cambiado|enviado|aprobado|eliminado|confirmado)|\b(?:guard[eé]|actualic[eé]|envi[eé]|elimin[eé])\b/i.test(prose))throw new Error('invalid_output');
  {
    const review=await reviewInterpretation({answer:output.answer,followUp:output.followUp,limitations:[...output.limitations],evidenceRefs:[...output.evidenceRefs],evidence:structuredClone(facts),signal});
    signal.throwIfAborted();
    if(review.approved!==true)throw new Error('invalid_output');
  }
  const canonicalFacts=[...new Set(output.facts.map(fragment=>fragment.evidenceId))].map(id=>facts.find(f=>f.id===id)!.statement);
  response.output={answer:`Synthetic provider fixture evaluation. Offline oracle-reviewed interpretation: ${output.answer}${canonicalFacts.length?'\nRecorded facts:\n'+canonicalFacts.join('\n'):''}`,evidenceRefs:output.evidenceRefs,
    limitations:[...(response.output?.limitations??[]).filter(value=>value!=='open_ended_interpretation_not_connected'),'offline_transport_not_live_model_quality','prose_semantics_require_independent_evaluation',...output.limitations],
    suggestions:output.followUp?[output.followUp]:[],escalation:{required:output.escalation,reason:output.escalation?'coach_review':null,draft:null}};
  const model=response.snapshot?.capabilities.find(c=>c.key==='model');
  if(model){model.status='not_connected';model.reason='synthetic_injected_provider_only';}
}
