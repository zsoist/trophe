/**
 * Trophē v0.3 — OpenTelemetry GenAI semantic conventions.
 *
 * Emits structured log attributes conforming to OTel GenAI semconv v1.27+:
 *   https://opentelemetry.io/docs/specs/semconv/gen-ai/
 *
 * We use console-based structured logging rather than a full OTel SDK to keep
 * the dependency footprint small. Logs land in Vercel/stdout as JSON lines
 * and can be forwarded to any OTel collector via a log exporter.
 *
 * When a real OTel SDK (e.g. @opentelemetry/sdk-node) is wired in, replace
 * `emitGenAISpan` with span attribute calls — the attribute names stay identical.
 *
 * Usage:
 *   emitGenAISpan({
 *     task: 'food_parse',
 *     system: 'google',
 *     model: attrs.model,
 *     inputTokens: 312,
 *     outputTokens: 88,
 *     finishReason: 'stop',
 *     latencyMs: 420,
 *   });
 */

import { estimateModelCostUsd } from '../router/pricing';

export interface GenAISpanAttributes {
  /** Trophē task name — stored as custom attribute `trophe.task` */
  task: string;
  /** gen_ai.system — 'anthropic' | 'google' | 'openai' */
  system: string;
  /** gen_ai.request.model */
  model: string;
  /** gen_ai.usage.input_tokens */
  inputTokens: number;
  /** gen_ai.usage.output_tokens */
  outputTokens: number;
  /** gen_ai.response.finish_reasons — e.g. ['stop'] */
  finishReasons?: string[];
  /** Custom: latency in milliseconds */
  latencyMs: number;
  /** Custom: prompt cache read tokens (Anthropic) */
  cacheReadTokens?: number;
  /** Custom: prompt cache write tokens (Anthropic) */
  cacheWriteTokens?: number;
  /** Custom: error message if the call failed */
  error?: string;
}

/**
 * Emit a structured log line with OTel GenAI semconv attribute names.
 * In a full OTel setup, replace with span.setAttributes(attrs).
 */
export function emitGenAISpan(attrs: GenAISpanAttributes): void {
  // Only log in non-test environments to keep test output clean.
  if (process.env.NODE_ENV === 'test') return;

  const record = {
    timestamp: new Date().toISOString(),
    // OTel GenAI semconv attribute names
    'gen_ai.system': attrs.system,
    'gen_ai.request.model': attrs.model,
    'gen_ai.usage.input_tokens': attrs.inputTokens,
    'gen_ai.usage.output_tokens': attrs.outputTokens,
    'gen_ai.response.finish_reasons': attrs.finishReasons ?? ['unknown'],
    // Custom Trophē attributes
    'trophe.task': attrs.task,
    'trophe.latency_ms': attrs.latencyMs,
    ...(attrs.cacheReadTokens != null && { 'trophe.cache_read_tokens': attrs.cacheReadTokens }),
    ...(attrs.cacheWriteTokens != null && { 'trophe.cache_write_tokens': attrs.cacheWriteTokens }),
    ...(attrs.error != null && { 'trophe.error': attrs.error }),
  };

  // JSON lines format — compatible with Vector, Datadog, Grafana Loki
  console.log(JSON.stringify(record));
}

/**
 * Compute estimated USD cost from token counts.
 * Rates from policies.ts header comments (approximate 2026-05).
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
): number {
  return estimateModelCostUsd(model, inputTokens, outputTokens, cacheReadTokens);
}
