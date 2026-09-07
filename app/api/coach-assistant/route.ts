import type { NextRequest } from 'next/server';
import { handleCoachRequest } from '@/agents/coach-assistant/handler';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleCoachRequest(request, {
    env: process.env,
    guard: async () => {
      const { guardAiRoute } = await import('@/lib/security/api-guard');
      const guard = await guardAiRoute(request);
      return guard.ok ? { userId: guard.userId } : guard.response;
    },
    createDurableService: async () => {
      const { db } = await import('@/db/client');
      const { createDurablePreferenceService } = await import('@/lib/workout/durable-preference-actions');
      return createDurablePreferenceService(db);
    },
    createRepository: async () => {
      const { pool } = await import('@/db/client');
      return createServerRepository(pool);
    },
  });
}

/** Binary uploads share the exact private authentication/allowlist boundary. */
export const PUT = POST;
