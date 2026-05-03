/**
 * Trophē v0.3 — tRPC client (Phase 7).
 *
 * Two exports:
 *
 * 1. `trpc` — tRPC React hooks (use in Client Components with TRPCProvider).
 *    Usage: const { data } = trpc.clients.list.useQuery({ limit: 50 });
 *
 * 2. `trpcClient` — vanilla tRPC client for use outside React (scripts, etc.)
 *    Usage: const result = await trpcClient.food.log.list.query({ date: '2026-05-01' });
 *
 * Setup:
 *   Wrap your app in TRPCProvider (see lib/trpc/provider.tsx).
 *   The provider must be inside a QueryClientProvider.
 *
 * tRPC v11 + React Query v5 notes:
 *   - useSuspenseQuery replaces useQuery in React 19 Suspense boundaries
 *   - mutations: trpc.coach.notes.create.useMutation()
 */

import { createTRPCReact } from '@trpc/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './router';

// ── tRPC React hooks (for Client Components) ──────────────────────────────

export const trpc = createTRPCReact<AppRouter>();

// ── Vanilla client (for non-React usage) ─────────────────────────────────

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return ''; // browser: use relative URL
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
    }),
  ],
});
