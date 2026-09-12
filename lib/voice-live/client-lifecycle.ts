/**
 * WebRTC voice-live lifecycle controller.
 *
 * Owns the ordered, cancellable session lifecycle around injected ports:
 *  - user gesture starts the session (no autoplay/speculative start);
 *  - the data channel is created BEFORE the SDP offer;
 *  - an ICE timeout and a `session.started` timeout bound the connect phase;
 *  - epoch guards make late `getUserMedia` resolutions stop their tracks;
 *  - explicit stop disables the microphone immediately, then closes gracefully and
 *    waits for `session.closed` to retain final usage (reconciled by the trusted backend);
 *  - barge-in interruption is distinct from cancelling delegated backend work;
 *  - there is NO hidden reconnect: failures clean up and surface an error.
 *
 * No provider call, auth, budget check or network request happens here.
 */
import type {
  LiveCloseReason,
  LiveConnectionAdapter,
  LiveDataChannel,
  LiveDelegationAdapter,
  LiveDelegationRequest,
  LiveMediaStream,
  LivePlaybackPort,
  LivePeerConnection,
  LiveSessionRequest,
  LiveTranscriptRow,
  LiveUsageReconciler,
  LiveUsageSnapshot,
} from './client-types';
import { parseLiveEvent, type LiveEvent } from './client-events';
import { LiveDelegation, type DelegationResult } from './client-delegation';
import { LiveUsage, emptyUsage } from './client-usage';
import { LiveTranscript } from './client-transcript';

export type LivePhase =
  | 'idle'
  | 'requesting_input'
  | 'connecting'
  | 'waiting_started'
  | 'live'
  | 'closing'
  | 'closed'
  | 'failed';

export type LiveErrorCode =
  | 'permission'
  | 'unsupported'
  | 'cancelled'
  | 'ice_timeout'
  | 'start_timeout'
  | 'create_failed'
  | 'network'
  | 'playback_blocked'
  | 'closed_unexpectedly'
  | null;

export interface LiveServerError {
  code: string | null;
  message: string;
}

export interface LiveLifecycleState {
  phase: LivePhase;
  sessionId: string | null;
  error: LiveErrorCode;
  serverError: LiveServerError | null;
  playbackBlocked: boolean;
  microphoneEnabled: boolean;
  busy: boolean;
  activeActions: string[];
  interrupted: boolean;
  /**
   * True only when the session is live AND a real local playback port was injected to stop.
   * Hosts must disable/hide barge-in controls when this is false: without a stop port an
   * interruption would be a boolean success with no audible effect.
   */
  canInterrupt: boolean;
  transcript: LiveTranscriptRow[];
  usage: LiveUsageSnapshot;
  lastCloseReason: LiveCloseReason | null;
}

export interface LiveTimers {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface LiveLifecycleDeps {
  adapter: LiveConnectionAdapter;
  request: LiveSessionRequest;
  delegation?: LiveDelegationAdapter | null;
  reconciler?: LiveUsageReconciler | null;
  /** Injected local playback owner. Barge-in stops output here; it never cancels backend work. */
  playback?: LivePlaybackPort | null;
  timers?: LiveTimers;
  iceTimeoutMs?: number;
  startTimeoutMs?: number;
  finalizeTimeoutMs?: number;
}

type TimerKey = 'ice' | 'start' | 'finalize';

const DEFAULT_ICE_TIMEOUT_MS = 10_000;
const DEFAULT_START_TIMEOUT_MS = 15_000;
const DEFAULT_FINALIZE_TIMEOUT_MS = 8_000;
/** Bound on pre-bind channel events buffered while the trusted create is still in flight. */
const MAX_EARLY_EVENTS = 16;

const emptyState = (): LiveLifecycleState => ({
  phase: 'idle',
  sessionId: null,
  error: null,
  serverError: null,
  playbackBlocked: false,
  microphoneEnabled: false,
  busy: false,
  activeActions: [],
  interrupted: false,
  canInterrupt: false,
  transcript: [],
  usage: emptyUsage(),
  lastCloseReason: null,
});

export class VoiceLiveController {
  private readonly deps: LiveLifecycleDeps;
  private readonly timers: LiveTimers;
  private readonly delegation: LiveDelegation;
  private readonly usage = new LiveUsage();
  private transcript = new LiveTranscript();
  private state: LiveLifecycleState = emptyState();
  private listeners = new Set<() => void>();
  private handles = new Map<TimerKey, unknown>();
  private epoch = 0;
  /** Epoch of the channel/connection currently allowed to deliver events (per-connection binding). */
  private channelEpoch = -1;
  private channelListener: ((event: { data: unknown }) => void) | null = null;
  /** Session id we are waiting for `session.started` to confirm (rejects wrong-id events). */
  private expectedSessionId: string | null = null;
  /**
   * Session id returned by the trusted create, retained even before it is published into the
   * UI state so an SDP-apply failure (or a racing stop) still releases the remote session.
   */
  private createdSessionId: string | null = null;
  /**
   * `session.started` frames seen before `createdSessionId` is known. Bounded, drained once
   * the real id lands and validated against it — never used to adopt an arbitrary session.
   */
  private earlyEvents: LiveEvent[] = [];
  /** Remote session ids already asked to close, so cleanup stays idempotent. */
  private readonly closingRemotes = new Set<string>();
  /** Session ids already reported to the reconciler, so accounting fires once per session. */
  private readonly reconciledSessions = new Set<string>();
  private cleanupAbort: AbortController | null = null;
  private disposed = false;
  private peer: LivePeerConnection | null = null;
  private channel: LiveDataChannel | null = null;
  private stream: LiveMediaStream | null = null;
  private createAbort: AbortController | null = null;

  constructor(deps: LiveLifecycleDeps) {
    this.deps = deps;
    this.timers = deps.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
    this.delegation = new LiveDelegation(deps.delegation ?? null);
  }

  snapshot = (): LiveLifecycleState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(patch: Partial<LiveLifecycleState>): void {
    const next: LiveLifecycleState = {
      ...this.state,
      ...patch,
      activeActions: this.delegation.active,
      busy: this.delegation.busy || patch.busy === true,
    };
    this.state = { ...next, canInterrupt: next.phase === 'live' && !next.interrupted && Boolean(this.deps.playback) };
    for (const listener of this.listeners) listener();
  }

  private setTimer(key: TimerKey, callback: () => void, ms: number): void {
    this.clearTimer(key);
    this.handles.set(key, this.timers.setTimeout(() => {
      this.handles.delete(key);
      callback();
    }, ms));
  }

  private clearTimer(key: TimerKey): void {
    const handle = this.handles.get(key);
    if (handle !== undefined) {
      this.timers.clearTimeout(handle);
      this.handles.delete(key);
    }
  }

  private clearTimers(): void {
    this.clearTimer('ice');
    this.clearTimer('start');
    this.clearTimer('finalize');
  }

  /** User-gesture entry point. Idempotent while a session is active. */
  async startFromGesture(): Promise<void> {
    if (!['idle', 'failed', 'closed'].includes(this.state.phase)) return;
    this.epoch += 1;
    const epoch = this.epoch;
    this.teardownPorts();
    this.disposed = false;
    this.expectedSessionId = null;
    this.createdSessionId = null;
    this.earlyEvents = [];
    this.transcript = new LiveTranscript();
    this.delegation.abortAll();
    this.publish({
      ...emptyState(),
      phase: 'requesting_input',
      microphoneEnabled: true,
    });

    let stream: LiveMediaStream;
    try {
      stream = await this.deps.adapter.acquireInput();
    } catch (error) {
      if (epoch !== this.epoch) return;
      // DOMException can come from a different browser realm and need not be
      // instanceof this realm's Error. Only use its standard name for UI guidance.
      this.fail(error !== null && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError' ? 'permission' : 'unsupported');
      return;
    }
    // A synchronous stop/replacement happened while getUserMedia resolved: drop the tracks.
    if (epoch !== this.epoch) {
      stopStream(stream);
      return;
    }
    this.stream = stream;

    try {
      const peer = this.deps.adapter.createPeerConnection();
      this.peer = peer;
      // Data channel BEFORE the offer so it is part of the negotiated SDP.
      const channel = peer.createDataChannel('oai-events');
      this.channel = channel;
      // Bind this channel to the epoch it was created under; stale channels are ignored.
      this.channelEpoch = epoch;
      const boundEpoch = epoch;
      const listener = (event: { data: unknown }): void => {
        if (this.channelEpoch !== boundEpoch) return;
        this.onChannelMessage(event);
      };
      this.channelListener = listener;
      channel.addEventListener('message', listener);
      const track = stream.getTracks()[0];
      if (track) peer.addTrack(track, stream);
      peer.addEventListener('connectionstatechange', this.onConnectionStateChange);
      this.publish({ phase: 'connecting' });

      const offer = await peer.createOffer();
      await peer.setLocalDescription({ type: 'offer', sdp: offer.sdp });
      if (epoch !== this.epoch) return;

      this.setTimer('ice', () => {
        if (epoch !== this.epoch) return;
        if (!['live', 'closing'].includes(this.state.phase)) this.fail('ice_timeout');
      }, this.deps.iceTimeoutMs ?? DEFAULT_ICE_TIMEOUT_MS);

      const abort = new AbortController();
      this.createAbort = abort;
      const handle = await this.deps.adapter.createSession({ request: this.deps.request, offerSdp: offer.sdp, signal: abort.signal });
      if (epoch !== this.epoch) {
        // The attempt was stopped/failed/timed out/disposed while the remote create was in
        // flight: never resurrect `waiting_started`; close the late remote session instead.
        this.closeRemote(handle.sessionId, 'close_requested');
        return;
      }
      // Retain the trusted handle immediately: if applying the answer SDP below throws, the
      // remote session is already ours and must still be released exactly once.
      this.createdSessionId = handle.sessionId;
      await peer.setRemoteDescription({ type: 'answer', sdp: handle.answerSdp });
      if (epoch !== this.epoch) {
        this.closeRemote(handle.sessionId, 'close_requested');
        return;
      }

      this.expectedSessionId = handle.sessionId;
      this.publish({ phase: 'waiting_started', sessionId: handle.sessionId });
      // The connection is now bound to a created id: validate buffered early frames against it.
      this.drainEarlyEvents();
      this.setTimer('start', () => {
        if (epoch !== this.epoch) return;
        if (this.state.phase === 'waiting_started' || this.state.phase === 'connecting') this.fail('start_timeout');
      }, this.deps.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS);
    } catch (error) {
      if (epoch !== this.epoch) return;
      const aborted = isAbortError(error);
      if (aborted && this.state.phase === 'closing') return;
      this.fail(aborted ? 'cancelled' : 'create_failed');
    }
  }

  /**
   * Explicit stop: disable the microphone immediately (synchronously, before any await),
   * then request a graceful close and wait for `session.closed` to retain final usage.
   */
  stop(reason: LiveCloseReason = 'close_requested'): void {
    if (['idle', 'closed', 'failed'].includes(this.state.phase)) return;
    // Invalidate any in-flight connect attempt and cancel its remote create.
    this.epoch += 1;
    this.createAbort?.abort();
    this.disableMicrophone();
    this.publish({ phase: 'closing', lastCloseReason: reason });

    // The retained trusted handle covers a stop that races the answer-SDP apply, before the
    // id was ever published; the remote session must still be released.
    const sessionId = this.state.sessionId ?? this.createdSessionId;
    if (!sessionId) {
      void this.finalize(reason, null, null);
      return;
    }
    this.closeRemote(sessionId, reason);
    this.setTimer('finalize', () => {
      // No `session.closed` in time: final usage stays unconfirmed and is reconciled as such.
      this.publish({ usage: this.usage.snapshot(), phase: 'closed', lastCloseReason: reason });
      void this.finalize(reason, null, sessionId);
    }, this.deps.finalizeTimeoutMs ?? DEFAULT_FINALIZE_TIMEOUT_MS);
  }

  /** Barge-in: stop local playback only. Session and delegated work continue. */
  interrupt(): void {
    if (this.state.phase !== 'live') return;
    const playback = this.deps.playback;
    // No real stop port: refuse rather than report a broken boolean success. The UI already
    // disables the control because `canInterrupt` stays false.
    if (!playback) return;
    try {
      playback.stopOutput();
    } catch {
      // Playback port failures must not break the interruption state machine.
    }
    this.publish({ interrupted: true });
  }

  /** Clear the barge-in flag once the caller has resumed output. */
  clearInterruption(): void {
    if (!this.state.interrupted) return;
    try {
      this.deps.playback?.resumeOutput();
    } catch {
      // Playback port failures must not break the interruption state machine.
    }
    this.publish({ interrupted: false });
  }

  /** Cancel one delegated backend action. Distinct from `interrupt()`. */
  cancelAction(delegationId: string): boolean {
    const cancelled = this.delegation.cancel(delegationId);
    if (cancelled) this.publish({});
    return cancelled;
  }

  /** Schedule delegated backend work against the injected adapter. */
  async dispatchDelegation(request: LiveDelegationRequest): Promise<DelegationResult> {
    // Dispatch only from a live, owned session. Idle/closing/failed/disposed controllers
    // (including a retained reference after logout) refuse before touching the backend.
    if (this.state.phase !== 'live' || this.disposed) {
      return { delegationId: request.delegationId, status: 'failed', summary: 'not_dispatchable' };
    }
    if (request.sessionId && request.sessionId !== this.state.sessionId) {
      return { delegationId: request.delegationId, status: 'failed', summary: 'session_mismatch' };
    }
    this.publish({ busy: true });
    // `run` registers its abort controller synchronously, so this publish exposes the
    // in-flight action to subscribers while the backend call is still pending.
    const running = this.delegation.run(request);
    this.publish({ busy: true });
    const result = await running;
    this.publish({ busy: false });
    return result;
  }

  /** Called by the host when browser playback is refused (autoplay policy). */
  reportPlaybackBlocked(message = 'Audio playback needs a tap to start.'): void {
    this.publish({ playbackBlocked: true, error: 'playback_blocked', serverError: { code: 'playback_blocked', message } });
  }

  /** Actionable recovery for a refused playback: called from a user gesture. */
  resumePlayback(): void {
    if (this.disposed || this.state.phase !== 'live' || !this.deps.playback) return;
    this.publish({ playbackBlocked: false, error: null, serverError: null });
    try {
      this.deps.playback.resumeOutput();
    } catch {
      this.reportPlaybackBlocked();
    }
  }

  /**
   * Teardown for logout / actor change / replacement / unmount. Idempotent: after the
   * first call the controller stays inert until a fresh `startFromGesture`.
   */
  dispose(reason: 'logout' | 'actor_change' | 'replacement' | 'unmount' = 'unmount'): void {
    // Read the published id, but fall back to the retained trusted handle: a create that
    // returned while its answer SDP is still pending has never published `state.sessionId`,
    // and the teardown below erases `createdSessionId`. Capture before teardown or the remote
    // session leaks on logout/actor change.
    const sessionId = this.state.sessionId ?? this.createdSessionId;
    void reason;
    const closeReason: LiveCloseReason = 'close_requested';
    this.epoch += 1;
    this.disposed = true;
    this.delegation.abortAll();
    this.createAbort?.abort();
    this.clearTimers();
    this.teardownPorts();
    this.publish({
      phase: this.state.sessionId || this.state.phase === 'live' ? 'closed' : 'idle',
      microphoneEnabled: false,
      busy: false,
      activeActions: [],
    });
    // An existing remote session must be released on the wire, not just torn down locally.
    if (sessionId) {
      this.closeRemote(sessionId, closeReason);
      void this.reconcileUnconfirmed(sessionId);
    }
  }

  private onChannelMessage = (event: { data: unknown }): void => {
    const parsed = parseLiveEvent(event.data);
    if (parsed) this.applyEvent(parsed);
  };

  private onConnectionStateChange = (): void => {
    const peer = this.peer;
    if (!peer) return;
    if (peer.connectionState === 'failed') {
      // No hidden reconnect: surface the failure and clean up.
      if (!['closing', 'closed', 'failed', 'idle'].includes(this.state.phase)) this.fail('network');
    } else if (peer.connectionState === 'connected') {
      this.clearTimer('ice');
    }
  };

  private applyEvent(event: LiveEvent): void {
    const phase = this.state.phase;
    switch (event.type) {
      case 'session.started': {
        // Only the connect phases may promote a session, and only for the id we created.
        if (phase !== 'connecting' && phase !== 'waiting_started') return;
        if (this.expectedSessionId === null) {
          // The trusted create has not landed yet: buffer (bounded) and validate on drain.
          this.queueEarlyEvent(event);
          return;
        }
        if (event.sessionId !== this.expectedSessionId) return;
        this.clearTimer('start');
        this.clearTimer('ice');
        this.publish({ phase: 'live', sessionId: event.sessionId, error: null, microphoneEnabled: true });
        return;
      }
      case 'session.input_transcript.delta': {
        if (phase !== 'live') return;
        const rows = this.transcript.append('user', event.delta, event.startMs, event.endMs);
        this.publish({ transcript: rows });
        return;
      }
      case 'session.output_transcript.delta': {
        if (phase !== 'live') return;
        const rows = this.transcript.append('assistant', event.delta, event.startMs, event.endMs, { newRow: this.state.interrupted });
        this.publish({ transcript: rows });
        return;
      }
      case 'session.usage.updated':
        if (phase !== 'live' && phase !== 'closing') return;
        this.usage.observe(event.seconds);
        this.publish({ usage: this.usage.snapshot() });
        return;
      case 'error':
        if (!['connecting', 'waiting_started', 'live', 'closing'].includes(phase)) return;
        this.publish({ serverError: { code: event.code, message: event.message } });
        return;
      case 'session.closed': {
        // Id-less termination binds to the owning connection and must be finalised exactly once.
        if (!['connecting', 'waiting_started', 'live', 'closing'].includes(phase)) return;
        // ...but only once that connection is bound to a created handle. Before the create
        // response we cannot tell a real close from a stray/stale frame, so we never let it
        // settle usage or phase (the connect timeout still fails the attempt and reconciles).
        if (this.expectedSessionId === null) return;
        this.clearTimers();
        this.usage.close(event.reason, event.seconds);
        this.publish({ usage: this.usage.snapshot(), phase: 'closed', lastCloseReason: event.reason, microphoneEnabled: false });
        void this.finalize(event.reason, event.seconds, this.state.sessionId);
        return;
      }
    }
  }

  /** Buffer a pre-bind `session.started` (bounded: oldest frames are dropped first). */
  private queueEarlyEvent(event: LiveEvent): void {
    this.earlyEvents.push(event);
    if (this.earlyEvents.length > MAX_EARLY_EVENTS) this.earlyEvents.shift();
  }

  /** Replay buffered early frames now that the real created id is known, dropping mismatches. */
  private drainEarlyEvents(): void {
    const queued = this.earlyEvents;
    this.earlyEvents = [];
    for (const event of queued) {
      if (event.type === 'session.started' && event.sessionId !== this.expectedSessionId) continue;
      this.applyEvent(event);
    }
  }

  /** Usage confirmation + trusted-backend reconciliation, then transport cleanup. */
  private async finalize(reason: LiveCloseReason, seconds: number | null, sessionId: string | null): Promise<void> {
    void reason;
    void seconds;
    this.clearTimers();
    this.teardownPorts();
    this.publish({ microphoneEnabled: false });
    if (!sessionId) return;
    await this.reconcileUnconfirmed(sessionId);
  }

  /**
   * Release an existing remote session on the wire. Idempotent per session id, and uses its
   * own cleanup signal that user-initiated cancellation never aborts.
   */
  private closeRemote(sessionId: string, reason: LiveCloseReason): void {
    if (this.closingRemotes.has(sessionId)) return;
    this.closingRemotes.add(sessionId);
    const abort = new AbortController();
    this.cleanupAbort = abort;
    void Promise.resolve(this.deps.adapter.closeSession({ sessionId, reason, signal: abort.signal })).catch(() => undefined);
  }

  /**
   * Report client-observed usage to the trusted reconciler when close left it unconfirmed.
   * Failure keeps usage unconfirmed; it is never asserted as billing-final on the client.
   */
  private async reconcileUnconfirmed(sessionId: string): Promise<void> {
    if (!this.deps.reconciler || !this.usage.needsReconcile) return;
    if (this.reconciledSessions.has(sessionId)) return;
    this.reconciledSessions.add(sessionId);
    try {
      const result = await this.deps.reconciler.reconcile(this.usage.reconcileInput(sessionId));
      this.usage.markReconciled(result.reconciledSeconds, result.accepted);
    } catch {
      // Reconciliation failure leaves usage unconfirmed; it is never asserted as final.
    }
    this.publish({ usage: this.usage.snapshot() });
  }

  private disableMicrophone(): void {
    if (this.stream) stopStream(this.stream);
    this.stream = null;
    this.publish({ microphoneEnabled: false });
  }

  private fail(code: Exclude<LiveErrorCode, null>): void {
    // Invalidate the connect attempt and cancel any in-flight remote create.
    this.epoch += 1;
    this.createAbort?.abort();
    // Prefer the published id, but fall back to the retained trusted handle so an SDP failure
    // before the UI publish still releases the remote session (exactly once, via closingRemotes).
    const sessionId = this.state.sessionId ?? this.createdSessionId;
    this.clearTimers();
    this.teardownPorts();
    this.publish({ phase: 'failed', error: code, microphoneEnabled: false, busy: false });
    if (sessionId) {
      this.closeRemote(sessionId, code === 'network' ? 'connection_lost' : 'close_requested');
      void this.reconcileUnconfirmed(sessionId);
    }
  }

  /** Idempotent release of media tracks, channel and peer connection. */
  private teardownPorts(): void {
    if (this.stream) stopStream(this.stream);
    this.stream = null;
    const channel = this.channel;
    if (channel) {
      if (this.channelListener) channel.removeEventListener('message', this.channelListener);
      try {
        channel.close();
      } catch {
        // Channel may already be closed by the transport.
      }
    }
    this.channel = null;
    // Invalidate the connection binding so late events from this channel are ignored.
    this.channelEpoch = -1;
    this.channelListener = null;
    this.earlyEvents = [];
    this.createdSessionId = null;
    const peer = this.peer;
    if (peer) {
      peer.removeEventListener('connectionstatechange', this.onConnectionStateChange);
      try {
        peer.close();
      } catch {
        // Peer may already be closed by the transport.
      }
    }
    this.peer = null;
  }
}

function stopStream(stream: LiveMediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Track may already be stopped.
    }
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { name?: string }).name === 'AbortError';
}
