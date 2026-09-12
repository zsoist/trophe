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
  LiveInputMeterPort,
  LiveMediaStream,
  LiveOutputMeterPort,
  LivePlaybackEvent,
  LivePlaybackPort,
  LivePeerConnection,
  LiveSessionRequest,
  LiveTranscriptCursor,
  LiveTranscriptRow,
  LiveUserFragmentBatch,
  LiveUsageReconciler,
  LiveUsageSnapshot,
} from './client-types';
import { METER_FRESHNESS_NOTIFY_MS, METER_SAMPLE_TTL_MS } from './client-types';
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
  /** Local mic track muted (`track.enabled = false`). NOT output pause, NOT teardown. */
  microphoneMuted: boolean;
  /** True only when a real analyser is attached; false means hosts must not draw a wave. */
  meterSupported: boolean;
  /** Latest real input amplitude 0..1 from the analyser, or null when unsupported/muted. */
  inputLevel: number | null;
  /** Epoch ms of the last real input sample backing `inputLevel`; null when none. */
  inputLevelUpdatedAtMs: number | null;
  /** True only when a real analyser is attached to the REMOTE output stream. */
  outputMeterSupported: boolean;
  /** Latest real output amplitude 0..1 while actually playing, or null when silent/not playing. */
  outputLevel: number | null;
  /** Epoch ms of the last real output sample backing `outputLevel`; null when none. */
  outputLevelUpdatedAtMs: number | null;
  /** Server-admitted deadline (epoch ms), or null when the transport admitted none. */
  admittedDeadlineMs: number | null;
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
  /** Injected real input meter. The controller never fabricates a level without it. */
  inputMeter?: LiveInputMeterPort | null;
  /**
   * Injected real output meter, attached to the remote media stream the playback owner
   * received. Gated on real playback status so a paused/interrupted output is never
   * reported as sounding. Absent => output levels stay unsupported (never fabricated).
   */
  outputMeter?: LiveOutputMeterPort | null;
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
  microphoneMuted: false,
  meterSupported: false,
  inputLevel: null,
  inputLevelUpdatedAtMs: null,
  outputMeterSupported: false,
  outputLevel: null,
  outputLevelUpdatedAtMs: null,
  admittedDeadlineMs: null,
  busy: false,
  activeActions: [],
  interrupted: false,
  canInterrupt: false,
  transcript: [],
  usage: emptyUsage(),
  lastCloseReason: null,
});

/**
 * One metered level channel (input mic, or remote output). `generation` invalidates
 * callbacks from a previous attach/session so a stale analyser can never publish into a
 * newer session. `measuredAtMs` is the freshness hook: a sample older than
 * `METER_SAMPLE_TTL_MS` is dropped by the watchdog rather than replayed as fresh.
 */
interface LevelChannel {
  supported: boolean;
  level: number | null;
  measuredAtMs: number | null;
  generation: number;
  detach: (() => void) | null;
  staleHandle: unknown;
}

const createLevelChannel = (): LevelChannel => ({
  supported: false,
  level: null,
  measuredAtMs: null,
  generation: 0,
  detach: null,
  staleHandle: null,
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
  private readonly input = createLevelChannel();
  private readonly output = createLevelChannel();
  /** True only while the output owner reports real `playing` status. */
  private outputAudible = false;
  private playbackUnsubscribe: (() => void) | null = null;
  /** Last time subscribers were notified for a freshness-only (identical amplitude) update. */
  private lastLevelNotifyAtMs = 0;

  constructor(deps: LiveLifecycleDeps) {
    this.deps = deps;
    this.timers = deps.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
    this.delegation = new LiveDelegation(deps.delegation ?? null);
  }

  /**
   * Subscribe to the real playback owner once. Idempotent, so a restart after dispose
   * re-observes without stacking duplicate listeners.
   */
  private observePlayback(): void {
    if (this.playbackUnsubscribe) return;
    const playback = this.deps.playback;
    const observe = playback?.observe;
    if (!playback || typeof observe !== 'function') return;
    try {
      this.playbackUnsubscribe = observe.call(playback, event => this.onPlaybackEvent(event)) ?? null;
    } catch {
      this.playbackUnsubscribe = null;
    }
  }

  private onPlaybackEvent = (event: LivePlaybackEvent): void => {
    if (this.disposed) return;
    if (event.type === 'stream') {
      this.attachOutputMeter(event.stream);
      return;
    }
    this.setOutputAudible(event.status === 'playing');
  };

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
    this.observePlayback();
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
    this.attachInputMeter(stream);

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
      const admittedDeadlineMs = typeof handle.admittedDeadlineMs === 'number'
        && Number.isFinite(handle.admittedDeadlineMs) && handle.admittedDeadlineMs > Date.now()
        ? handle.admittedDeadlineMs
        : null;
      this.publish({ phase: 'waiting_started', sessionId: handle.sessionId, admittedDeadlineMs });
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
    // No further provider deltas are expected once the user stops: settle caption groups now.
    this.publish({ phase: 'closing', lastCloseReason: reason, transcript: this.transcript.settle() });

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
    // Even without a status observer, a stopped output is not audible: drop the level now.
    this.setOutputAudible(false);
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

  /**
   * Real microphone mute: toggles `MediaStreamTrack.enabled` so the track stays live and
   * sends silence. Distinct from output pause (`interrupt`) and from teardown (`stop`).
   * Ignored (never a false claim) when no live mic track exists or the track has no
   * writable `enabled`.
   */
  setMicrophoneMuted(muted: boolean): void {
    if (this.disposed) return;
    const track = this.stream?.getTracks()[0];
    if (!track || this.state.microphoneEnabled !== true) return;
    if (typeof track.enabled !== 'boolean' && !('enabled' in track)) return;
    try {
      track.enabled = !muted;
    } catch {
      return;
    }
    // When muted the analyser reads silence; report 0 rather than a stale level.
    this.publish({ microphoneMuted: muted });
    this.publishLevels();
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
      return { delegationId: request.delegationId, status: 'failed', summary: 'not_dispatchable', dispatched: false };
    }
    if (request.sessionId && request.sessionId !== this.state.sessionId) {
      return { delegationId: request.delegationId, status: 'failed', summary: 'session_mismatch', dispatched: false };
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

  /**
   * Unseen RAW user fragments for a delegation, in arrival order, plus the cursor to record
   * once dispatched. Hosts must build delegated text from this — NOT from `transcript` rows —
   * because display caption rows merge fragments and a row cursor would strand any fragment
   * that arrives after its row was already consumed.
   */
  userFragmentBatch(cursor: LiveTranscriptCursor | null = null): LiveUserFragmentBatch {
    return this.transcript.pendingUserFragments(cursor);
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
    // Drop the playback observer so callbacks from this (old) session can never publish.
    const unsubscribe = this.playbackUnsubscribe;
    this.playbackUnsubscribe = null;
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // A broken observer teardown must not block disposal.
      }
    }
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
      // Deltas only (event_id/delta/start_ms/end_ms). Local caption grouping is display-only:
      // it never finalizes a semantic turn or triggers delegated work.
      case 'session.input_transcript.delta': {
        if (phase !== 'live') return;
        const rows = this.transcript.append('user', event.delta, event.startMs, event.endMs, { eventId: event.eventId });
        this.publish({ transcript: rows });
        return;
      }
      case 'session.output_transcript.delta': {
        if (phase !== 'live') return;
        const rows = this.transcript.append('assistant', event.delta, event.startMs, event.endMs, { newRow: this.state.interrupted, eventId: event.eventId });
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
    this.detachChannel('input');
    if (this.stream) stopStream(this.stream);
    this.stream = null;
    this.publish({ microphoneEnabled: false, microphoneMuted: false });
    this.publishLevels();
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
    // Close any still-open caption groups: `settled` only means "no more deltas will extend
    // them", never that a complete semantic turn was received from the provider.
    const captions = this.transcript.settle();
    if (captions.some(row => row.status === 'settled')) this.publish({ transcript: captions });
    this.detachChannel('input');
    this.detachChannel('output');
    this.outputAudible = false;
    this.output.level = null;
    // Republish the cleared levels so a disposed/stopped snapshot can never still read as
    // "speaking" from the last sample.
    this.publishLevels();
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

  /**
   * Attach the injected real analyser to the acquired microphone stream. A missing port, a
   * throwing implementation, or a `null` detach all surface `meterSupported: false` — the
   * controller never fabricates a level.
   */
  private attachInputMeter(stream: LiveMediaStream): void {
    this.attachChannel('input', this.deps.inputMeter, stream);
  }

  /**
   * Attach the injected real analyser to the REMOTE output stream (or detach when the stream
   * is gone). The stream comes from the playback owner, so the level reflects the real remote
   * media; audibility is gated separately by the reported playback status.
   */
  private attachOutputMeter(stream: LiveMediaStream | null): void {
    this.attachChannel('output', stream ? this.deps.outputMeter : null, stream);
  }

  private attachChannel(kind: 'input' | 'output', meter: LiveInputMeterPort | LiveOutputMeterPort | null | undefined, stream: LiveMediaStream | null): void {
    const channel = kind === 'input' ? this.input : this.output;
    this.detachChannel(kind);
    if (!meter || !stream) {
      channel.supported = false;
      this.publishLevels();
      return;
    }
    const generation = ++channel.generation;
    let detach: (() => void) | null = null;
    try {
      detach = meter.attach(stream, level => this.onMeterSample(kind, level, generation));
    } catch {
      detach = null;
    }
    if (!detach) {
      channel.supported = false;
      channel.level = null;
      channel.measuredAtMs = null;
      this.publishLevels();
      return;
    }
    channel.supported = true;
    channel.detach = detach;
    this.publishLevels();
  }

  /** Apply one measured sample, rejecting callbacks from a detached/old session. */
  private onMeterSample(kind: 'input' | 'output', level: number | null, generation: number): void {
    const channel = kind === 'input' ? this.input : this.output;
    if (this.disposed || channel.generation !== generation || !channel.supported) return;
    // Output levels are meaningless unless the audio is actually sounding.
    if (kind === 'output' && !this.outputAudible) return;
    const bounded = typeof level === 'number' && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : null;
    channel.level = bounded;
    channel.measuredAtMs = bounded === null ? null : Date.now();
    this.armStaleWatch(kind);
    this.publishLevels();
  }

  private setOutputAudible(audible: boolean): void {
    this.outputAudible = audible;
    if (!audible) {
      this.clearStaleWatch('output');
      this.output.level = null;
      this.output.measuredAtMs = null;
    }
    this.publishLevels();
  }

  /**
   * Publish the metered levels. A visible level change notifies immediately. When real samples
   * keep arriving at the SAME amplitude the timestamps still advance, and subscribers are
   * notified at a bounded rate (`METER_FRESHNESS_NOTIFY_MS`) so a held snapshot never drifts
   * past the freshness TTL while samples flow — without turning a 60 fps analyser into 60 React
   * notifications per second. Timestamps are only ever the real `Date.now()` of a real sample.
   */
  private publishLevels(): void {
    const inputLevel = this.state.microphoneMuted ? 0 : this.input.level;
    const outputLevel = this.outputAudible ? this.output.level : null;
    const next = {
      meterSupported: this.input.supported,
      inputLevel,
      inputLevelUpdatedAtMs: this.input.measuredAtMs,
      outputMeterSupported: this.output.supported,
      outputLevel,
      outputLevelUpdatedAtMs: this.outputAudible ? this.output.measuredAtMs : null,
    };
    const changed = next.meterSupported !== this.state.meterSupported
      || next.inputLevel !== this.state.inputLevel
      || next.outputMeterSupported !== this.state.outputMeterSupported
      || next.outputLevel !== this.state.outputLevel;
    if (changed) {
      this.lastLevelNotifyAtMs = Date.now();
      this.publish(next);
      return;
    }
    if (next.inputLevelUpdatedAtMs !== this.state.inputLevelUpdatedAtMs
      || next.outputLevelUpdatedAtMs !== this.state.outputLevelUpdatedAtMs) {
      this.state = {
        ...this.state,
        inputLevelUpdatedAtMs: next.inputLevelUpdatedAtMs,
        outputLevelUpdatedAtMs: next.outputLevelUpdatedAtMs,
      };
      const now = Date.now();
      if (now - this.lastLevelNotifyAtMs >= METER_FRESHNESS_NOTIFY_MS) {
        this.lastLevelNotifyAtMs = now;
        // Empty patch: same visible values, new snapshot identity. Selector-driven React
        // consumers do not re-render, while a held snapshot reader gets the fresh timestamps.
        this.publish({});
      }
    }
  }

  private armStaleWatch(kind: 'input' | 'output'): void {
    const channel = kind === 'input' ? this.input : this.output;
    this.clearStaleWatch(kind);
    const generation = channel.generation;
    const handle = this.timers.setTimeout(() => {
      if (channel.staleHandle === handle) channel.staleHandle = null;
      if (this.disposed || channel.generation !== generation) return;
      if (channel.level === null) return;
      // No real sample for the TTL (hidden tab / ended media): drop it, never replay it fresh.
      channel.level = null;
      channel.measuredAtMs = null;
      this.publishLevels();
    }, METER_SAMPLE_TTL_MS);
    channel.staleHandle = handle;
  }

  private clearStaleWatch(kind: 'input' | 'output'): void {
    const channel = kind === 'input' ? this.input : this.output;
    if (channel.staleHandle === null) return;
    this.timers.clearTimeout(channel.staleHandle);
    channel.staleHandle = null;
  }

  private detachChannel(kind: 'input' | 'output'): void {
    const channel = kind === 'input' ? this.input : this.output;
    // Bump the generation so any late callback from the old analyser is ignored.
    channel.generation += 1;
    this.clearStaleWatch(kind);
    const detach = channel.detach;
    channel.detach = null;
    channel.supported = false;
    channel.level = null;
    channel.measuredAtMs = null;
    if (!detach) return;
    try {
      detach();
    } catch {
      // Host analyser cleanup failures must not break teardown.
    }
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
