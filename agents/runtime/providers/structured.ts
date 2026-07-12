import type { z } from 'zod';
import { callGeminiMessages } from '@/agents/clients/google';
import { invokeAnthropicJson } from './anthropic';
import { invokeDeepSeekStructured } from './deepseek';
import { invokeOpenAiStructured } from './openai';
import { AiProviderError } from './errors';
import type { RoutingPolicy } from '@/agents/router/policies';
import type { ProviderResult } from '../types';

/**
 * Gemini-specific structured output via constrained decoding (responseSchema).
 *
 * Kept as a named export for call sites that are hardcoded to Gemini
 * (e.g. food_parse). New code should prefer invokeStructuredProvider().
 */
export async function invokeGeminiStructured<T>(input: {
  policy: RoutingPolicy;
  system: string;
  prompt: string;
  signal: AbortSignal;
  responseSchema: Record<string, unknown>;
  validator: z.ZodType<T>;
  maxTokens?: number;
}): Promise<ProviderResult<T>> {
  if (input.signal.aborted) throw new Error('AI request aborted');
  if (input.policy.provider !== 'google') throw new Error('Structured Gemini provider requires a Google policy');

  const result = await callGeminiMessages({
    model: input.policy.model,
    system: input.system,
    userMessage: input.prompt,
    maxTokens: input.maxTokens ?? input.policy.maxTokens,
    disableThinking: true,
    responseSchema: input.responseSchema,
  });
  if (result.rawError || result.rawStatus === 0) throw new Error(result.rawError ?? 'Provider request failed');

  const output = input.validator.parse(JSON.parse(result.text));
  return {
    output,
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    },
    latencyMs: result.latencyMs,
    rawStatus: result.rawStatus,
  };
}

// ── Unified structured provider dispatcher ─────────────────────────────────
//
// Routes to DeepSeek (tool calling + /beta strict), Anthropic (tool_use),
// or Gemini (constrained decoding) based on policy.provider.
// Mirrors invokeTextProvider() from text.ts for structural symmetry.
//
// All providers receive the same JSON Schema + Zod validator.
// The dispatcher adapts the wire format per provider:
//   - DeepSeek: tools[].function.parameters + tool_choice (strict mode)
//   - Anthropic: tools[].input_schema + tool_choice
//   - Google:    responseSchema (constrained decoding, no tool wrapping)

export async function invokeStructuredProvider<T>(input: {
  policy: RoutingPolicy;
  system: string;
  prompt: string;
  signal: AbortSignal;
  /** Standard JSON Schema describing the expected output. */
  schema: Record<string, unknown>;
  /** Zod validator — the real validation layer (catches provider deviations). */
  validator: z.ZodType<T>;
  /** Tool name for DeepSeek/Anthropic function calling (default: 'submit_result'). */
  toolName?: string;
  /** Tool description for DeepSeek/Anthropic (default: 'Submit structured result'). */
  toolDescription?: string;
  /** Enable DeepSeek /beta strict mode (requires additionalProperties: false). */
  strict?: boolean;
  maxTokens?: number;
  userId?: string;
  clientRequestId?: string;
}): Promise<ProviderResult<T>> {
  if (input.signal.aborted) throw new Error('AI request aborted');

  const toolName = input.toolName ?? 'submit_result';
  const toolDescription = input.toolDescription ?? 'Submit structured result';
  const strict = input.strict ?? true;

  // ── DeepSeek: tool calling with optional /beta strict mode ────────────
  if (input.policy.provider === 'deepseek') {
    return invokeDeepSeekStructured({
      model: input.policy.model as 'deepseek-v4-flash' | 'deepseek-v4-pro',
      system: input.system,
      prompt: input.prompt,
      maxTokens: input.maxTokens ?? input.policy.maxTokens,
      signal: input.signal,
      userId: input.userId,
      toolName,
      description: toolDescription,
      schema: input.schema,
      validator: input.validator,
      strict,
    });
  }

  // ── OpenAI: strict function calling (used by the Phase 2 Luna eval) ──
  if (input.policy.provider === 'openai') {
    return invokeOpenAiStructured({
      model: input.policy.model,
      system: input.system,
      prompt: input.prompt,
      maxTokens: input.maxTokens ?? input.policy.maxTokens,
      signal: input.signal,
      toolName,
      description: toolDescription,
      schema: input.schema,
      validator: input.validator,
      strict,
      cacheKey: `trophe:${input.policy.model}:${input.policy.promptVersion}:${toolName}`,
      clientRequestId: input.clientRequestId,
    });
  }

  // ── Anthropic: tool_use with tool_choice enforcement ──────────────────
  if (input.policy.provider === 'anthropic') {
    const result = await invokeAnthropicJson<{
      content?: Array<{ type: string; name?: string; input?: unknown }>;
    }>({
      signal: input.signal,
      body: {
        model: input.policy.model,
        max_tokens: input.maxTokens ?? input.policy.maxTokens,
        system: input.policy.cacheSystem
          ? [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }]
          : input.system,
        messages: [{ role: 'user', content: input.prompt }],
        tools: [{
          name: toolName,
          description: toolDescription,
          input_schema: input.schema,
        }],
        tool_choice: { type: 'tool', name: toolName },
      },
    });
    const content = Array.isArray(result.output.content) ? result.output.content : [];
    const toolUse = content.find(
      (c) => c.type === 'tool_use' && c.name === toolName,
    );
    if (!toolUse?.input) {
      throw new AiProviderError({
        provider: 'anthropic',
        message: 'Anthropic structured response missing tool call',
        status: result.rawStatus,
        errorType: 'provider_protocol_error',
        errorCode: 'missing_tool_call',
        providerRequestId: result.providerRequestId,
        providerGenerationId: result.providerGenerationId,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });
    }
    let output: T;
    try {
      output = input.validator.parse(toolUse.input);
    } catch {
      throw new AiProviderError({
        provider: 'anthropic',
        message: 'Anthropic structured response failed validation',
        status: result.rawStatus,
        errorType: 'provider_protocol_error',
        errorCode: 'invalid_structured_output',
        providerRequestId: result.providerRequestId,
        providerGenerationId: result.providerGenerationId,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });
    }
    return {
      output,
      usage: result.usage,
      latencyMs: result.latencyMs,
      rawStatus: result.rawStatus,
      providerGenerationId: result.providerGenerationId,
      providerRequestId: result.providerRequestId,
    };
  }

  // ── Google Gemini: constrained decoding (responseSchema) ──────────────
  if (input.policy.provider === 'google') {
    return invokeGeminiStructured({
      policy: input.policy,
      system: input.system,
      prompt: input.prompt,
      signal: input.signal,
      responseSchema: input.schema,
      validator: input.validator,
      maxTokens: input.maxTokens,
    });
  }

  throw new Error(`Structured provider not supported: ${input.policy.provider}`);
}
