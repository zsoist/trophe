/**
 * Trophē v0.3 — tRPC App Router handler (Phase 7).
 *
 * Handles all tRPC requests at /api/trpc/*.
 * Uses @trpc/server's fetchRequestHandler — same adapter for
 * Edge, Node, and Vercel runtimes (no platform-specific code).
 *
 * Batching: enabled by default (httpBatchLink in client.ts).
 * Multiple tRPC calls in one React render are batched into a single HTTP request.
 */

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/lib/trpc/router';
import { createContext } from '@/lib/trpc/context';
import type { NextRequest } from 'next/server';

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(`[tRPC] /${path ?? 'unknown'}: ${error.message}`);
          }
        : undefined,
  });

export { handler as GET, handler as POST };
