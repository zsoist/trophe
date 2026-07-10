'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/ui';
import { BotNav } from '@/components/ui/BotNav';

interface ClientActivity {
  id: string;
  full_name: string | null;
  last_log_date: string | null;
  last_checkin_date: string | null;
  days_since_log: number;
  initials: string;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff}d ago`;
  return `${Math.round(diff / 7)}w ago`;
}

/* All four tabs point at real routes (were /coach/clients + /coach/profile 404s) */
const COACH_NAV = [
  { href: '/coach',           label: 'Today',    icon: <Icon name="i-grid"     size={18} /> },
  { href: '/coach/inbox',     label: 'Inbox',    icon: <Icon name="i-message"  size={18} /> },
  { href: '/coach/calendar',  label: 'Calendar', icon: <Icon name="i-calendar" size={18} /> },
  { href: '/coach/templates', label: 'Workouts', icon: <Icon name="i-dumbbell" size={18} /> },
];

type InboxFilter = 'all' | 'unread' | 'stale';

export default function CoachInboxPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [clients, setClients] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('all');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    // Verify coach role
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['coach', 'admin', 'super_admin'].includes(profile.role)) {
      router.push('/dashboard'); return;
    }

    // Load assigned clients
    const { data: assigned } = await supabase
      .from('client_profiles')
      .select('user_id')
      .eq('coach_id', user.id);

    if (!assigned || assigned.length === 0) { setLoading(false); return; }

    const clientIds = assigned.map(r => r.user_id);

    const [profilesRes, logsRes, checkinsRes, messagesRes, unreadRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', clientIds),
      supabase.from('food_log')
        .select('user_id, logged_date')
        .in('user_id', clientIds)
        .order('logged_date', { ascending: false }),
      supabase.from('habit_checkins')
        .select('user_id, checked_date')
        .in('user_id', clientIds)
        .order('checked_date', { ascending: false }),
      supabase.from('messages')
        .select('client_id, sender_role, body, read_at, created_at, attachment_type')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500),
      // Unread badges from an UNREAD-ONLY query, not the 500-newest slice —
      // otherwise a few chatty clients push a quiet client's unread messages
      // past position 500 and the coach never sees the badge. Unread backlog
      // is naturally small, so a single high cap is safe.
      supabase.from('messages')
        .select('client_id')
        .eq('coach_id', user.id)
        .eq('sender_role', 'client')
        .is('read_at', null)
        .limit(5000),
    ]);

    const latestLog    = new Map<string, string>();
    const latestCheckin = new Map<string, string>();
    for (const l of (logsRes.data ?? []))    if (!latestLog.has(l.user_id))    latestLog.set(l.user_id, l.logged_date);
    for (const c of (checkinsRes.data ?? [])) if (!latestCheckin.has(c.user_id)) latestCheckin.set(c.user_id, c.checked_date);

    const lastMsg = new Map<string, { body: string; at: string }>();
    // Preview from the 500-newest slice (recency-ordered — truncation here only
    // means a very quiet client shows generic text, which is cosmetic).
    for (const m of (messagesRes.data ?? []) as Array<{ client_id: string; body: string; created_at: string; attachment_type: string | null }>) {
      if (!lastMsg.has(m.client_id)) {
        // Attachment-only messages have empty body — label by kind instead.
        const preview = m.body || (m.attachment_type === 'image' ? '[Photo]' : m.attachment_type === 'audio' ? '[Voice note]' : '');
        lastMsg.set(m.client_id, { body: preview, at: m.created_at });
      }
    }
    // Unread badges from the dedicated unread-only query.
    const unread = new Map<string, number>();
    for (const m of (unreadRes.data ?? []) as Array<{ client_id: string }>) {
      unread.set(m.client_id, (unread.get(m.client_id) ?? 0) + 1);
    }

    const today = new Date().toISOString().split('T')[0];
    const result: ClientActivity[] = (profilesRes.data ?? []).map(p => {
      const lastLog = latestLog.get(p.id) ?? null;
      const daysOff = lastLog
        ? Math.floor((new Date(today).getTime() - new Date(lastLog).getTime()) / 86400000)
        : 999;
      return {
        id: p.id,
        full_name: p.full_name,
        initials: initials(p.full_name),
        last_log_date: lastLog,
        last_checkin_date: latestCheckin.get(p.id) ?? null,
        days_since_log: daysOff,
        unreadCount: unread.get(p.id) ?? 0,
        lastMessage: lastMsg.get(p.id)?.body ?? null,
        lastMessageAt: lastMsg.get(p.id)?.at ?? null,
      };
    });

    // Sort: unread messages first, then most-days-off-plan
    result.sort((a, b) => (b.unreadCount - a.unreadCount) || (b.days_since_log - a.days_since_log));
    setClients(result);
    setLoading(false);
  }, [router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const unread = clients.filter(c => c.days_since_log >= 3).length;

  // Functional filter (the button used to do nothing)
  const visibleClients = clients.filter((c) => {
    if (filter === 'unread') return c.unreadCount > 0;
    if (filter === 'stale') return c.days_since_log >= 3;
    return true;
  });

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--bg,#0a0a0a)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-md lg:max-w-2xl mx-auto px-4 pt-3"
      >
        {/* ── Header ── */}
        <div className="row-b mb-3">
          <div>
            <div className="eye mb-1">Inbox</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--t1)' }}>
              {loading ? '…' : unread > 0 ? `${unread} need attention` : 'All caught up'}
            </div>
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            title={t('coach.inbox.filter')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: filter !== 'all' || showFilters ? 'var(--gold-300,#D4A853)' : 'var(--t3)',
              minWidth: 44, minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="i-filter" size={16} />
          </button>
        </div>

        {/* ── Filter pills ── */}
        {showFilters && (
          <div className="flex gap-2 mb-3">
            {([
              { key: 'all' as InboxFilter, label: t('coach.inbox.all') },
              { key: 'unread' as InboxFilter, label: t('coach.inbox.unread') },
              { key: 'stale' as InboxFilter, label: t('coach.inbox.quiet3d') },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs font-medium px-3 rounded-full border transition-all min-h-[44px] ${
                  filter === f.key
                    ? 'border-[#D4A853]/40 bg-[#D4A853]/10 text-[#D4A853]'
                    : 'border-white/10 text-stone-400 hover:border-white/20 hover:text-stone-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="card shimmer" style={{ height: 64, opacity: 0.4 }} />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="card p-8 text-center">
            <Icon name="i-users" size={32} style={{ color: 'var(--t5)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>No clients assigned yet</div>
          </div>
        ) : visibleClients.length === 0 ? (
          <div className="card p-8 text-center">
            <Icon name="i-filter" size={32} style={{ color: 'var(--t5)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>
              {filter === 'unread' ? t('coach.inbox.noUnread') : t('coach.inbox.nobodyQuiet')}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibleClients.map((c, i) => {
              const urgent = c.days_since_log >= 3;
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link href={`/coach/inbox/${c.id}`} style={{ textDecoration: 'none' }}>
                    <div className={urgent ? 'card' : 'card'}
                      style={{
                        padding: '10px 12px',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        opacity: urgent ? 1 : 0.6,
                        borderLeft: urgent ? '2px solid var(--gold-300,#D4A853)' : '1px solid var(--line)',
                      }}>
                      {/* Avatar with online dot */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div className="av">{c.initials}</div>
                        {c.days_since_log === 0 && (
                          <span className="hs-dot hs-dot-on"
                            style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6 }} />
                        )}
                        {c.days_since_log === 1 && (
                          <span className="hs-dot hs-dot-warn"
                            style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6 }} />
                        )}
                        {c.days_since_log >= 3 && (
                          <span className="hs-dot hs-dot-off"
                            style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6 }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-b" style={{ marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: urgent ? 700 : 600, color: 'var(--t1)' }}>
                            {c.full_name ?? 'Unnamed client'}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--t4)' }}>
                            {relativeTime(c.last_log_date)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: urgent ? 'var(--t2)' : 'var(--t4)', lineHeight: 1.4 }} className="truncate">
                          {c.lastMessage
                            ? `${c.lastMessage.slice(0, 64)}${c.lastMessage.length > 64 ? '…' : ''}`
                            : c.days_since_log === 0 ? 'Logged today'
                            : c.days_since_log === 1 ? 'Last log yesterday'
                            : c.days_since_log === 2 ? '2 days since last log'
                            : c.days_since_log < 999 ? `${c.days_since_log} days off plan — check in`
                            : 'No logs yet'}
                        </div>
                      </div>
                      {c.unreadCount > 0 && (
                        <div style={{
                          minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                          background: 'var(--gold-300,#D4A853)', color: '#0a0a0a',
                          fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, alignSelf: 'center',
                        }}>
                          {c.unreadCount}
                        </div>
                      )}

                    </div>
                  </Link>
                </motion.div>
              );
            })}

            {/* 1:1 messaging is live — tap a client to open the thread */}
          </div>
        )}
      </motion.div>

      <BotNav routes={COACH_NAV} />
    </div>
  );
}
