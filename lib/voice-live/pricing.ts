/** Official GPT-Live voice rate, verified 2026-09-12: $0.05/minute.
 * Reserve with the per-second ceiling; settle with the exact rational rate,
 * rounded upward once to the ledger's integer nano-USD precision.
 */
export const LIVE_PRICING_VERSION = 'gpt-live-1-duration-2026-09-12' as const;
export const LIVE_RATE_NANO_USD_PER_MINUTE = 50_000_000;
export const LIVE_RATE_NANO_USD_PER_SECOND_CEILING = 833_334;
export const LIVE_CLOSURE_MARGIN_SECONDS = 10;
export const LIVE_RUNTIME_MAX_SECONDS = 120;
export const LIVE_RATE_CONFIG = {
  perSecondRateNanoUsd: LIVE_RATE_NANO_USD_PER_SECOND_CEILING,
  perMinuteRateNanoUsd: LIVE_RATE_NANO_USD_PER_MINUTE,
  pricingVersion: LIVE_PRICING_VERSION,
  closureMarginNanoUsd: LIVE_CLOSURE_MARGIN_SECONDS * LIVE_RATE_NANO_USD_PER_SECOND_CEILING,
  // Each delegated generation reserves separately in the canonical governed engine.
  backendReserveNanoUsd: 0,
} as const;

export function liveReservationNanoUsd(seconds: number): number {
  return (Math.max(15, seconds) + LIVE_CLOSURE_MARGIN_SECONDS) * LIVE_RATE_NANO_USD_PER_SECOND_CEILING;
}

export function liveMeasuredChargeNanoUsd(seconds: number): number | null {
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  const numerator = BigInt(Math.max(15, seconds)) * BigInt(LIVE_RATE_NANO_USD_PER_MINUTE);
  const amount = (numerator + BigInt(59)) / BigInt(60);
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
