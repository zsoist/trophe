import type { ReactNode } from 'react';
import FeedbackWidget from '@/components/shared/FeedbackWidget';
import Providers from '@/components/shared/Providers';
import { TRPCProvider } from '@/lib/trpc/provider';

/**
 * Coach-area layout. Passes children through untouched and mounts the beta
 * feedback widget (Daily Nutrafit Step 4) on every coach page, since the beta
 * cohort is professionals. Kept deliberately thin so individual coach pages
 * keep full control of their own layout/scroll.
 *
 * TRPCProvider enables tRPC React hooks on coach surfaces (workout programs +
 * template editing — lib/trpc/routers/workouts.ts).
 */
export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <TRPCProvider>
        {children}
        <FeedbackWidget />
      </TRPCProvider>
    </Providers>
  );
}
