'use client';

/**
 * Client-side chat with their coach. Phase 1 coach module.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';
import ChatThread from '@/components/shared/ChatThread';
import CoachConversationHeader from '@/components/messages/CoachConversationHeader';

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
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const response = await fetch('/api/client/message', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (response.ok) {
          const identity = await response.json() as { coachName?: string | null };
          setCoachName(identity.coachName ?? null);
        }
      }
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="client-chat-page">
      <div className="client-chat-page__inner">
        <CoachConversationHeader coachName={coachName} onBack={() => router.back()} />

        {loading ? (
          <div role="status" data-loading-state className="ds-sub" style={{ textAlign: 'center', padding: 24 }}>Loading…</div>
        ) : !coachId ? (
          <div className="card p-8 text-center">
            <Icon name="i-message" size={28} style={{ color: 'var(--content-disabled)', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, color: 'var(--content-secondary)' }}>
              No coach assigned yet. Messaging unlocks once a coach takes you on.
            </div>
          </div>
        ) : (
          <div className="client-chat-page__thread">
            <ChatThread coachId={coachId} clientId={clientId!} viewerRole="client" />
          </div>
        )}
      </div>
    </div>
  );
}
