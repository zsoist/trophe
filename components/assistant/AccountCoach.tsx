'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import GlobalCoach from './GlobalCoach';

export default function AccountCoach() {
  const [identity, setIdentity] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      revision++; if (alive) setIdentity(session?.user.id ?? null);
    });
    const initialRevision = revision;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (alive && initialRevision === revision) setIdentity(error ? null : data.user?.id ?? null);
    }).catch(() => { if (alive && initialRevision === revision) setIdentity(null); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  // The key synchronously discards the old subject's surface and pending response.
  return identity ? <GlobalCoach key={identity} identity={identity} /> : null;
}
