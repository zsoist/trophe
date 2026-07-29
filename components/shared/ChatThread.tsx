'use client';

/**
 * Shared coach<->client chat thread with Supabase Realtime.
 * Phase 1 of coach module (Michael Kavdas call, 2026-06-12).
 * 2026-07-04 overhaul: photo + voice-note attachments (private bucket
 * 'chat-attachments', RLS = the two participants only, migration 0052),
 * custom audio player, image lightbox, accent-aware, fully i18n'd.
 *
 * Consecutive messages from the same sender are visually grouped —
 * the "48 unread messages from one client" problem reads as one block.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Paperclip, Mic, X, Play, Pause, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import {
  releaseAllPreviewUrls,
  releaseUnreferencedPreviewUrls,
} from '@/lib/chat/preview-url-lifecycle';

export interface ChatMessage {
  id: string;
  sender_role: 'coach' | 'client';
  body: string;
  read_at: string | null;
  created_at: string;
  attachment_path: string | null;
  attachment_type: 'image' | 'audio' | null;
  attachment_meta: { duration_s?: number; width?: number; height?: number } | null;
  /** local-only: optimistic blob URL before the signed URL exists */
  localUrl?: string;
}

const MSG_COLS = 'id, sender_role, body, read_at, created_at, attachment_path, attachment_type, attachment_meta';

interface ChatThreadProps {
  coachId: string;
  clientId: string;
  /** Which side the current viewer is on. */
  viewerRole: 'coach' | 'client';
  /** Display name of the other party (header omitted if not given). */
  counterpartName?: string | null;
}

function dayLabel(iso: string, t: (k: string) => string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return t('chat.today');
  if (diff === 1) return t('chat.yesterday');
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Signed-URL cache (55 min; signed for 60) — module-level, shared by bubbles ──
const signedCache = new Map<string, { url: string; expires: number }>();
async function signedUrl(path: string): Promise<string | null> {
  const hit = signedCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  try {
    const { data } = await supabase.storage.from('chat-attachments').createSignedUrl(path, 3600);
    if (!data?.signedUrl) return null;
    signedCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60_000 });
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Downscale to ≤1600px JPEG — chat photos never need more. */
async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('compress failed');
  return { blob, width: w, height: h };
}

function fmtDuration(s: number | undefined): string {
  const v = Math.max(0, Math.round(s ?? 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

// ── Bubble: image (blur-in, tap → lightbox) ──────────────────────────────────
function ImageBubble({ m, onOpen }: { m: ChatMessage; onOpen: (url: string) => void }) {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  useEffect(() => {
    if (m.localUrl || !m.attachment_path) return;
    let live = true;
    signedUrl(m.attachment_path).then((u) => { if (live && u) setRemoteUrl(u); });
    return () => { live = false; };
  }, [m.attachment_path, m.localUrl]);
  const displayUrl = m.localUrl ?? remoteUrl;

  const ratio = m.attachment_meta?.width && m.attachment_meta?.height
    ? m.attachment_meta.height / m.attachment_meta.width : 0.75;

  return (
    <button
      onClick={() => displayUrl && onOpen(displayUrl)}
      style={{
        display: 'block', padding: 0, border: 'none', background: 'rgba(255,255,255,.04)',
        borderRadius: 12, overflow: 'hidden', cursor: displayUrl ? 'pointer' : 'default',
        width: 216, height: Math.min(280, Math.round(216 * ratio)),
      }}
      aria-label="attachment"
    >
      {displayUrl ? (
        <motion.img
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.35 }}
          src={displayUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', animation: 'pulse 1.5s infinite' }} />
      )}
    </button>
  );
}

// ── Bubble: voice note (custom accent player) ─────────────────────────────────
function AudioBubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const duration = m.attachment_meta?.duration_s ?? 0;

  const toggle = async () => {
    if (!audioRef.current) {
      const url = m.localUrl ?? (m.attachment_path ? await signedUrl(m.attachment_path) : null);
      if (!url) return;
      const a = new Audio(url);
      a.addEventListener('timeupdate', () => {
        if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration);
      });
      a.addEventListener('ended', () => { setPlaying(false); setProgress(0); });
      audioRef.current = a;
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { await audioRef.current.play().catch(() => {}); setPlaying(true); }
  };
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 168 }}>
      <button
        onClick={toggle}
        aria-label={playing ? 'pause' : 'play'}
        style={{
          width: 32, height: 32, borderRadius: '50%', border: 'none', flexShrink: 0,
          background: mine ? 'var(--accent, #D4A853)' : 'rgba(255,255,255,.1)',
          color: mine ? '#0a0a0a' : 'var(--t1)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {playing ? <Pause size={13} /> : <Play size={13} style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
          <div style={{
            width: `${progress * 100}%`, height: '100%', borderRadius: 2,
            background: 'var(--accent, #D4A853)', transition: 'width .2s linear',
          }} />
        </div>
        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t4)', marginTop: 4 }}>
          {fmtDuration(duration)}
        </div>
      </div>
    </div>
  );
}

// ── Pending attachment (composer preview chip) ────────────────────────────────
interface Pending {
  kind: 'image' | 'audio';
  blob: Blob;
  previewUrl: string;
  meta: { duration_s?: number; width?: number; height?: number };
  ext: string;
  mime: string;
}

export default function ChatThread({ coachId, clientId, viewerRole, counterpartName }: ChatThreadProps) {
  const { t } = useI18n();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordCancelledRef = useRef(false);
  const ownedPreviewUrlsRef = useRef(new Set<string>());

  const createPreviewUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    ownedPreviewUrlsRef.current.add(url);
    return url;
  }, []);

  useEffect(() => {
    const referenced = new Set<string>();
    if (pending) referenced.add(pending.previewUrl);
    for (const message of msgs) {
      if (message.localUrl?.startsWith('blob:')) referenced.add(message.localUrl);
    }

    // Let exit animations and media cleanup finish before retiring the old URL.
    const timer = window.setTimeout(() => {
      releaseUnreferencedPreviewUrls(
        ownedPreviewUrlsRef.current,
        referenced,
        URL.revokeObjectURL,
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [msgs, pending]);

  useEffect(() => () => {
    releaseAllPreviewUrls(ownedPreviewUrlsRef.current, URL.revokeObjectURL);
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select(MSG_COLS)
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(200);
    setMsgs((data ?? []) as ChatMessage[]);
    setLoading(false);

    // Mark the other side's messages as read
    const otherRole = viewerRole === 'coach' ? 'client' : 'coach';
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .eq('sender_role', otherRole)
      .is('read_at', null);
  }, [coachId, clientId, viewerRole]);

  useEffect(() => { load(); }, [load]);

  // Live updates with graceful degradation.
  //
  // Realtime websockets can fail for reasons outside our control: Safari
  // throws a synchronous SecurityError when construction is blocked (CSP,
  // proxies, extensions), corporate networks kill wss entirely. None of
  // that may ever crash the page — if realtime is unavailable we silently
  // fall back to polling every 8s, which still feels live in a 1:1 chat.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(async () => {
        const { data } = await supabase
          .from('messages')
          .select(MSG_COLS)
          .eq('coach_id', coachId)
          .eq('client_id', clientId)
          .order('created_at', { ascending: true })
          .limit(200);
        if (data) {
          setMsgs((prev) => {
            const fresh = data as ChatMessage[];
            // Keep optimistic temps that haven't been confirmed yet
            const temps = prev.filter((m) => m.id.startsWith('temp-'));
            return [...fresh, ...temps.filter((tm) => !fresh.some((f) => f.body === tm.body && f.attachment_type === tm.attachment_type))];
          });
        }
      }, 8000);
    };

    try {
      channel = supabase
        .channel(`thread-${coachId}-${clientId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
          (payload) => {
            const m = payload.new as ChatMessage & { coach_id: string };
            if (m.coach_id !== coachId) return;
            setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
        )
        .subscribe((status) => {
          // CHANNEL_ERROR / TIMED_OUT → realtime unusable here, poll instead
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling();
        });
    } catch {
      // WebSocket constructor threw (Safari SecurityError etc.) — poll.
      startPolling();
    }

    return () => {
      if (channel) { try { supabase.removeChannel(channel); } catch { /* already dead */ } }
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [coachId, clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  // ── Photo pick ──────────────────────────────────────────────────────────────
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const { blob, width, height } = await compressImage(file);
      setPending({
        kind: 'image', blob, previewUrl: createPreviewUrl(blob),
        meta: { width, height }, ext: 'jpg', mime: 'image/jpeg',
      });
      setUploadError(null);
    } catch {
      setUploadError(t('chat.attach_failed'));
    }
  };

  // ── Voice note (MediaRecorder) ──────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      recordCancelledRef.current = false;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        setRecording(false);
        setRecordSecs(0);
        if (recordCancelledRef.current) return;
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (blob.size < 200) return; // accidental tap
        const duration_s = Math.round((Date.now() - startedAt) / 1000);
        setPending({
          kind: 'audio', blob, previewUrl: createPreviewUrl(blob),
          meta: { duration_s },
          ext: type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm',
          mime: type.split(';')[0],
        });
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
      navigator.vibrate?.(8);
    } catch {
      setUploadError(t('chat.mic_denied'));
    }
  };

  const stopRecording = (cancel: boolean) => {
    recordCancelledRef.current = cancel;
    recorderRef.current?.stop();
  };
  useEffect(() => () => { try { recorderRef.current?.stop(); } catch { /* unmount */ } }, []);

  // ── Send (text and/or attachment) ───────────────────────────────────────────
  const send = async () => {
    const body = draft.trim();
    if ((!body && !pending) || sending) return;
    setSending(true);
    setDraft('');
    setUploadError(null);
    const att = pending;
    setPending(null);

    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const optimistic: ChatMessage = {
      id: tempId, sender_role: viewerRole, body,
      read_at: null, created_at: new Date().toISOString(),
      attachment_path: att ? 'pending' : null,
      attachment_type: att?.kind ?? null,
      attachment_meta: att?.meta ?? null,
      localUrl: att?.previewUrl,
    };
    setMsgs((prev) => [...prev, optimistic]);

    let attachment_path: string | null = null;
    if (att) {
      const path = `${coachId}/${clientId}/${crypto.randomUUID()}.${att.ext}`;
      const { error: upErr } = await supabase.storage
        .from('chat-attachments')
        .upload(path, att.blob, { contentType: att.mime, upsert: false });
      if (upErr) {
        setMsgs((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(body);
        setPending(att); // let the user retry
        setUploadError(t('chat.attach_failed'));
        setSending(false);
        return;
      }
      attachment_path = path;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        coach_id: coachId, client_id: clientId, sender_role: viewerRole, body,
        attachment_path, attachment_type: att?.kind ?? null, attachment_meta: att?.meta ?? null,
      })
      .select(MSG_COLS)
      .maybeSingle();

    if (error || !data) {
      // Send failed — remove the ghost and restore the draft
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(body);
      if (att) setPending(att);
    } else {
      const persistedUrl = attachment_path ? await signedUrl(attachment_path) : null;
      const real = {
        ...(data as ChatMessage),
        localUrl: persistedUrl ?? att?.previewUrl,
      };
      // Replace temp; realtime may have raced the real row in already
      setMsgs((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === real.id) ? withoutTemp : [...withoutTemp, real];
      });
      navigator.vibrate?.(6);
    }
    setSending(false);
  };

  const canSend = (draft.trim().length > 0 || pending !== null) && !sending && !recording;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {counterpartName && (
        <div className="eye" style={{ marginBottom: 8 }}>{counterpartName}</div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8, minHeight: 0 }}>
        {loading && <div className="ds-sub" style={{ textAlign: 'center', padding: 16 }}>{t('chat.loading')}</div>}
        {!loading && msgs.length === 0 && (
          <div className="ds-sub" style={{ textAlign: 'center', padding: 24 }}>
            {t('chat.empty')}
          </div>
        )}
        {msgs.map((m, i) => {
          const mine = m.sender_role === viewerRole;
          const prev = msgs[i - 1];
          const grouped = prev && prev.sender_role === m.sender_role &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
          const newDay = !prev || dayLabel(prev.created_at, t) !== dayLabel(m.created_at, t);
          const hasImage = m.attachment_type === 'image';
          const hasAudio = m.attachment_type === 'audio';
          return (
            <div key={m.id}>
              {newDay && (
                <div style={{ textAlign: 'center', margin: '12px 0 6px' }}>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t4)',
                    background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)',
                    borderRadius: 10, padding: '3px 10px', letterSpacing: '.06em', textTransform: 'uppercase',
                  }}>
                    {dayLabel(m.created_at, t)}
                  </span>
                </div>
              )}
              <div style={{
                display: 'flex',
                justifyContent: mine ? 'flex-end' : 'flex-start',
                marginTop: grouped && !newDay ? 0 : 10,
              }}>
                <div style={{
                  maxWidth: '78%',
                  padding: hasImage && !m.body ? 4 : '8px 11px',
                  borderRadius: 14,
                  borderTopRightRadius: mine && grouped ? 5 : 14,
                  borderTopLeftRadius: !mine && grouped ? 5 : 14,
                  background: mine ? 'var(--accent-soft, rgba(212,168,83,.14))' : 'rgba(255,255,255,.05)',
                  border: `1px solid ${mine ? 'color-mix(in srgb, var(--accent, #D4A853) 25%, transparent)' : 'var(--line)'}`,
                }}>
                  {hasImage && <ImageBubble m={m} onOpen={setLightbox} />}
                  {hasAudio && <AudioBubble m={m} mine={mine} />}
                  {m.body && (
                    <div style={{ fontSize: 12.5, color: 'var(--t1)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: hasImage || hasAudio ? 6 : 0 }}>
                      {m.body}
                    </div>
                  )}
                  {!grouped && (
                    <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--t4)', marginTop: 3, textAlign: mine ? 'right' : 'left', padding: hasImage && !m.body ? '0 6px 3px' : 0 }}>
                      {timeLabel(m.created_at)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Upload error */}
      {uploadError && (
        <div style={{ fontSize: 11, color: 'var(--err,#E87A6E)', padding: '4px 2px' }}>{uploadError}</div>
      )}

      {/* Pending attachment chip */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              {pending.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pending.previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--accent, #D4A853)' }} />
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  <Mic size={12} />
                  {fmtDuration(pending.meta.duration_s)}
                </span>
              )}
              <span className="ds-sub" style={{ flex: 1, fontSize: 10 }}>
                {pending.kind === 'image' ? t('chat.photo_ready') : t('chat.voice_ready')}
              </span>
              <button
                onClick={() => setPending(null)}
                aria-label={t('chat.remove_attachment')}
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--t3)', lineHeight: 0 }}
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />

        {recording ? (
          /* Recording bar replaces the whole composer row */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
            <motion.span
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--err,#E87A6E)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--t1)', flex: 1 }}>
              {t('chat.recording')} {fmtDuration(recordSecs)}
            </span>
            <button
              onClick={() => stopRecording(true)}
              style={{ background: 'none', border: 'none', color: 'var(--t3)', fontSize: 11, cursor: 'pointer' }}
            >
              {t('general.cancel')}
            </button>
            <button
              onClick={() => stopRecording(false)}
              aria-label={t('chat.stop_recording')}
              style={{
                width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--accent, #D4A853)', color: '#0a0a0a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Square size={13} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              aria-label={t('chat.attach_photo')}
              style={{
                width: 38, height: 38, borderRadius: 12, border: '1px solid var(--line)', flexShrink: 0,
                background: 'rgba(255,255,255,.03)', color: 'var(--t3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end',
              }}
            >
              <Paperclip size={15} />
            </button>
            <button
              onClick={startRecording}
              aria-label={t('chat.record_voice')}
              style={{
                width: 38, height: 38, borderRadius: 12, border: '1px solid var(--line)', flexShrink: 0,
                background: 'rgba(255,255,255,.03)', color: 'var(--t3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end',
              }}
            >
              <Mic size={15} />
            </button>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 96)}px`;
              }}
              onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 250)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={t('chat.placeholder')}
              rows={1}
              style={{
                flex: 1,
                background: 'var(--surface,#141414)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '9px 12px',
                color: 'var(--t1)',
                fontSize: 13,
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={send}
              disabled={!canSend}
              aria-label={t('chat.send')}
              style={{
                width: 38, height: 38, borderRadius: 12, border: 'none',
                background: canSend ? 'var(--accent, #D4A853)' : 'rgba(255,255,255,.06)',
                color: canSend ? '#0a0a0a' : 'var(--t4)',
                cursor: canSend ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, alignSelf: 'flex-end',
              }}
            >
              <Icon name="i-send" size={15} />
            </button>
          </>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.88)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, cursor: 'zoom-out',
            }}
          >
            <motion.img
              initial={{ scale: 0.92 }} animate={{ scale: 1 }}
              src={lightbox}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 14, objectFit: 'contain' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
