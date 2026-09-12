'use client';
/**
 * Real physical voice rail for Ask Trophē.
 *
 * This surface is deliberately narrow: it renders ONE focused, in-flow rail anchored inside the
 * Ask composer (never a floating overlay over the thread), streams live transcript turns out to the
 * single chat history via `onTranscript`, and owns no store of its own. Amplitude, microphone mute,
 * and the admitted server deadline are consumed through a minimal structural adapter (see
 * `LiveVoiceControllerPort`); when the engine has not published them yet the rail degrades
 * honestly — it never fakes a level, a count, or a state.
 *
 * Authoritative backend work (create/close session, delegation, budget, deadline) stays in
 * `lib/voice-live` (DS2) and `app/api/coach-assistant/live` (AG1). This file performs no provider,
 * auth, budget or network call of its own beyond importing the existing browser adapter.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AudioLines, Mic, MicOff, Pause, Play, Square, X } from 'lucide-react';
import type { LiveTranscriptRow } from '@/lib/voice-live/client-types';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './LiveVoiceControl.module.css';

// ---------------------------------------------------------------------------------------------
// Transcript streaming: pure, display-only helpers. Voice rows are appended to the ONE existing
// chat history; they never trigger backend work, and anything already present in the thread is
// deduped so the spoken words are not read out a second time.
//
// The official GPT-Live transcript contract carries ONLY `event_id`/`delta`/`start_ms`/`end_ms`:
// there is no provider item id, no `utterance_id`, and no authoritative "turn completed" event.
// Groups here are therefore a client-LOCAL rendering convenience (stable local ids), never a
// semantic turn and never a trigger for any call. Dedup uses the real `event_id` when the engine
// publishes it; a late/out-of-order fragment revises the open group instead of adding a duplicate.
// ---------------------------------------------------------------------------------------------

/**
 * Optional, additive row fields the engine (DS2) may publish alongside `speaker`/`text`/`startMs`/
 * `endMs`. Absent fields simply mean "no revision metadata"; nothing here is required and none of
 * them is a provider utterance id.
 */
interface VoiceCaptionFields {
  /** Client-local group id (e.g. `row-3`). Never a provider id. */
  id?: string;
  /** Provider `event_id` of the last fragment merged into this group (real field, used for dedup). */
  eventId?: string;
  /** `open` while still receiving; `settled` once a newer group for this speaker began. */
  status?: 'open' | 'settled';
  /** True when a late/out-of-order fragment revised this group. */
  revision?: boolean;
}

export interface VoiceChatEntry extends LiveTranscriptRow, VoiceCaptionFields {
  id: string;
}

export interface VoiceChatText {
  user: string[];
  assistant: string[];
}

const normalizeText = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Stable LOCAL identity for a caption group. Prefers the engine's own local id, then the real
 * provider `event_id`, then the fragment interval. It is never a provider utterance id.
 */
export function voiceTranscriptId(row: LiveTranscriptRow): string {
  const fields = row as LiveTranscriptRow & VoiceCaptionFields;
  if (typeof fields.id === 'string' && fields.id) return fields.id;
  if (typeof fields.eventId === 'string' && fields.eventId) return fields.eventId;
  return `${row.speaker}:${row.startMs}:${row.endMs}`;
}

const overlapsGroup = (entry: VoiceChatEntry, row: LiveTranscriptRow): boolean =>
  row.startMs < entry.endMs && row.endMs > entry.startMs;

/**
 * Merge an incoming fragment into a group. Late fragments usually extend or restate the open
 * group, so keep whichever text is longer (falls back to appending) and widen the interval.
 */
const mergeFragmentText = (current: string, incoming: string): string => {
  const a = current.trim();
  const b = incoming.trim();
  if (!a) return b;
  if (!b) return a;
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerB.includes(lowerA)) return b;
  if (lowerA.includes(lowerB)) return a;
  return `${a} ${b}`;
};

/**
 * Append new fragments in server order. A repeated `event_id` is ignored; a fragment overlapping
 * the still-open group for the same speaker revises it (`revision: true`) instead of duplicating.
 */
export function mergeVoiceTurns(existing: VoiceChatEntry[], incoming: LiveTranscriptRow[]): VoiceChatEntry[] {
  const seenIds = new Set(existing.map(entry => entry.id));
  const seenEvents = new Set(existing.map(entry => entry.eventId).filter((id): id is string => Boolean(id)));
  const seenText = new Set(existing.map(entry => `${entry.speaker}:${normalizeText(entry.text)}`));
  const next = [...existing];
  for (const row of incoming) {
    const fields = row as LiveTranscriptRow & VoiceCaptionFields;
    if (fields.eventId && seenEvents.has(fields.eventId)) continue;
    const text = normalizeText(row.text);
    if (!text) continue;
    const id = voiceTranscriptId(row);
    const key = `${row.speaker}:${text}`;
    if (seenIds.has(id) && !fields.id) continue;
    if (seenIds.has(id)) {
      // Engine rows are cumulative snapshots: same id with a new delta revises in place.
      const index = next.findIndex(entry => entry.id === id);
      next[index] = { ...row, id };
      if (fields.eventId) seenEvents.add(fields.eventId);
      continue;
    }
    const openIndex = next.findIndex(entry =>
      entry.speaker === row.speaker && entry.status !== 'settled' && overlapsGroup(entry, row));
    if (openIndex >= 0) {
      const open = next[openIndex];
      next[openIndex] = {
        ...open,
        text: mergeFragmentText(open.text, row.text),
        startMs: Math.min(open.startMs, row.startMs),
        endMs: Math.max(open.endMs, row.endMs),
        eventId: fields.eventId ?? open.eventId,
        revision: true,
      };
      if (fields.eventId) seenEvents.add(fields.eventId);
      continue;
    }
    if (seenText.has(key)) continue;
    seenIds.add(id);
    seenText.add(key);
    if (fields.eventId) seenEvents.add(fields.eventId);
    next.push({ ...row, id });
  }
  return next.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

/**
 * A voice row is shown only when the thread does not already carry it. A streamed user fragment is
 * superseded by the delegated chat turn it produced (the backend answer, its proposals and cards),
 * so the question is not printed twice.
 */
export function voiceRowVisible(row: VoiceChatEntry, chat: VoiceChatText): boolean {
  const text = normalizeText(row.text);
  if (!text) return false;
  const pool = row.speaker === 'user' ? chat.user : chat.assistant;
  return !pool.some(entry => {
    const other = normalizeText(entry);
    if (!other) return false;
    if (other === text) return true;
    return row.speaker === 'user' && text.length >= 8 && other.includes(text);
  });
}

// ---------------------------------------------------------------------------------------------
// Engine adapter. `lib/voice-live` (DS2) owns the concrete controller; the optional fields and
// methods below are the exact integration points this UI consumes. Absent fields are rendered as
// "not available" rather than stubbed.
// ---------------------------------------------------------------------------------------------

export interface LiveVoiceSnapshot {
  phase: string;
  sessionId?: string | null;
  error?: string | null;
  busy?: boolean;
  playbackBlocked?: boolean;
  interrupted?: boolean;
  canInterrupt?: boolean;
  transcript?: LiveTranscriptRow[];
  /** Real input amplitude 0..1 (RMS) from the engine analyser. `null`/absent => no real level. */
  inputLevel?: number | null;
  /** True only when a real analyser is attached. `false`/absent => render "no level feedback". */
  meterSupported?: boolean;
  /**
   * Real output amplitude 0..1 while the model is speaking, when the engine publishes a real
   * playback level. This is the one adapter field beyond VOICE-UI-CONTRACT.md that the rail needs
   * for its honest "speaking" state: DS2 should publish it from the real remote playback path
   * (e.g. alongside `meterSupported`). Absent => the rail never claims "speaking"; it stays on
   * listening rather than inferring speech from transcript timing.
   */
  outputLevel?: number | null;
  /** True while the microphone TRACK is muted (output keeps playing). Not an output pause. */
  microphoneMuted?: boolean;
  /** Absolute, server-admitted session deadline (epoch ms), from the create/replay receipt. */
  admittedDeadlineMs?: number | null;
  /** The receipt's own field name for the same admitted deadline; accepted as a tolerant alias. */
  deadlineMs?: number | null;
}

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const readLevel = (value: unknown): number | null => {
  const level = readFiniteNumber(value);
  return level === null ? null : Math.min(1, Math.max(0, level));
};

/** The admitted deadline may arrive under the contract name or the receipt's own name. */
function readDeadlineMs(state: LiveVoiceSnapshot): number | null {
  return readFiniteNumber(state.admittedDeadlineMs) ?? readFiniteNumber(state.deadlineMs);
}

export interface LiveVoiceControllerPort {
  subscribe(listener: () => void): () => void;
  snapshot(): LiveVoiceSnapshot;
  startFromGesture(): void | Promise<void>;
  stop(): void;
  interrupt?(): void;
  clearInterruption?(): void;
  resumePlayback?(): void;
  /** Optional microphone mute. Absent => no mute control is offered. */
  setMicrophoneMuted?(muted: boolean): void;
}

export interface LiveVoiceRuntimePort {
  controller: LiveVoiceControllerPort;
  dispose(): void;
}

type LiveVoiceProps = {
  conversationId: string;
  prepareConversation?: () => Promise<string | null>;
  onQuery: (text: string, signal: AbortSignal) => Promise<string>;
  onTranscript?: (row: LiveTranscriptRow) => void;
};

export function LiveVoiceControl(props: LiveVoiceProps) {
  const { t } = useGlobalCoachI18n();
  const [available, setAvailable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (expanded && activeConversationId && props.conversationId !== activeConversationId) setExpanded(false);
  }, [props.conversationId, activeConversationId, expanded]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/coach-assistant/live', { credentials: 'same-origin', signal: abort.signal })
      .then(r => r.ok ? r.json() : null).then(value => { if (!abort.signal.aborted) setAvailable(value?.enabled === true); }).catch(() => {});
    return () => abort.abort();
  }, []);
  if (!available) return null;
  return <>
    <button type="button" className={styles.launcher} disabled={preparing} onClick={async () => {
      if (expanded) { setExpanded(false); return; }
      setPreparing(true);
      try {
        const id = props.prepareConversation ? await props.prepareConversation() : props.conversationId;
        if (id) { setActiveConversationId(id); setExpanded(true); }
      } finally { setPreparing(false); }
    }} aria-label={t('global_coach.live_title')} aria-expanded={expanded}><AudioLines size={19} aria-hidden="true" /></button>
    {expanded && activeConversationId && <LiveSession conversationId={activeConversationId} onQuery={props.onQuery} onTranscript={props.onTranscript} onClose={() => setExpanded(false)} />}
  </>;
}

function LiveSession(props: { conversationId: string; onQuery: LiveVoiceProps['onQuery']; onTranscript?: LiveVoiceProps['onTranscript']; onClose(): void }) {
  const { t } = useGlobalCoachI18n();
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  const audio = useRef<HTMLAudioElement>(null);
  const [runtime, setRuntime] = useState<LiveVoiceRuntimePort | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let instance: LiveVoiceRuntimePort | undefined;
    void import('@/lib/voice-live/browser-session').then(({ createBrowserLiveSession }) => {
      if (!active || !audio.current) return;
      // The browser session already satisfies `LiveVoiceRuntimePort` structurally; no cast is
      // needed (and none is used) so a breaking engine change is a compile error, not silent drift.
      instance = createBrowserLiveSession({
        audio: audio.current,
        prepareConversation: async () => latest.current.conversationId,
        query: (text, signal) => latest.current.onQuery(text, signal),
      });
      setRuntime(instance);
    }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; instance?.dispose(); };
  }, []);
  return <section className={styles.rail} aria-label={t('global_coach.live_title')}>
    <header className={styles.railHeader}>
      <span className={styles.railTitle}><AudioLines size={16} aria-hidden="true" />{t('global_coach.live_title')}</span>
      <button type="button" className={styles.iconButton} onClick={props.onClose} aria-label={t('global_coach.close')}><X size={18} aria-hidden="true" /></button>
    </header>
    {loadFailed && <p role="alert" className={styles.alert}>{t('global_coach.live_error')}</p>}
    {runtime && <LiveVoiceRail runtime={runtime} onTranscript={props.onTranscript} />}
    {/* No `autoPlay`: remote audio only starts after the explicit start gesture, via the playback port. */}
    <audio ref={audio} preload="none" className={styles.audio} />
  </section>;
}

function LiveVoiceRail({ runtime, onTranscript }: { runtime: LiveVoiceRuntimePort; onTranscript?: (row: LiveTranscriptRow) => void }) {
  const { t } = useGlobalCoachI18n();
  const { controller } = runtime;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const inactive = ['idle', 'failed', 'closed'].includes(state.phase);
  const live = state.phase === 'live';
  const muted = state.microphoneMuted === true;

  // Stream transcript turns into the one chat history. A group is emitted once and re-emitted only
  // when a late fragment revised it, so revisions update the existing chat entry in place.
  const rows = useMemo(() => state.transcript ?? [], [state.transcript]);
  const emitted = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!onTranscript) return;
    for (const row of rows) {
      const id = `${state.sessionId ?? "pending"}:${voiceTranscriptId(row)}`;
      if (emitted.current.get(id) === row.text) continue;
      emitted.current.set(id, row.text);
      onTranscript({ ...row, id });
    }
  }, [rows, onTranscript, state.sessionId]);
  useEffect(() => { if (!rows.length) emitted.current.clear(); }, [rows.length]);

  // Elapsed/remaining come from the admitted server deadline only; with no deadline there is no count.
  const deadlineMs = readDeadlineMs(state);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (deadlineMs === null || !live) { setRemainingMs(null); return; }
    const update = () => setRemainingMs(Math.max(0, deadlineMs - Date.now()));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [deadlineMs, live]);

  // A real analyser is the only source of a level; without one the rail says so instead of faking.
  const meterSupported = state.meterSupported === true || typeof state.inputLevel === 'number';
  const inputLevel = meterSupported ? readLevel(state.inputLevel) : null;
  const outputLevel = readLevel(state.outputLevel);
  const speaking = live && !muted && outputLevel !== null && outputLevel > 0.02;
  const statusKey = inactive ? 'global_coach.live_ready'
    : state.phase === 'closing' ? 'global_coach.live_ending'
      : state.phase !== 'live' ? 'global_coach.live_connecting'
        : speaking ? 'global_coach.live_speaking' : 'global_coach.live_listening';

  const canMute = live && typeof controller.setMicrophoneMuted === 'function';
  const errorKey = state.error === 'permission' ? 'global_coach.live_microphone_permission'
    : state.error === 'unsupported' ? 'global_coach.live_microphone_unavailable'
      : state.error === 'playback_blocked' ? null : state.error ? 'global_coach.live_error' : null;

  return <>
    <p role="status" aria-live="polite" className={styles.status}>{t(statusKey)}</p>
    {muted && !inactive && <p role="status" className={styles.mutedNotice}>{t('global_coach.live_mic_muted')}</p>}
    {errorKey && <p role="alert" className={styles.alert}>{t(errorKey)}</p>}
    {live && !meterSupported
      ? <p className={styles.mutedNotice}>{t('global_coach.live_no_level')}</p>
      : <LiveVoiceWaveform level={muted ? 0 : inputLevel} live={live && !muted && meterSupported} label={t('global_coach.live_waveform')} />}
    {remainingMs !== null && <p className={styles.deadline}>{t('global_coach.live_time_left', { seconds: Math.max(0, Math.ceil(remainingMs / 1000)) })}</p>}
    {state.busy && <p role="status" className={styles.status}>{t('global_coach.live_working')}</p>}
    <div className={styles.controls}>
      {inactive
        ? <button type="button" className={styles.startCta} onClick={() => void controller.startFromGesture()}>{t('global_coach.live_start')}</button>
        : <button type="button" className={styles.endButton} onClick={() => controller.stop()}><Square size={15} aria-hidden="true" />{t('global_coach.live_end')}</button>}
      {canMute && <button type="button" className={styles.controlButton} aria-pressed={muted} onClick={() => controller.setMicrophoneMuted!(!muted)}>
        {muted ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
        {t(muted ? 'global_coach.live_unmute_mic' : 'global_coach.live_mute_mic')}
      </button>}
      {state.canInterrupt && <button type="button" className={styles.controlButton} onClick={() => controller.interrupt?.()}><Pause size={17} aria-hidden="true" />{t('global_coach.live_interrupt')}</button>}
      {state.interrupted && <button type="button" className={styles.controlButton} onClick={() => controller.clearInterruption?.()}><Play size={17} aria-hidden="true" />{t('global_coach.live_resume')}</button>}
      {state.playbackBlocked && !state.interrupted && <button type="button" className={styles.controlButton} onClick={() => controller.resumePlayback?.()}><Play size={17} aria-hidden="true" />{t('global_coach.live_resume')}</button>}
    </div>
  </>;
}

const WAVEFORM_BARS = 24;
const WAVEFORM_BASELINE = 0.12;

/**
 * `resolved` stays false on the server and on the first client paint so hydration is stable; the
 * waveform only starts once the real preference is known.
 */
function usePrefersReducedMotion(): { reduce: boolean; resolved: boolean } {
  const [preference, setPreference] = useState({ reduce: false, resolved: false });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setPreference({ reduce: false, resolved: true });
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPreference({ reduce: query.matches, resolved: true });
    apply();
    query.addEventListener?.('change', apply);
    return () => query.removeEventListener?.('change', apply);
  }, []);
  return preference;
}

/**
 * Large waveform driven by the real input amplitude. The animation loop runs ONLY while the
 * session is live and the engine reports an amplitude; otherwise the bars stay at rest. Reduced
 * motion keeps a still, meaningful shape at the current level instead of animating.
 */
function LiveVoiceWaveform({ level, live, label }: { level: number | null; live: boolean; label: string }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([]);
  const target = useRef(0);
  const { reduce, resolved } = usePrefersReducedMotion();
  const measurable = typeof level === 'number';
  useEffect(() => {
    target.current = measurable ? Math.min(1, Math.max(0, level as number)) : 0;
  }, [level, measurable]);
  useEffect(() => {
    const paint = (values: number[]) => {
      bars.current.forEach((bar, index) => { if (bar) bar.style.transform = `scaleY(${(values[index] ?? WAVEFORM_BASELINE).toFixed(3)})`; });
    };
    if (!resolved || !live || !measurable) {
      paint(Array.from({ length: WAVEFORM_BARS }, () => WAVEFORM_BASELINE));
      return;
    }
    if (reduce) {
      paint(Array.from({ length: WAVEFORM_BARS }, (_, index) => WAVEFORM_BASELINE + (1 - WAVEFORM_BASELINE) * Math.abs(Math.sin((index + 1) * 1.7)) * target.current));
      return;
    }
    let samples = Array.from({ length: WAVEFORM_BARS }, () => WAVEFORM_BASELINE);
    let frame = 0;
    const tick = () => {
      samples = [...samples.slice(1), Math.max(WAVEFORM_BASELINE, target.current)];
      paint(samples);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [resolved, live, measurable, reduce]);
  const indices = useMemo(() => Array.from({ length: WAVEFORM_BARS }, (_, index) => index), []);
  return <div className={styles.waveform} role="img" aria-label={label}>
    {indices.map(index => <span key={index} ref={node => { bars.current[index] = node; }} style={{ transform: `scaleY(${WAVEFORM_BASELINE})` }} />)}
  </div>;
}
