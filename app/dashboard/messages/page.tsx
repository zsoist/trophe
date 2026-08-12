'use client';

/**
 * Client-side chat with their coach. Phase 1 coach module.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';
import ChatThread from '@/components/shared/ChatThread';

export default function ClientMessagesPage() {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setClientId(user.id);

    const { data: cp } = await supabase
      .from('client_profiles')
      .select('coach_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cp?.coach_id) {
      setCoachId(cp.coach_id);
      const { data: coach } = await supabase
        .from('profiles').select('full_name').eq('id', cp.coach_id).maybeSingle();
      setCoachName(coach?.full_name ?? null);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]" style={{ background: 'var(--canvas)', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-3 w-full" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, paddingBottom: 12 }}>
        <div className="row-b" style={{ marginBottom: 8 }}>
          <button aria-label="Back to dashboard" className="min-h-11 min-w-11 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-secondary)' }}>
            <Icon name="i-chev-l" size={16} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--content-primary)' }}>
            {coachName ? `Coach ${coachName.split(' ')[0]}` : 'Your coach'}
          </div>
          <div style={{ width: 16 }} />
        </div>

        {loading ? (
          <div className="ds-sub" style={{ textAlign: 'center', padding: 24 }}>Loading…</div>
        ) : !coachId ? (
          <div className="card p-8 text-center">
            <Icon name="i-message" size={28} style={{ color: 'var(--content-disabled)', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, color: 'var(--content-secondary)' }}>
              No coach assigned yet. Messaging unlocks once a coach takes you on.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatThread coachId={coachId} clientId={clientId!} viewerRole="client" />
          </div>
        )}
      </div>
    </div>
  );
}
