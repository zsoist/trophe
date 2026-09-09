'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import GlobalCoach, { resetGlobalCoachSession, resetGlobalCoachSessionsForActor } from './GlobalCoach';
import type { CoachContextSlot } from './GlobalCoach';
import { professionalCoachSubject } from './conversation-state';
import type { CoachContextHint } from '@/agents/coach-assistant/contracts';
import { requestReviewedVoiceTurn, requestVoiceTranscript } from './voice-client';

export default function AccountCoach({ professional = false, contextSlot, workspaceHint }: { professional?: boolean; contextSlot?: CoachContextSlot; workspaceHint?: CoachContextHint['workspace'] }) {
  const path = usePathname();
  const subjectId = professional ? professionalCoachSubject(path) : undefined;
  const [identity, setIdentity] = useState<string | null>(null);
  const currentIdentity = useRef<string | null>(null);
  const currentScope = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const publishIdentity = (next: string | null) => {
      const previous = currentIdentity.current;
      if (previous && previous !== next) resetGlobalCoachSessionsForActor(previous);
      currentIdentity.current = next;
      if (alive) setIdentity(next);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      revision++; publishIdentity(session?.user.id ?? null);
    });
    const initialRevision = revision;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (alive && initialRevision === revision) publishIdentity(error ? null : data.user?.id ?? null);
    }).catch(() => { if (alive && initialRevision === revision) publishIdentity(null); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!identity) return;
    const next = `${identity}:${subjectId ?? identity}`;
    if (currentScope.current && currentScope.current !== next) resetGlobalCoachSession(currentScope.current);
    currentScope.current = next;
  }, [identity, subjectId]);
  // The key synchronously discards the old subject's surface and pending response.
  return identity ? <GlobalCoach key={`${identity}:${subjectId ?? identity}`} professional={professional} identity={identity} subjectId={subjectId} contextSlot={contextSlot} workspaceHint={workspaceHint}
    voiceTranscriptionTransport={process.env.NEXT_PUBLIC_COACH_VOICE_FIXTURE_ENABLED === '1' ? requestVoiceTranscript : undefined}
    reviewedVoiceTransport={process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? requestReviewedVoiceTurn : undefined} /> : null;
}
