'use client';

import { useEffect } from 'react';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/Toast';
import { ThemeModeProvider } from '@/components/ThemeMode';
import ErrorBoundary from '@/components/ErrorBoundary';
import { supabase } from '@/lib/supabase';
import type { ReactNode } from 'react';

/**
 * Refresh Supabase session when app returns from background (mobile).
 * Without this, mobile users who background the app for 10+ minutes
 * get stale sessions → failed API calls → "doesn't work" UX.
 */
function useSessionRefreshOnFocus() {
  useEffect(() => {
    let lastHidden = 0;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHidden = Date.now();
      } else if (document.visibilityState === 'visible' && lastHidden > 0) {
        const elapsed = Date.now() - lastHidden;
        // Only refresh if backgrounded for >2 minutes (avoid spurious refreshes)
        if (elapsed > 2 * 60 * 1000) {
          supabase.auth.getUser().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}

export default function Providers({ children }: { children: ReactNode }) {
  useSessionRefreshOnFocus();

  return (
    <ThemeModeProvider>
      <I18nProvider defaultLang="en">
        <ErrorBoundary>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ErrorBoundary>
      </I18nProvider>
    </ThemeModeProvider>
  );
}
