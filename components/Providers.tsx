'use client';

import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/Toast';
import { ThemeModeProvider } from '@/components/ThemeMode';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
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
