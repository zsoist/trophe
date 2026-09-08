'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import GlobalCoach from './GlobalCoach';
import type { CoachContextSlot } from './GlobalCoach';
import { professionalCoachSubject } from './conversation-state';
import type { CoachContextHint } from '@/agents/coach-assistant/contracts';
import { requestReviewedVoiceTurn, requestVoiceTranscript } from './voice-client';

export default function AccountCoach({ professional = false, contextSlot, workspaceHint }: { professional?: boolean; contextSlot?: CoachContextSlot; workspaceHint?: CoachContextHint['workspace'] }) {
  const path = usePathname();
  const subjectId = professional ? professionalCoachSubject(path) : undefined;
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
  return identity ? <GlobalCoach key={`${identity}:${subjectId ?? identity}`} professional={professional} identity={identity} subjectId={subjectId} contextSlot={contextSlot} workspaceHint={workspaceHint}
    voiceTranscriptionTransport={process.env.NEXT_PUBLIC_COACH_VOICE_FIXTURE_ENABLED === '1' ? requestVoiceTranscript : undefined}
    reviewedVoiceTransport={process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? requestReviewedVoiceTurn : undefined} /> : null;
}
