'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BotNav } from '@/components/ui/BotNav';
import { useClientNav } from '@/lib/useClientNav';
import { ClientRouteTransition } from './ClientRouteTransition';
import { ClientShellNavigationProvider } from './ClientShellContext';

export function ClientShell({ children }: { children: ReactNode }) {
  const routes = useClientNav();
  const router = useRouter();

  return (
    <div className="client-shell">
      <ClientShellNavigationProvider value>
        <ClientRouteTransition>{children}</ClientRouteTransition>
      </ClientShellNavigationProvider>
      <BotNav
        routes={routes}
        className="client-shell__nav"
        onActiveRouteSelect={(href) => router.replace(href)}
      />
    </div>
  );
}
