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
}

/**
 * Local playback owner port. Barge-in (`interrupt`) must stop/mute real output through
 * this port — it is a playback control, NOT a cancellation of backend work.
 */
export interface LivePlaybackPort {
  /** Stop/mute local audio output immediately. */
  stopOutput(): void;
  /** Resume output after the caller clears the interruption. */
  resumeOutput(): void;
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
}

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
