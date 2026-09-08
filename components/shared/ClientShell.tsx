'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { BotNav } from '@/components/ui/BotNav';
import { useClientNav } from '@/lib/useClientNav';
import { ClientRouteTransition } from './ClientRouteTransition';
import { ClientShellNavigationProvider } from './ClientShellContext';
import { GlobalCoachEntry } from '@/components/assistant/GlobalCoachEntry';

export function ClientShell({ children, coach }: { children: ReactNode; coach?: ReactNode }) {
  const routes = useClientNav();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="client-shell">
      <ClientShellNavigationProvider value>
        <ClientRouteTransition>{children}</ClientRouteTransition>
      </ClientShellNavigationProvider>
      {coach ?? (process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED === '1' && !pathname.startsWith('/dashboard/workout') ? <GlobalCoachEntry /> : null)}
      <BotNav
        routes={routes}
        className="client-shell__nav"
        onActiveRouteSelect={(href) => router.replace(href)}
      />
    </div>
  );
}
