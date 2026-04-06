'use client';

import { I18nProvider } from '@/lib/i18n';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider defaultLang="en">
      {children}
    </I18nProvider>
  );
}
