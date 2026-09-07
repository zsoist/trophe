import { isIsolatedEngineBoundary, type IsolatedEngineBoundary } from './isolated-engine-boundary';
import { GENERAL_EXPLANATIONS, GENERAL_EXPLANATION_VERSION, availableGeneralExplanations } from './curated-explanations';
import { COACH_CANDIDATE_PROMPT_VERSION, COACH_CANDIDATE_SYSTEM_PROMPT } from './prompt.v5';
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

export const candidateConversationSchema=openConversationSchema.extend({generalExplanationRefs:z.array(z.enum(['records_are_partial_view','planned_is_not_completed','nutrition_log_is_not_intake'])).max(3)});

/** Deterministic bounds and source binding do not establish semantic truth of prose.
 * Independent adversarial review and a paid quality evaluation remain necessary.
 */
export async function generateOpenConversation(input:CoachConversationRequest,response:CoachConversationResponse,provider:OfflineConversationProvider,signal:AbortSignal,reviewInterpretation?:OfflineInterpretationReview,candidateEvaluation=false,isolatedBoundary?:IsolatedEngineBoundary):Promise<void> {
  if(response.dataSource!=='synthetic'&&!isIsolatedEngineBoundary(isolatedBoundary,provider))throw new Error('budget_blocked');
  const facts=response.evidence;
  const entities=[...new Set(facts.flatMap(f=>f.sourceIds))].map((id,index)=>({alias:`entity:${index+1}`,evidenceRefs:facts.filter(f=>f.sourceIds.includes(id)).map(f=>f.id)}));
  const curated=availableGeneralExplanations(facts);
  const payload={...(candidateEvaluation?{generalExplanations:curated.map(id=>({id,...GENERAL_EXPLANATIONS[id]}))}:{}),message:input.message,history:input.history??[],
    snapshot:response.snapshot?{surface:response.snapshot.surface,language:response.snapshot.language,units:response.snapshot.units,window:response.snapshot.window}:null,
    foodPreference:response.foodPreference?{preferences:response.foodPreference.preferences,version:response.foodPreference.version,source:'current_profile',meaning:'self_declared_preference_not_allergy_or_medical_instruction'}:null,
    selection:response.snapshot?.selection??null,
    evidence:facts.map(({id,source,statement,value,unit,completeness})=>({id,source,statement,value,unit,completeness})),entities,
    profile:response.profile?{language:response.profile.language,timezone:response.profile.timezone,units:response.profile.units,preferences:response.profile.preferences}:null,
    memories:(response.memories??[]).map(({text,confirmation,source})=>({text,confirmation,source})),
    limitations:response.output?.limitations.filter(value=>value!=='open_ended_interpretation_not_connected'),actionsAvailable:false};
  const system=candidateEvaluation?COACH_CANDIDATE_SYSTEM_PROMPT:COACH_CONVERSATIONAL_SYSTEM_PROMPT+(reviewInterpretation?'\nAn independent offline interpretation oracle is configured for this fixture. Declarative explanations may be proposed in answer, grounded in cited evidence. They will be withheld unless that separate oracle approves. All numeric, receipt, entity, medical and action restrictions still apply.':'');
  let prompt=JSON.stringify(payload);
  const validator=candidateEvaluation?candidateConversationSchema:openConversationSchema;
  const promptVersion=candidateEvaluation?COACH_CANDIDATE_PROMPT_VERSION:COACH_CONVERSATIONAL_PROMPT_VERSION;
  const schema=z.toJSONSchema(validator);
  // UTF-8 bytes bound tokens conservatively, including schema/system overhead.
  let historyTrimmed=false;
  while(new TextEncoder().encode(system+prompt+JSON.stringify(schema)).length>7500&&payload.history.length) {
    // Current message, canonical facts and current context take priority. Drop
    // older assistant snippets before literal user history; never trim facts.
    const assistant=payload.history.findIndex(item=>item.role==='assistant');
    payload.history=payload.history.filter((_,index)=>index!==(assistant<0?0:assistant));
    historyTrimmed=true;prompt=JSON.stringify(payload);
  }
  if(new TextEncoder().encode(system+prompt+JSON.stringify(schema)).length>7500)throw new Error('context_limit');
  if(historyTrimmed)response.output?.limitations.push('history_trimmed_for_context_budget');
  signal.throwIfAborted();
  response.telemetry.modelCalls++;
  response.telemetry.promptVersion=promptVersion;
  if(response.telemetry.modelCalls>2)throw new Error('context_limit');
  let generated:ProviderResult<unknown>;
  try { generated=await provider({policy:{...taskPolicies.coach_assistant,promptVersion},system,prompt,schema,validator,signal,maxTokens:2000,maxAttempts:1,store:false}); }
  catch { signal.throwIfAborted();throw new Error('provider_unavailable'); }
  signal.throwIfAborted();
  const usage=generated.usage;
  const counts=[usage.inputTokens,usage.outputTokens,usage.reasoningTokens??0,usage.cacheReadTokens??0,usage.cacheWriteTokens??0];
  if(counts.some(value=>!Number.isSafeInteger(value)||value<0)||usage.inputTokens>8000||usage.outputTokens>2000||(usage.reasoningTokens??0)>usage.outputTokens)throw new Error('context_limit');
  response.telemetry.tokensIn=usage.inputTokens;response.telemetry.tokensOut=usage.outputTokens;
  response.telemetry.reasoningTokens=usage.reasoningTokens??0;response.telemetry.cacheReadTokens=usage.cacheReadTokens??0;response.telemetry.cacheWriteTokens=usage.cacheWriteTokens??0;
  // Injected fixture counters are diagnostics, not measured live usage or cost.
  const parsed=validator.safeParse(generated.output);
  if(!parsed.success||generated.rawStatus<200||generated.rawStatus>=300)throw new Error('invalid_output');
  const output=parsed.data;
  if(output.evidenceRefs.some(id=>!facts.some(f=>f.id===id))||output.entityRefs.some(alias=>!entities.some(e=>e.alias===alias&&e.evidenceRefs.some(id=>output.evidenceRefs.includes(id)))))throw new Error('invalid_output');
  if(output.facts.some(fragment=>!facts.some(f=>f.id===fragment.evidenceId&&output.evidenceRefs.includes(f.id))))throw new Error('invalid_output');
  // Questions and suggestions can also contain unsupported presuppositions.
  // Every prose field requires the independent offline oracle; no grammar bypass.
  if(!candidateEvaluation&&!reviewInterpretation)throw new Error('invalid_output');
  const prose=[output.answer,output.followUp??'',...output.limitations].join('\n');
  // Quantified record claims are rendered ONLY as full canonical statements.
  // A bag of valid values cannot establish which metric a number describes.
  if(/\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil)\b/i.test(prose))throw new Error('invalid_output');
  // Ref existence cannot authorize physiological or causal assertions in prose.
  // Such discussion requires a separate qualified evidence/evaluation path.
  if(/\b(?:activation|activacion|fatigue|fatiga|metabolism|metabolismo|hypertrophy|hipertrofia|caloric deficit|deficit calorico|caused|causado|proves|demuestra)\b/i.test(output.answer.normalize('NFKD').replace(/\p{M}/gu,'')))throw new Error('invalid_output');
  if(/https?:\/\/|\b(?:i have|i've|i)\s+(?:already\s+)?(?:saved|updated|changed|sent|approved|deleted|booked|confirmed)|\b(?:he|hemos|ya)\s+(?:guardado|actualizado|cambiado|enviado|aprobado|eliminado|confirmado)|\b(?:guard[eé]|actualic[eé]|envi[eé]|elimin[eé])\b/i.test(prose))throw new Error('invalid_output');
  if(!candidateEvaluation) {
    const review=await reviewInterpretation!({answer:output.answer,followUp:output.followUp,limitations:[...output.limitations],evidenceRefs:[...output.evidenceRefs],evidence:structuredClone(facts),signal});
    signal.throwIfAborted();
    if(review.approved!==true)throw new Error('invalid_output');
  }
  if(candidateEvaluation) {
    const normalized=prose.normalize('NFKD').replace(/\p{M}/gu,'');
    // Universal quantifiers and execution/completion predicates are account facts,
    // not contextual interpretation. Only canonical evidence may state them.
    // Curated general explanations are a separate renderer and are not scanned here.
    if(/\b(?:every|all|always|never|entire|fully|exactly|each|cada|todos|todas|siempre|nunca|ningun|ninguna|totalmente|completed|performed|fulfilled|finished|prescribed|completion|completad\w*|realizad\w*|cumplid\w*|finalizad\w*|prescrit\w*)\b/i.test(normalized))throw new Error('invalid_output');
    // Conservative release-candidate guards; independent tests, not a truth proof.
    // Apply to follow-ups too: interrogative syntax can hide the same assertion.
    if(/\b(?:saved|updated|sent|approved|deleted|booked|confirmed|guardad\w*|actualizad\w*|enviad\w*|aprobad\w*|eliminad\w*|confirmad\w*|heart|muscles?|stronger|healthier|blood|insulin|corazon|muscul\w*|salud\w*|hormon\w*|skipped|skipping|omitid\w*)\b/i.test(normalized))throw new Error('invalid_output');
    if(/\byou (?:are|were|have|did|completed|ate|trained)\b|\byour\b[^.!?]*\b(?:is|are|was|were|has|have|show|indicate|prove)\b|\btus?\b[^.!?]*\b(?:es|son|fue|fueron|demuestra\w*|indica\w*)\b/i.test(normalized))throw new Error('invalid_output');
    const candidate=candidateConversationSchema.parse(output);
    if(candidate.generalExplanationRefs.some(id=>!curated.includes(id)))throw new Error('invalid_output');
    const language=/[¿¡]|\b(?:que|como|podria|comida|semana)\b/i.test(input.message.normalize('NFKD').replace(/\p{M}/gu,''))||response.snapshot?.language.startsWith('es')?'es':'en';
    response.explanations=[...new Set(candidate.generalExplanationRefs)].map(id=>({kind:'curated_general',id,text:GENERAL_EXPLANATIONS[id][language],source:GENERAL_EXPLANATION_VERSION}));
  }
  const canonicalFacts=[...new Set(output.facts.map(fragment=>fragment.evidenceId))].map(id=>facts.find(f=>f.id===id)!.statement);
  response.output={answer:`${response.dataSource==='synthetic'?'Synthetic provider fixture evaluation.':'Isolated transport fixture evaluation using authorized records.'} ${candidateEvaluation?'Unapproved conversational candidate':'Offline oracle-reviewed interpretation'}: ${output.answer}${canonicalFacts.length?'\nRecorded facts:\n'+canonicalFacts.join('\n'):''}`,evidenceRefs:output.evidenceRefs,
    limitations:[...(response.output?.limitations??[]).filter(value=>value!=='open_ended_interpretation_not_connected'),'offline_transport_not_live_model_quality','prose_semantics_require_independent_evaluation',...output.limitations],
    suggestions:output.followUp?[output.followUp]:[],escalation:{required:output.escalation,reason:output.escalation?'coach_review':null,draft:null}};
  const model=response.snapshot?.capabilities.find(c=>c.key==='model');
  if(model){model.status='not_connected';model.reason=response.dataSource==='synthetic'?'synthetic_injected_provider_only':'isolated_authorized_records_fixture_transport';}
}
