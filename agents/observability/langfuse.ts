/**
 * Trophē v0.3 — Langfuse observability wrapper.
 *
 * Every LLM call made by Trophē agents passes through `traced()`.
 * It wraps the call in a Langfuse generation span and records:
 *   - model, provider, task
 *   - input tokens, output tokens, cache hit
 *   - latency, cost estimate
 *   - success/error status
 *
 * Set LANGFUSE_SECRET_KEY + LANGFUSE_PUBLIC_KEY + LANGFUSE_HOST in .env.local.
 * If keys are absent, tracing is silently skipped (dev/test mode).
 *
 * Usage:
 *   const result = await traced('food_parse', 'gemini-2.5-flash', async (gen) => {
 *     // gen is the Langfuse generation handle if needed for custom metadata
 *     return await callGeminiMessages(input);
 *   });
 */

import { Langfuse, type LangfuseGenerationClient } from 'langfuse';

export interface TraceInput {
  /** Trophē task name (food_parse, coach_insight, etc.) */
  task: string;
  /** Model identifier sent to the provider */
  model: string;
  /** Provider (anthropic | google | openai) */
  provider: string;
  /** The user prompt / content sent to the model */
  prompt: string;
  /** System prompt (truncated for trace storage) */
  systemPrompt?: string;
  /** Arbitrary metadata (user_id, session_id, food_log_id…) */
  metadata?: Record<string, unknown>;
}

export interface TraceResult {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  latencyMs: number;
  rawStatus: number;
  rawError?: string;
}

type TracedFn = (generation: LangfuseGenerationClient | null) => Promise<TraceResult>;

/**
 * Wraps a single LLM call in a Langfuse generation span.
 * The `fn` callback receives the generation handle (or null if Langfuse is
 * disabled) and must return a TraceResult-shaped object.
 *
 * Always awaits `langfuse.flushAsync()` — critical for Next.js serverless
 * where the process may exit before background sends complete.
 */
export async function traced(
  input: TraceInput,
  fn: TracedFn,
): Promise<TraceResult> {
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const host = process.env.LANGFUSE_HOST ?? 'http://localhost:3002';

  // Skip tracing if keys are absent (local dev without Langfuse running).
  if (!secretKey || !publicKey) {
    return fn(null);
  }

  // Optional: Cloudflare Access service token headers.
  // Currently unused — /api/public/* path is bypassed in CF Access.
  // Kept for forward-compatibility if we tighten the policy later.
  const additionalHeaders: Record<string, string> = {};
  const cfClientId = process.env.LANGFUSE_CF_ACCESS_CLIENT_ID;
  const cfClientSecret = process.env.LANGFUSE_CF_ACCESS_CLIENT_SECRET;
  if (cfClientId && cfClientSecret) {
    additionalHeaders['CF-Access-Client-Id'] = cfClientId;
    additionalHeaders['CF-Access-Client-Secret'] = cfClientSecret;
  }

  const lf = new Langfuse({ secretKey, publicKey, baseUrl: host, additionalHeaders });

  // Trace groups multiple generations from the same request together.
  const trace = lf.trace({
    name: `trophe.${input.task}`,
    metadata: input.metadata,
  });

  const generation = trace.generation({
    name: input.task,
    model: input.model,
    modelParameters: { provider: input.provider },
    input: [
      ...(input.systemPrompt
        ? [{ role: 'system', content: input.systemPrompt.slice(0, 500) }]
        : []),
      { role: 'user', content: input.prompt.slice(0, 2000) },
    ],
    metadata: { provider: input.provider },
  });

  let result: TraceResult;
  try {
    result = await fn(generation);

    generation.end({
      output: result.text.slice(0, 2000),
      usage: {
        input: result.usage.input_tokens,
        output: result.usage.output_tokens,
        total: result.usage.input_tokens + result.usage.output_tokens,
        unit: 'TOKENS',
      },
      level: result.rawStatus === 0 ? 'ERROR' : 'DEFAULT',
      statusMessage: result.rawError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    generation.end({
      output: '',
      level: 'ERROR',
      statusMessage: message,
    });
    await lf.flushAsync();
    throw err;
  }

  // Flush before the serverless function exits.
  await lf.flushAsync();
  return result;
}
