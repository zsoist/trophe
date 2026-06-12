'use client';

/**
 * Shared coach<->client chat thread with Supabase Realtime.
 * Phase 1 of coach module (Michael Kavdas call, 2026-06-12).
 *
 * Consecutive messages from the same sender are visually grouped —
 * the "48 unread messages from one client" problem reads as one block.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';

export interface ChatMessage {
  id: string;
  sender_role: 'coach' | 'client';
  body: string;
  read_at: string | null;
  created_at: string;
}

interface ChatThreadProps {
  coachId: string;
  clientId: string;
  /** Which side the current viewer is on. */
  viewerRole: 'coach' | 'client';
  /** Display name of the other party (header omitted if not given). */
  counterpartName?: string | null;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatThread({ coachId, clientId, viewerRole, counterpartName }: ChatThreadProps) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_role, body, read_at, created_at')
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

  // Realtime: append new messages in this thread live
  useEffect(() => {
    const channel = supabase
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [coachId, clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    const { data } = await supabase
      .from('messages')
      .insert({ coach_id: coachId, client_id: clientId, sender_role: viewerRole, body })
      .select('id, sender_role, body, read_at, created_at')
      .maybeSingle();
    if (data) setMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as ChatMessage]));
    setSending(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {counterpartName && (
        <div className="eye" style={{ marginBottom: 8 }}>{counterpartName}</div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8, minHeight: 0 }}>
        {loading && <div className="ds-sub" style={{ textAlign: 'center', padding: 16 }}>Loading…</div>}
        {!loading && msgs.length === 0 && (
          <div className="ds-sub" style={{ textAlign: 'center', padding: 24 }}>
            No messages yet — say hi 👋
          </div>
        )}
        {msgs.map((m, i) => {
          const mine = m.sender_role === viewerRole;
          const prev = msgs[i - 1];
          const grouped = prev && prev.sender_role === m.sender_role &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
          return (
            <div key={m.id} style={{
              display: 'flex',
              justifyContent: mine ? 'flex-end' : 'flex-start',
              marginTop: grouped ? 0 : 10,
            }}>
              <div style={{
                maxWidth: '78%',
                padding: '8px 11px',
                borderRadius: 14,
                borderTopRightRadius: mine && grouped ? 5 : 14,
                borderTopLeftRadius: !mine && grouped ? 5 : 14,
                background: mine ? 'rgba(212,168,83,.14)' : 'rgba(255,255,255,.05)',
                border: `1px solid ${mine ? 'rgba(212,168,83,.25)' : 'var(--line)'}`,
              }}>
                <div style={{ fontSize: 12.5, color: 'var(--t1)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {m.body}
                </div>
                {!grouped && (
                  <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--t4)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                    {timeLabel(m.created_at)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Message…"
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
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          style={{
            width: 38, height: 38, borderRadius: 12, border: 'none',
            background: draft.trim() ? 'var(--gold-300,#D4A853)' : 'rgba(255,255,255,.06)',
            color: draft.trim() ? '#0a0a0a' : 'var(--t4)',
            cursor: draft.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, alignSelf: 'flex-end',
          }}
        >
          <Icon name="i-send" size={15} />
        </button>
      </div>
    </div>
  );
}
