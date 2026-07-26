/**
 * Trophē v0.3 — Google Gemini client.
 *
 * Owns the Gemini REST transport for Gemini 2.5 Flash (food_parse task).
 * Interface mirrors agents/clients/anthropic.ts so callers can swap
 * providers by changing the function called, not the call shape.
 *
 * Note: Gemini doesn't have prompt caching the same way Anthropic does,
 * so `cacheSystem` is accepted but ignored here.
 */

import {
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import { assertPaidProviderAccess } from '@/agents/runtime/provider-access';
import {
  debitPaidTransportAttempt,
  googleGenerateContentEndpoint,
  PaidAiToolApprovalError,
  type BeforePaidTransportAttempt,
} from '../../scripts/safety/require-paid-ai-approval';

export type GeminiGenerateContent = (
  input: GenerateContentParameters,
) => Promise<GenerateContentResponse>;

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
  responseSchema?: Record<string, unknown>;
  signal: AbortSignal;
  generateContent?: GeminiGenerateContent;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  beforeTransportAttempt?: BeforePaidTransportAttempt;
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

type GeminiWireResponse = {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

function nonNegativeInteger(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function parseGeminiWireResponse(value: unknown): GeminiWireResponse {
  if (value == null || typeof value !== 'object') {
    throw new Error('Google generateContent response was invalid');
  }
  const candidateValue = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidateValue) || candidateValue.length === 0) {
    throw new Error('Google generateContent response was invalid');
  }
  const candidates = candidateValue.map((candidate) => {
    if (candidate == null || typeof candidate !== 'object') {
      throw new Error('Google generateContent response was invalid');
    }
    const content = (candidate as { content?: unknown }).content;
    if (content == null || typeof content !== 'object') {
      throw new Error('Google generateContent response was invalid');
    }
    const rawParts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(rawParts)) {
      throw new Error('Google generateContent response was invalid');
    }
    const parts = rawParts.map((part) => {
      if (
        part == null
        || typeof part !== 'object'
        || typeof (part as { text?: unknown }).text !== 'string'
      ) {
        throw new Error('Google generateContent response was invalid');
      }
      return { text: (part as { text: string }).text };
    });
    return { content: { parts } };
  });
  const rawUsage = (value as { usageMetadata?: unknown }).usageMetadata;
  const usageMetadata = rawUsage != null && typeof rawUsage === 'object'
    ? {
        promptTokenCount: nonNegativeInteger(
          (rawUsage as { promptTokenCount?: unknown }).promptTokenCount,
        ),
        candidatesTokenCount: nonNegativeInteger(
          (rawUsage as { candidatesTokenCount?: unknown }).candidatesTokenCount,
        ),
      }
    : undefined;
  return { candidates, usageMetadata };
}

async function rawGenerateContent(
  input: GeminiMessagesInput,
  endpoint: string,
): Promise<GeminiWireResponse> {
  const apiKey = input.apiKey
    ?? process.env.GEMINI_API_KEY
    ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not configured');
  }
  debitPaidTransportAttempt(input.beforeTransportAttempt, endpoint);
  const response = await (input.fetchImpl ?? fetch)(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: [{ text: input.userMessage }] }],
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? 2048,
        responseMimeType: 'application/json',
        ...(input.responseSchema && { responseSchema: input.responseSchema }),
        ...(input.disableThinking && {
          thinkingConfig: { thinkingBudget: 0 },
        }),
      },
    }),
    redirect: 'error',
    signal: input.signal,
  });
  if (!response.ok) {
    throw new Error('Google generateContent request failed');
  }
  return parseGeminiWireResponse(await response.json());
}

export async function callGeminiMessages(
  input: GeminiMessagesInput,
): Promise<GeminiMessagesResult> {
  assertPaidProviderAccess({
    provider: 'google',
    transportWasInjected: input.generateContent != null || input.fetchImpl != null,
  });
  const startTime = Date.now();
  const endpoint = googleGenerateContentEndpoint(input.model);

  try {
    const response = input.generateContent
      ? await (async () => {
          debitPaidTransportAttempt(input.beforeTransportAttempt, endpoint);
          return input.generateContent!({
            model: input.model,
            contents: [{ role: 'user', parts: [{ text: input.userMessage }] }],
            config: {
              abortSignal: input.signal,
              systemInstruction: input.system,
              maxOutputTokens: input.maxTokens ?? 2048,
              responseMimeType: 'application/json',
              ...(input.responseSchema && {
                responseSchema: input.responseSchema,
              }),
              ...(input.disableThinking && {
                thinkingConfig: { thinkingBudget: 0 },
              }),
            },
          });
        })()
      : await rawGenerateContent(input, endpoint);

    const latencyMs = Date.now() - startTime;
    const text = input.generateContent
      ? (response as GenerateContentResponse).text ?? ''
      : (response as GeminiWireResponse).candidates
          .flatMap((candidate) => candidate.content.parts)
          .map((part) => part.text)
          .join('');
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
    if (err instanceof PaidAiToolApprovalError) throw err;
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
