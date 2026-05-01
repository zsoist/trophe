/**
 * Trophē v0.3 — tRPC + React Query provider (Phase 7).
 *
 * Wrap the app (or a subtree) with this provider to enable tRPC hooks.
 * Place it in app/layout.tsx or a specific route group layout.
 *
 * Usage in app/layout.tsx:
 *   import { TRPCProvider } from '@/lib/trpc/provider';
 *   export default function Layout({ children }) {
 *     return <TRPCProvider>{children}</TRPCProvider>;
 *   }
 *
 * React Query v5 note:
 *   staleTime: 30s is a sensible default for coaching data
 *   (not real-time, but fresh enough for dashboard views).
 */

'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from './client';

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'http://localhost:3000';
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: 1,
          },
        },
      }),
  );

  const [trpcClientInstance] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          /**
           * Include credentials so Supabase SSR auth cookies are forwarded.
           * Required for protectedProcedure and coachProcedure to work.
           */
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: 'include',
            });
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
