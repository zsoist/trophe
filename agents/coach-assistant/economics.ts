import type { AiUsage } from '@/agents/runtime/types';

/** Standard short-context rates; historical runtime accounting remains intact. */
export const COACH_PRICING_VERSION = 'gpt-5.6-luna-standard-2026-09-08';
export const COACH_PRICING_SOURCE = 'https://developers.openai.com/api/docs/models/gpt-5.6-luna';
export const COACH_PRICING = Object.freeze({ input: 0.20, read: 0.02, write: 0.25, output: 1.20 });
/** Shared Ask Trophē pilot authority: calendar day in America/Bogota. */
export const COACH_PILOT_BUDGET_USD = 3;
/** Stop ordinary admissions here so measurement overruns retain a $0.30 safety margin. */
export const COACH_PILOT_OPERATING_TARGET_USD = 2.70;
export const COACH_PILOT_FIRST_SMOKE_MAX_USD = 0.50;
export const COACH_PILOT_TIME_ZONE = 'America/Bogota';
/** LIVE-02 adds at most thirty shared provider admissions after the sealed LIVE-01 eleven. */
export const COACH_LIVE02_HISTORICAL_ATTEMPTS = 11;
export const COACH_LIVE02_ADDITIONAL_INVOCATION_LIMIT = 30;
export const COACH_LIVE02_TOTAL_INVOCATION_CEILING = COACH_LIVE02_HISTORICAL_ATTEMPTS + COACH_LIVE02_ADDITIONAL_INVOCATION_LIMIT;

export function priceCoachUsage(usage: AiUsage): number | null {
  const { inputTokens: input, outputTokens: output } = usage;
  const read = usage.cacheReadTokens ?? 0;
  const write = usage.cacheWriteTokens ?? 0;
  const reasoning = usage.reasoningTokens ?? 0;
  if (![input, output, read, write, reasoning].every(n => Number.isSafeInteger(n) && n >= 0)
    || read + write > input || reasoning > output || input + output === 0) return null;
  // completion_tokens already includes reasoning; do not add it again.
  return ((input - read - write) * COACH_PRICING.input + read * COACH_PRICING.read
    + write * COACH_PRICING.write + output * COACH_PRICING.output) / 1_000_000;
}
