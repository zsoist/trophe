/**
 * Trophē v0.3 — Google Gemini client.
 *
 * Wraps @google/genai for Gemini 2.5 Flash (food_parse task).
 * Interface mirrors agents/clients/anthropic.ts so callers can swap
 * providers by changing the function called, not the call shape.
 *
 * Note: Gemini doesn't have prompt caching the same way Anthropic does,
 * so `cacheSystem` is accepted but ignored here.
 */

import { GoogleGenAI } from '@google/genai';

export interface GeminiMessagesInput {
  model: string;
  system: string;
  userMessage: string;
  maxTokens?: number;
  /** Accepted for interface parity; no-op for Gemini. */
  cacheSystem?: boolean;
  /**
   * Disable Gemini 2.5 "thinking" mode. When true, sets thinkingBudget: 0.
   * Use for simple structured-output tasks where thinking tokens would eat
   * into the maxOutputTokens budget and truncate the response.
   */
  disableThinking?: boolean;
}

export interface GeminiMessagesResult {
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

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not configured');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export async function callGeminiMessages(
  input: GeminiMessagesInput,
): Promise<GeminiMessagesResult> {
  const client = getClient();
  const startTime = Date.now();

  try {
    const response = await client.models.generateContent({
      model: input.model,
      contents: [{ role: 'user', parts: [{ text: input.userMessage }] }],
      config: {
        systemInstruction: input.system,
        maxOutputTokens: input.maxTokens ?? 2048,
        // Extraction tasks expect machine-readable JSON; callers still validate
        // the final shape before trusting any model output.
        responseMimeType: 'application/json',
        // Gemini 2.5 Flash "thinking" can consume maxOutputTokens budget,
        // truncating the actual response. Disable for simple structured tasks.
        ...(input.disableThinking && { thinkingConfig: { thinkingBudget: 0 } }),
      },
    });

    const latencyMs = Date.now() - startTime;
    const text = response.text ?? '';
    const meta = response.usageMetadata;

    return {
      text,
      usage: {
        input_tokens: meta?.promptTokenCount ?? 0,
        output_tokens: meta?.candidatesTokenCount ?? 0,
      },
      latencyMs,
      rawStatus: 200,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    return {
      text: '',
      usage: { input_tokens: 0, output_tokens: 0 },
      latencyMs,
      rawStatus: 0,
      rawError: message,
    };
  }
}
