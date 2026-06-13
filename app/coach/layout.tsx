import type { ReactNode } from 'react';
import FeedbackWidget from '@/components/FeedbackWidget';

/**
 * Coach-area layout. Passes children through untouched and mounts the beta
 * feedback widget (Daily Nutrafit Step 4) on every coach page, since the beta
 * cohort is professionals. Kept deliberately thin so individual coach pages
 * keep full control of their own layout/scroll.
 */
export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <FeedbackWidget />
    </>
  );
}
