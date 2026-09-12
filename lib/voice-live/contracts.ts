/**
 * GPT-Live server-only contracts.
 *
 * Derived *only* from the official docs already supplied in
 * `workspace/perf-report/` — do not conflate with Realtime API billing:
 *   - `live-cost.md`      : voice sessions billed per second; a
 *                           `POST /v1/live/sessions` (WebRTC) request bills 15s
 *                           of voice duration during initialization and that
 *                           amount is *credited*, not added, against the running
 *                           duration; backend/tools are billed separately.
 *   - `live-events.md`    : session lifecycle (`session.started`,
 *                           `session.usage.updated` cumulative seconds,
 *                           `session.closed` with a `reason`).
 *   - `live-delegation.md`: client delegation via `delegation: { type: 'client' }`.
 *   - `live-pricing-verified.md` + official
 *     <https://developers.openai.com/api/docs/pricing> (retrieved 2026-09-12):
 *     `gpt-live-1` voice at $0.05/min billed per second.
 *   - Official WebRTC guide
 *     <https://developers.openai.com/api/docs/guides/voice-webrtc?api=live>:
 *     the create request/response shapes and the sideband attach endpoint.
 *
 * This module is intentionally dependency-free (no `zod`) so the accounting /
 * lifecycle logic is transparent, fail-closed, and runnable under the local
 * `node --test` type-stripping runtime without any install. AG1 owns the
 * canonical server wiring (auth guard, persistent budget ledger, route); the
 * interfaces here are the injection points it implements.
 */

export const LIVE_MODEL = 'gpt-live-1' as const;
/** Fixed OpenAI path. Never accept an arbitrary endpoint from a caller. */
export const LIVE_SESSIONS_PATH = '/v1/live/sessions' as const;
/**
 * WebRTC transport discriminator in the documented create body/response:
 * `transport: { type: 'webrtc', sdp }`.
 */
export const LIVE_WEBRTC_TRANSPORT_TYPE = 'webrtc' as const;
/**
 * Documented sideband attach endpoint (server-side event/control channel) for
 * an existing session. Closure is driven over this channel with a
 * `session.close` command; the session is finalized by the provider's
 * `session.closed` event. There is NO HTTP hangup endpoint in the docs, so none
 * is invented here (wiring is AG1's).
 */
export const LIVE_SIDEBAND_ATTACH_HOST = 'wss://api.openai.com' as const;
export const LIVE_SIDEBAND_ATTACH_PATH_TEMPLATE = '/v1/live/sessions/{sessionId}/attach' as const;
/** WebRTC creation bills this many seconds, credited against running duration. */
export const INITIALIZATION_SECONDS = 15 as const;
/**
 * Hard upper bound on a single session window. "maxsessionlength bounded":
 * a request above this is rejected, never silently clamped, so budgeting is
 * never based on a duration the provider could exceed.
 */
export const MAX_SESSION_DURATION_SECONDS = 1800 as const;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = <T>(error: string): Parsed<T> => ({ ok: false, error });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[a-f0-9]{64}$/;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const isHex64 = (v: unknown): v is string => typeof v === 'string' && HEX64_RE.test(v);

/** Positive safe-integer nano-USD amount (no floats, no negatives, no overflow). */
export function isPositiveNanoUsd(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}
export function isNonNegativeNanoUsd(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** Trusted, server-derived identity passed in by the AG1 route — never from a request body. */
export interface AuthorizedLiveContext {
  readonly actorId: string;
  readonly organizationId: string | null;
  /** Code-owned pilot id (never client supplied). */
  readonly pilotId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly agentRunId: string;
}

export function parseAuthorizedLiveContext(raw: unknown): Parsed<AuthorizedLiveContext> {
  if (typeof raw !== 'object' || raw === null) return bad('context_not_object');
  const c = raw as Record<string, unknown>;
  if (!isUuid(c.actorId)) return bad('context_actor_id');
  if (c.organizationId !== null && typeof c.organizationId !== 'string') return bad('context_organization_id');
  if (!isUuid(c.pilotId)) return bad('context_pilot_id');
  if (!isUuid(c.conversationId)) return bad('context_conversation_id');
  if (!isUuid(c.turnId)) return bad('context_turn_id');
  if (!isUuid(c.agentRunId)) return bad('context_agent_run_id');
  return ok({
    actorId: c.actorId,
    organizationId: (c.organizationId as string | null) ?? null,
    pilotId: c.pilotId,
    conversationId: c.conversationId,
    turnId: c.turnId,
    agentRunId: c.agentRunId,
  });
}

/**
 * Per-second rate + margin configuration. AG1 supplies this from verified
 * configuration. There is NO guessed default: a missing/invalid per-second rate
 * fails closed (`InvalidRate`).
 */
export interface SessionRateConfig {
  /** REQUIRED verified per-second voice rate. */
  readonly perSecondRateNanoUsd: number;
  /** Exact minute tariff when the per-second amount is a reservation ceiling. */
  readonly perMinuteRateNanoUsd?: number;
  /** REQUIRED verified pricing version identifier. */
  readonly pricingVersion: string;
  /** Separate closure-margin line item (not folded into the duration rate). */
  readonly closureMarginNanoUsd: number;
  /** Separate backend/tool reserve (backend is billed separately from voice). */
  readonly backendReserveNanoUsd: number;
}

export function parseSessionRateConfig(raw: unknown): Parsed<SessionRateConfig> {
  if (typeof raw !== 'object' || raw === null) return bad('invalid_rate');
  const c = raw as Record<string, unknown>;
  if (!isPositiveNanoUsd(c.perSecondRateNanoUsd)) return bad('invalid_rate');
  if (c.perMinuteRateNanoUsd !== undefined && (!isPositiveNanoUsd(c.perMinuteRateNanoUsd)
    || Math.ceil(c.perMinuteRateNanoUsd / 60) !== c.perSecondRateNanoUsd)) return bad('invalid_rate');
  if (typeof c.pricingVersion !== 'string' || c.pricingVersion.length === 0) return bad('invalid_rate');
  if (!isNonNegativeNanoUsd(c.closureMarginNanoUsd)) return bad('invalid_rate');
  if (!isNonNegativeNanoUsd(c.backendReserveNanoUsd)) return bad('invalid_rate');
  return ok({
    perSecondRateNanoUsd: c.perSecondRateNanoUsd,
    ...(c.perMinuteRateNanoUsd !== undefined ? { perMinuteRateNanoUsd: c.perMinuteRateNanoUsd as number } : {}),
    pricingVersion: c.pricingVersion,
    closureMarginNanoUsd: c.closureMarginNanoUsd,
    backendReserveNanoUsd: c.backendReserveNanoUsd,
  });
}

export interface ReservationBreakdown {
  /** Seconds budgeted = max(maxDurationSeconds, INITIALIZATION_SECONDS). */
  readonly billableSeconds: number;
  readonly perSecondRateNanoUsd: number;
  readonly durationReserveNanoUsd: number;
  readonly closureMarginNanoUsd: number;
  readonly backendReserveNanoUsd: number;
  readonly totalNanoUsd: number;
}

/**
 * Reservation = perSecondRate × max(maxDurationSeconds, 15s init) + closure
 * margin + backend reserve. The 15s initialization is a *minimum*, never an
 * extra addend, matching the documented credit semantics.
 */
export function computeReservationBreakdown(
  rate: SessionRateConfig,
  maxDurationSeconds: number,
): Parsed<ReservationBreakdown> {
  if (!Number.isSafeInteger(maxDurationSeconds) || maxDurationSeconds <= 0) return bad('invalid_duration');
  if (maxDurationSeconds > MAX_SESSION_DURATION_SECONDS) return bad('duration_exceeds_bound');
  const billableSeconds = Math.max(maxDurationSeconds, INITIALIZATION_SECONDS);
  const durationReserveNanoUsd = rate.perSecondRateNanoUsd * billableSeconds;
  if (!Number.isSafeInteger(durationReserveNanoUsd)) return bad('reservation_overflow');
  const totalNanoUsd =
    durationReserveNanoUsd + rate.closureMarginNanoUsd + rate.backendReserveNanoUsd;
  if (!Number.isSafeInteger(totalNanoUsd)) return bad('reservation_overflow');
  return ok({
    billableSeconds,
    perSecondRateNanoUsd: rate.perSecondRateNanoUsd,
    durationReserveNanoUsd,
    closureMarginNanoUsd: rate.closureMarginNanoUsd,
    backendReserveNanoUsd: rate.backendReserveNanoUsd,
    totalNanoUsd,
  });
}

/**
 * Charge for a finalized session given provider-trusted cumulative seconds.
 * `usageSeconds` replaces (never sums with) the observed cumulative value and
 * is floored by the credited initialization minimum.
 */
export function finalVoiceChargeNanoUsd(rate: SessionRateConfig, usageSeconds: number): Parsed<number> {
  if (!Number.isSafeInteger(usageSeconds) || usageSeconds < 0) return bad('invalid_usage');
  const billedSeconds = Math.max(usageSeconds, INITIALIZATION_SECONDS);
  if (rate.perMinuteRateNanoUsd !== undefined) {
    const amount = (BigInt(billedSeconds) * BigInt(rate.perMinuteRateNanoUsd) + BigInt(59)) / BigInt(60);
    return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? ok(Number(amount)) : bad('charge_overflow');
  }
  const charge = rate.perSecondRateNanoUsd * billedSeconds;
  if (!Number.isSafeInteger(charge)) return bad('charge_overflow');
  return ok(charge);
}

/** Session close reasons documented in `live-events.md`. */
export const CLOSE_REASONS = [
  'close_requested',
  'expired',
  'content',
  'remote_hangup',
  'connection_lost',
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];
export const isCloseReason = (v: unknown): v is CloseReason =>
  typeof v === 'string' && (CLOSE_REASONS as readonly string[]).includes(v);

/** Provider events we consume for accounting/lifecycle. */
export interface ProviderSessionEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

export const isSessionStarted = (event: ProviderSessionEvent): boolean =>
  event.type === 'session.started';

export const isUsageUpdated = (event: ProviderSessionEvent): boolean =>
  event.type === 'session.usage.updated';

/**
 * A provider usage reading. `hasUsage` distinguishes a *valid* explicit
 * reading (including `seconds: 0`) from a missing/malformed one — callers must
 * never infer `0` from the latter (that would fabricate usage).
 */
export interface UsageReading {
  readonly hasUsage: boolean;
  readonly seconds: number;
}

/** Parsed `session.usage.updated`; `hasUsage:false` when absent/malformed. */
export function readUsageSeconds(event: ProviderSessionEvent): UsageReading {
  if (!isUsageUpdated(event) && event.type !== 'session.closed') return { hasUsage: false, seconds: 0 };
  const usage = event.usage;
  if (typeof usage !== 'object' || usage === null) return { hasUsage: false, seconds: 0 };
  const seconds = (usage as Record<string, unknown>).seconds;
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0) {
    return { hasUsage: false, seconds: 0 };
  }
  return { hasUsage: true, seconds };
}

/** Cumulative seconds from `session.usage.updated`; 0 when absent/malformed. */
export function readCumulativeUsageSeconds(event: ProviderSessionEvent): number {
  return readUsageSeconds(event).seconds;
}

export interface SessionClosedSignal {
  readonly closed: true;
  readonly reason: CloseReason | null;
}

/**
 * `session.closed` is the *only* provider signal that establishes finalization.
 * A missing reason is tolerated (closed=true, reason=null); a malformed reason
 * is treated as null rather than trusted.
 */
export function readSessionClosed(event: ProviderSessionEvent): SessionClosedSignal | null {
  if (event.type !== 'session.closed') return null;
  return { closed: true, reason: isCloseReason(event.reason) ? event.reason : null };
}

/**
 * Parsed WebRTC creation response. Session id + SDP answer are required.
 *
 * Documented 201 body:
 *   {"session":{"id":"live_123"},"transport":{"type":"webrtc","sdp":"<answer>"}}
 *
 * The id is read from `session.id` and the SDP answer from `transport.sdp`.
 * The id is treated as an **opaque** provider string (e.g. `live_123`): it is
 * preserved verbatim and never parsed or forced into a UUID shape. The old
 * top-level `{id, transport:{sdp}}` shape is rejected.
 */
export interface SessionCreateResponse {
  readonly sessionId: string;
  readonly transportSdp: string;
}

export function parseSessionCreateResponse(raw: unknown): Parsed<SessionCreateResponse> {
  if (typeof raw !== 'object' || raw === null) return bad('create_response_not_object');
  const r = raw as Record<string, unknown>;
  const session = r.session;
  if (typeof session !== 'object' || session === null) return bad('create_response_missing_id');
  const sessionId = (session as Record<string, unknown>).id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) return bad('create_response_missing_id');
  const transport = r.transport;
  if (typeof transport !== 'object' || transport === null) return bad('create_response_missing_transport');
  const sdp = (transport as Record<string, unknown>).sdp;
  if (typeof sdp !== 'string' || sdp.length === 0) return bad('create_response_missing_sdp');
  return ok({ sessionId, transportSdp: sdp });
}

/**
 * Fixed session-create body. Model and delegation mode are code-owned and live
 * **inside** `session`; there is no top-level `model` or `sdp`.
 *
 * Documented POST /v1/live/sessions body:
 *   {"session":{"model":"gpt-live-1","delegation":{"type":"client"},
 *               "instructions":"..."},
 *    "transport":{"type":"webrtc","sdp":"<offer>"}}
 */
export function buildSessionCreateBody(input: {
  sdpOffer: string;
  instructions?: string;
  store?: boolean;
  voice?: string;
}): Record<string, unknown> {
  const session: Record<string, unknown> = {
    model: LIVE_MODEL,
    delegation: { type: 'client' },
  };
  if (typeof input.instructions === 'string' && input.instructions.length > 0) {
    session.instructions = input.instructions;
  }
  if (typeof input.voice === 'string' && input.voice.length > 0) {
    session.audio = { output: { voice: input.voice } };
  }
  if (typeof input.store === 'boolean') session.store = input.store;
  return {
    session,
    transport: { type: LIVE_WEBRTC_TRANSPORT_TYPE, sdp: input.sdpOffer },
  };
}

/** Client-originated payloads are NOT a usage authority. */
export type IgnoredClientUsageReason = 'client_payload_not_authoritative';

export function rejectClientSuppliedUsage(): { accepted: false; reason: IgnoredClientUsageReason } {
  return { accepted: false, reason: 'client_payload_not_authoritative' };
}
