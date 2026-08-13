'use client';

/**
 * Coach-side chat thread with one client. Phase 1 coach module.
 * Sidebar context (last check-in, current plan) keeps the coach from
 * tab-switching mid-conversation.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';
import ChatThread from '@/components/shared/ChatThread';

export default function CoachThreadPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [coachId, setCoachId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: me } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!me || !['coach', 'admin', 'super_admin'].includes(me.role)) {
      setAuthError(true);
      return;
    }
    setCoachId(user.id);

    const [profileRes, cpRes, checkinRes] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', clientId).maybeSingle(),
      supabase.from('client_profiles').select('coaching_phase').eq('user_id', clientId).maybeSingle(),
      supabase.from('habit_checkins').select('checked_date').eq('user_id', clientId)
        .order('checked_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setClientName(profileRes.data?.full_name ?? null);
    setPhase(cpRes.data?.coaching_phase ?? null);
    setLastCheckin(checkinRes.data?.checked_date ?? null);
  }, [clientId, router]);

  useEffect(() => { load(); }, [load]);

  if (authError) {
    return (
      <div data-coach-mobile-workspace className="min-h-screen min-w-0 flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
        <div className="ds-sub">Coach access required</div>
      </div>
    );
  }

  return (
    <div data-coach-mobile-workspace className="min-w-0" style={{ background: 'var(--canvas)', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div className="max-w-md lg:max-w-2xl mx-auto min-w-0 px-4 pt-3 w-full" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, paddingBottom: 12 }}>
        {/* Header with client context */}
        <div className="row-b" style={{ marginBottom: 8 }}>
          <button aria-label="Back to inbox" onClick={() => router.back()} className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-secondary)' }}>
            <Icon name="i-chev-l" size={16} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--content-primary)' }}>{clientName ?? '…'}</div>
            <div className="ds-sub" style={{ fontSize: 12 }}>
              {phase ?? ''}{lastCheckin ? ` · last check-in ${lastCheckin}` : ''}
            </div>
          </div>
          <Link href={`/coach/client/${clientId}`} title="Open client profile" aria-label="Open client profile"
            className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{ color: 'var(--action-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="i-user" size={16} />
          </Link>
        </div>

        {coachId && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatThread coachId={coachId} clientId={clientId} viewerRole="coach" />
          </div>
        )}
      </div>
    </div>
  );
}
