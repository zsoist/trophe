import type { NextRequest } from 'next/server';
import { guardAiRoute } from '@/lib/security/api-guard';
import { pool } from '@/db/client';
import { handleCoachRequest } from '@/agents/coach-assistant/handler';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleCoachRequest(request, {
    env: process.env,
    guard: async () => {
      const guard = await guardAiRoute(request);
      return guard.ok ? { userId: guard.userId } : guard.response;
    },
    createRepository: () => createServerRepository(pool),
  });
}
