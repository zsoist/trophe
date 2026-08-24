'use client';

import type { ReactNode } from 'react';
import { BotNav } from '@/components/ui/BotNav';
import { useClientNav } from '@/lib/useClientNav';
import { ClientRouteTransition } from './ClientRouteTransition';
import { ClientShellNavigationProvider } from './ClientShellContext';

export function ClientShell({ children }: { children: ReactNode }) {
  const routes = useClientNav();

  return (
    <div className="client-shell">
      <ClientShellNavigationProvider value>
        <ClientRouteTransition>{children}</ClientRouteTransition>
      </ClientShellNavigationProvider>
      <BotNav routes={routes} className="client-shell__nav" />
    </div>
  );
}
