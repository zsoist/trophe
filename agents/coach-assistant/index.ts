import { COACH_CONTRACT_VERSION } from './contracts';
import type { CoachErrorCode, CoachResponse } from './contracts';
import { requestSchema, selectionSchema } from './schema';
import { collectEvidence } from './tools';
import type { EvidenceOptions } from './tools';
import type { ProviderResult } from '@/agents/runtime/types';
import { COACH_PRICING_VERSION } from './economics';
import { COACH_PROMPT_VERSION, COACH_SYSTEM_PROMPT } from './prompt.v3';

export interface RunOptions extends EvidenceOptions {
  mode: 'offline' | 'model';
  /** Only synthetic evaluation can supply this fixture transport adapter. */
  offlineModel?: (input: { system: string; prompt: string; signal: AbortSignal }) => Promise<ProviderResult<unknown>>;
  deadlineMs?: number;
}
const suggestionText = {
  ask_coach: 'Ask your human coach to review this question.',
  review_records: 'Review whether your recorded entries are complete.',
  clarify_plan: 'Ask your human coach to clarify the current plan before changing it.',
};
const knownErrors = new Set<CoachErrorCode>(['unauthenticated','forbidden','invalid_input','invalid_timezone','query_failed','cancelled','deadline','provider_unavailable','invalid_output','budget_blocked','context_limit']);

export async function run(raw: unknown, options: RunOptions): Promise<CoachResponse> {
  const started = performance.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort(new Error('cancelled'));
  if (options.signal.aborted) onAbort();
  else options.signal.addEventListener('abort', onAbort, { once: true });
  const deadlineMs = Math.min(45000, Math.max(1, options.deadlineMs ?? 45000));
  const timer = setTimeout(() => controller.abort(new Error('deadline')), deadlineMs);
  const response: CoachResponse = {
    version: COACH_CONTRACT_VERSION, ok: false, mode: options.mode, dataSource: options.repository.dataSource, evidence: [],
    telemetry: { model:null,provider:null,promptVersion:COACH_PROMPT_VERSION,modelCalls:0,dataReads:0,tokensIn:0,tokensOut:0,
      reasoningTokens:0,cacheReadTokens:0,cacheWriteTokens:0,latencyMs:0,costUsd:0,pricingVersion:COACH_PRICING_VERSION },
  };
  let onBoundaryAbort: (() => void) | undefined;
  try {
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) throw new Error('invalid_input');
    const input = parsed.data;
    const work = async () => {
      controller.signal.throwIfAborted();
      if (options.mode === 'model' && (!options.offlineModel || options.repository.dataSource !== 'synthetic')) throw new Error('budget_blocked');
      const data = await collectEvidence(input, { ...options, signal:controller.signal,
        onDataRead:count=>{response.telemetry.dataReads=count;} });
      response.telemetry.dataReads = data.reads;
      let selected = data.facts;
      let suggestions: Array<keyof typeof suggestionText> = input.intent === 'plan' ? ['clarify_plan'] : ['review_records'];
      let escalate = input.intent === 'plan';
      if (options.mode === 'model') {
        const prompt = JSON.stringify({ intent:input.intent, message:input.message,
          facts:data.facts.map(f => ({ id:f.id,statement:f.statement,completeness:f.completeness })), limitations:data.limitations });
        // UTF-8 byte count is deliberately conservative; reserve overhead for schema/wire.
        if (new TextEncoder().encode(COACH_SYSTEM_PROMPT + prompt).length > 6500) throw new Error('context_limit');
        response.telemetry.modelCalls = 1;
        const result = await options.offlineModel!({ system:COACH_SYSTEM_PROMPT,prompt,signal:controller.signal });
        controller.signal.throwIfAborted();
        const selection = selectionSchema.safeParse(result.output);
        if (!selection.success) throw new Error('invalid_output');
        const ids = new Set(data.facts.map(f => f.id));
        if (selection.data.factIds.some(id => !ids.has(id))) throw new Error('invalid_output');
        if (result.usage.outputTokens > 2000 || result.usage.inputTokens > 8000) throw new Error('context_limit');
        selected = data.facts.filter(f => selection.data.factIds.includes(f.id));
        suggestions = [...new Set(selection.data.suggestionCodes)];
        escalate ||= selection.data.escalate;
        // Fixture usage is diagnostic, not measured provider usage or spend.
        response.telemetry.tokensIn = result.usage.inputTokens;
        response.telemetry.tokensOut = result.usage.outputTokens;
        response.telemetry.reasoningTokens = result.usage.reasoningTokens ?? 0;
        response.telemetry.cacheReadTokens = result.usage.cacheReadTokens ?? 0;
        response.telemetry.cacheWriteTokens = result.usage.cacheWriteTokens ?? 0;
      }
      const message = input.message.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
      const urgent = /chest pain|dolor.*pecho|falta.*aire|can.t breathe|desmay|faint|passed out/.test(message);
      const medication = /insulin|medic|dosis|inject|inyect|dose/.test(message);
      // Broad referral categories; this is a conservative guard, not a clinical
      // classifier or a substitute for independent multilingual safety review.
      const medicalContext = /pregnan|embaraz|lactan|breastfeed|postpartum|posparto|enceinte|grossesse|εγκυ|θηλασ|vomit|purge|purgar|bulimi|anorexi|eating disorder|trastorno.*aliment|dehydrat|deshidrat|\binjur|lesion|surgery|cirugia/.test(message);
      const riskyRestriction = /(?:strict|extreme|prolonged|estrict|extrem|prolongad).*(?:fast|ayun|diet|restrict)|(?:ayun|fast|restrict).*(?:strict|extreme|estrict|extrem|prolongad)/.test(message);
      const recordsQuestion = /recorded|records|schedule|registrad|registro|horario/.test(message);
      const adviceRequest = /safe|clearance|should i|can i|recommend|design|restrict|diet|fast|ayun|segur|puedo|deberia|recomiend|disen/.test(message);
      const activeConcern = /vomit|purge|purgar|dehydrat|deshidrat/.test(message);
      // A health-history mention does not invalidate an ordinary records lookup.
      // Risky advice and acute concerns still require the existing referral.
      const benignLookup = recordsQuestion && !adviceRequest && !activeConcern;
      const medical = medication || riskyRestriction || medicalContext && !benignLookup;
      const reason = urgent ? 'urgent_symptoms' : medication ? 'medical_question' : medical ? 'medical_context' : escalate ? 'coach_review' : null;
      const disclaimer = 'No plan or record was changed. No message was sent.';
      const lead = urgent ? 'Stop exercising and seek urgent medical help. I cannot diagnose or clear you to continue.'
        : medication ? 'Medication dosing and medical clearance require a qualified healthcare professional.'
        : medical ? 'Please contact a qualified healthcare professional about this health context before changing your diet or training. I cannot design a restrictive diet or fasting plan for this situation.'
        : selected.length ? selected.map(f=>f.statement).join('\n') : 'There is not enough supported evidence to answer this question.';
      response.evidence = urgent || medical ? [] : selected;
      response.output = {
        answer: `${options.repository.dataSource === 'synthetic' ? 'Synthetic example records. ' : ''}${options.mode === 'offline' ? 'Offline deterministic summary. ' : 'Offline model transport evaluation. '}${lead}\n${disclaimer}`,
        evidenceRefs: response.evidence.map(f=>f.id),
        limitations: [...data.limitations, 'english_content', ...(options.mode === 'model' ? ['offline_transport_not_live_model_quality'] : []), ...(!selected.length ? ['insufficient_evidence'] : [])],
        suggestions: suggestions.map(code=>suggestionText[code]),
        escalation: { required:reason !== null,reason,draft:reason ? 'Please review my question and the available records with me. This is a prepared draft only.' : null },
      };
      response.ok = true;
    };
    await Promise.race([work(), new Promise<never>((_,reject)=>{
      onBoundaryAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort',onBoundaryAbort,{once:true});
      if (controller.signal.aborted) onBoundaryAbort();
    })]);
  } catch (error) {
    const code = controller.signal.aborted ? (options.signal.aborted ? 'cancelled' : 'deadline')
      : error instanceof Error && knownErrors.has(error.message as CoachErrorCode) ? error.message as CoachErrorCode
      : response.telemetry.modelCalls > 0 ? 'provider_unavailable' : 'query_failed';
    response.ok = false; delete response.output; response.evidence = [];
    response.error = { code,retryable:['query_failed','provider_unavailable','deadline'].includes(code) };
  } finally {
    clearTimeout(timer);
    if (onBoundaryAbort) controller.signal.removeEventListener('abort',onBoundaryAbort);
    options.signal.removeEventListener('abort',onAbort);
    response.telemetry.latencyMs = Math.round(performance.now()-started);
  }
  return response;
}
