import { pick } from '@/agents/router';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
import { selectionJsonSchema, selectionSchema } from './schema';

/** Fixture-only probe of the real shared transport. No live entrypoint in this wave. */
export async function invokeOfflineCoachModel(input: {
  system: string; prompt: string; signal: AbortSignal;
  effort?: 'none' | 'low' | 'medium'; fetchImpl: typeof fetch;
}) {
  if (typeof input.fetchImpl !== 'function' || input.fetchImpl === globalThis.fetch) throw new Error('budget_blocked');
  const policy = pick('coach_assistant');
  return invokeStructuredProvider({
    policy:{...policy,reasoningEffort:input.effort ?? policy.reasoningEffort},system:input.system,prompt:input.prompt,signal:input.signal,
    maxTokens:policy.maxTokens,maxAttempts:1,
    store:false,toolName:'select_coach_evidence',toolDescription:'Select only supplied fact identifiers',
    schema:selectionJsonSchema,validator:selectionSchema,strict:true,fetchImpl:input.fetchImpl,
  });
}
