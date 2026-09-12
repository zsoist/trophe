/**
 * Voice-Live public adapter shape (minimal typed surface).
 *
 * Every side-effecting capability — authenticated session create/close, WebRTC
 * construction, microphone acquisition, delegated backend work, and trusted usage
 * reconciliation — is INJECTED. This module never performs provider, auth, budget or
 * network calls itself. Canonical auth/budget/transport wiring is owned by AG1; the
 * interfaces below are the alignment contract, not an implementation of it.
 */

export type LiveDelegationMode = 'client' | 'responses';

export type LiveCloseReason =
  | 'close_requested'
  | 'expired'
  | 'content'
  | 'remote_hangup'
  | 'connection_lost';

export interface LiveSessionRequest {
  model: string;
  voice?: string;
  instructions?: string;
  /** Startup history only. Not a way to replace history mid-session. */
  input?: Array<{ role: 'developer' | 'user' | 'assistant'; text: string }>;
  delegation: { type: LiveDelegationMode };
  store?: boolean;
}

/** Canonical, authenticated create result. AG1 owns the fetch; we consume the shape. */
export interface LiveSessionHandle {
  sessionId: string;
  /** `transport.sdp` answer to apply to the peer connection. */
  answerSdp: string;
  /**
   * Server-admitted session deadline (epoch ms) when the create receipt carried one.
   * Absent/null means the transport admitted none; the host must NOT invent a deadline.
   */
  admittedDeadlineMs?: number | null;
}

/** Minimal data-channel surface (RTCPeerConnection data channel subset). */
export interface LiveDataChannel {
  readonly label: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

/** Minimal microphone track surface. */
export interface LiveMediaTrack {
  readonly kind: string;
  stop(): void;
  /**
   * Real mute control. `false` keeps the track live and sends silence — it is NOT a
   * teardown and NOT the same as pausing remote output.
   */
  enabled?: boolean;
}

export interface LiveMediaStream {
  getTracks(): LiveMediaTrack[];
}

/** Minimal peer-connection surface. Real construction is AG1-owned. */
export interface LivePeerConnection {
  /** MUST be called before createOffer so the data channel rides the negotiated SDP. */
  createDataChannel(label: string): LiveDataChannel;
  createOffer(): Promise<{ sdp: string }>;
  setLocalDescription(description: { type: 'offer'; sdp: string }): Promise<void>;
  setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  addTrack(track: LiveMediaTrack, stream: LiveMediaStream): void;
  addEventListener(type: LivePeerConnectionEvent, listener: () => void): void;
  removeEventListener(type: LivePeerConnectionEvent, listener: () => void): void;
  readonly connectionState: string;
  close(): void;
}

export type LivePeerConnectionEvent = 'connectionstatechange' | 'iceconnectionstatechange';

/**
 * Injected connection port. `createSession`/`closeSession` are the authenticated,
 * budget-checked boundaries owned by AG1. No implementation lives in this package.
 */
export interface LiveConnectionAdapter {
  createSession(input: { request: LiveSessionRequest; offerSdp: string; signal: AbortSignal }): Promise<LiveSessionHandle>;
  closeSession(input: { sessionId: string; reason: LiveCloseReason; signal: AbortSignal }): Promise<void>;
  createPeerConnection(): LivePeerConnection;
  /** Resolves late (after a synchronous cancel) are expected; the caller disposes stale streams. */
  acquireInput(): Promise<LiveMediaStream>;
}

export interface LiveDelegationRequest {
  delegationId: string;
  tool: string;
  arguments: unknown;
  transcript: LiveTranscriptRow[];
  /** Session the caller believes it is acting against (optional guard). */
  sessionId?: string;
  /**
   * Bounded cursor over already-consumed RAW user fragments (monotonic sequence + last
   * provider `event_id`). The provider supplies no utterance id and no final transcript
   * event, so the host must not fabricate one: it advances this cursor as it dispatches so
   * previously consumed fragments are never replayed into a new delegated action. This is
   * deliberately separate from display caption grouping, which merges fragments into wider
   * rows and must never be used to decide what a delegation has already seen.
   */
  transcriptCursor?: LiveTranscriptCursor;
  /**
   * True when the fragment store hit its finite capacity and evicted unconsumed fragments
   * before this dispatch. Surfaced explicitly so a host/backend never treats a truncated
   * fragment set as a complete utterance (silent loss is not allowed).
   */
  transcriptTruncated?: boolean;
}

/**
 * How much of the client-side RAW user fragment stream a delegation has already consumed.
 * Sequences are assigned at arrival and never reused, so two overlapping fragments that
 * merge into one display row each keep their own sequence and can be consumed exactly once.
 */
export interface LiveTranscriptCursor {
  /** Monotonic sequence of the last consumed raw user fragment (0 = nothing consumed). */
  sequence: number;
  /** Provider `event_id` of the last consumed raw fragment, or null when none/unknown. */
  lastEventId: string | null;
}

/** One raw user transcript delta retained for exact-once delegation consumption. */
export interface LiveUserFragment {
  /** Monotonic local sequence (1-based) assigned on arrival. Never reused. */
  seq: number;
  /** Provider `event_id`, or null when the delta carried none (a real field, never invented). */
  eventId: string | null;
  /** The raw provider `delta` text, exactly as received. */
  text: string;
  startMs: number;
  endMs: number;
}

/** Unconsumed raw user fragments plus the cursor to record after consuming them. */
export interface LiveUserFragmentBatch {
  /** Fragments strictly after the cursor, in arrival order. */
  fragments: LiveUserFragment[];
  /** Cursor to record once this batch is dispatched. */
  cursor: LiveTranscriptCursor;
  /** True when capacity evicted unconsumed fragments before this batch. */
  truncated: boolean;
}

/**
 * Real playback status of the output owner. `playing` means audio is actually sounding
 * (the element's `play()` resolved and it is neither muted nor interrupted); the honest
 * "speaking" level is gated on this and never inferred from transcript timing.
 */
export type LivePlaybackStatus = 'detached' | 'playing' | 'paused' | 'blocked';

export type LivePlaybackEvent =
  | { type: 'stream'; stream: LiveMediaStream | null }
  | { type: 'status'; status: LivePlaybackStatus };

/**
 * Local playback owner port. Barge-in (`interrupt`) must stop/mute real output through
 * this port — it is a playback control, NOT a cancellation of backend work.
 */
export interface LivePlaybackPort {
  /** Stop/mute local audio output immediately. */
  stopOutput(): void;
  /** Resume output after the caller clears the interruption. */
  resumeOutput(): void;
  /**
   * Optional real playback observer. When implemented, the controller drives output-level
   * metering from the actual remote media stream + real playback status (never a fabricated
   * wave) and removes the observer on dispose. Ports that omit it keep the previous behaviour.
   */
  observe?(listener: (event: LivePlaybackEvent) => void): () => void;
}

export interface LiveDelegationOutcome {
  ok: boolean;
  summary: string;
}

/**
 * Injected backend work port (client delegation). Permissions, confirmations and
 * business records stay on that side; this package only schedules and cancels.
 */
export interface LiveDelegationAdapter {
  delegate(request: LiveDelegationRequest, signal: AbortSignal): Promise<LiveDelegationOutcome>;
}

/**
 * Trusted backend reconciliation. The client NEVER makes final usage authoritative;
 * it reports observed/final seconds and lets the backend accept or correct them.
 */
export interface LiveUsageReconciler {
  reconcile(input: {
    sessionId: string;
    observedSeconds: number | null;
    finalSeconds: number | null;
    confirmed: boolean;
    reason: LiveCloseReason | null;
  }): Promise<{ reconciledSeconds: number | null; accepted: boolean }>;
}

export interface LiveTranscriptRow {
  speaker: 'user' | 'assistant';
  text: string;
  startMs: number;
  endMs: number;
  /** LOCAL caption-group id (host-visible). Not a provider id. */
  id?: string;
  /** Provider event_id of the last fragment merged into this group (real field, dedup key). */
  eventId?: string;
  /** open = still receiving deltas; settled = a newer group for this speaker began. */
  status?: 'open' | 'settled';
  /** True when a late/out-of-order fragment revised this group. Display-only. */
  revision?: boolean;
}

/**
 * Injected real input-level meter. The host wires `WebAudio` (MediaStreamSource ->
 * AnalyserNode) and reports only measured RMS. The controller never fabricates a wave:
 * `attach` returning `null` (or unavailable APIs) is surfaced as `meterSupported: false`.
 */
export interface LiveInputMeterPort {
  /**
   * Attach a real analyser to the acquired stream. Returns a detach function that MUST
   * release the AudioContext/RAF, or `null` when a real meter is unavailable.
   */
  attach(stream: LiveMediaStream, onLevel: (level: number | null) => void): (() => void) | null;
}

/**
 * Injected real OUTPUT-level meter. Same analyser contract as the input meter, attached to
 * the REMOTE media stream the playback owner received. It must tap the stream only (never
 * route the analyser back to the audio destination) so it can never create a second audible
 * path or an echo/feedback loop, and it must report measured RMS only — never a fabrication.
 */
export type LiveOutputMeterPort = LiveInputMeterPort;

/**
 * How long a real measured sample stays usable. A level older than this must be treated as
 * stale (static wave, no "speaking" claim) instead of being replayed as if it were fresh.
 */
export const METER_SAMPLE_TTL_MS = 180 as const;

/**
 * Minimum gap between subscriber notifications that only refresh meter freshness (i.e. real
 * samples keep arriving at the same amplitude). Sustained real samples must keep
 * subscriber-held snapshots fresh, but at a BOUNDED rate rather than one notification per
 * analyser frame (which would be 60 full React notifications/second for an identical level).
 * Must stay below `METER_SAMPLE_TTL_MS` so a consumer following the TTL never sees a stale
 * snapshot while samples are still flowing.
 */
export const METER_FRESHNESS_NOTIFY_MS = 90 as const;

export interface LiveUsageSnapshot {
  observedSeconds: number | null;
  finalSeconds: number | null;
  confirmed: boolean;
  reason: LiveCloseReason | null;
  reconciledSeconds: number | null;
  reconcileAccepted: boolean;
  /** Always false: this snapshot is client-observed, never billing-authoritative. */
  authoritative: false;
}
