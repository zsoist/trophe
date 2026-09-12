import type { NextRequest } from 'next/server';
import { handleCoachRequest } from '@/agents/coach-assistant/handler';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';

export const runtime = 'nodejs';
// One governed photo observation plus one Luna response share this existing
// route. The application deadline remains lower and owns cancellation.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  return handleCoachRequest(request, {
    env: process.env,
    createIsolatedEngine: async () => {
      const { createIsolatedCoachEngineBinding } = await import('@/agents/coach-assistant/isolated-engine');
      return createIsolatedCoachEngineBinding(process.env);
    },
    createGovernedEngine: async (actorId: string) => {
      const [{ db }, { invokeStructuredProvider }, { createPilotBudgetStore }, { createGovernedCoachEngineBinding }] = await Promise.all([
        import('@/db/client'),
        import('@/agents/runtime/providers/structured'),
        import('@/lib/workout/pilot-budget-service'),
        import('@/agents/coach-assistant/governed-engine'),
      ]);
      return createGovernedCoachEngineBinding({
        env: process.env,
        actorId,
        persistentStore: createPilotBudgetStore(db, actorId),
        transport: invokeStructuredProvider,
      });
    },
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
    createMemoryService: async () => {
      const { db } = await import('@/db/client');
      const { createPersistentMemoryService } = await import('@/agents/coach-assistant/memory-service');
      return createPersistentMemoryService(db);
    },
    createChatService: async () => {
      const { db } = await import('@/db/client');
      const { createCoachChatService } = await import('@/agents/coach-assistant/chat-service');
      const { createCoachChatCleanup } = await import('@/agents/coach-assistant/chat-cleanup');
      const attachments = process.env.COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED === '1'
        ? await import('@/agents/coach-assistant/private-photo-runtime').then(module => module.createPrivateAttachmentRouteService(process.env))
        : undefined;
      return createCoachChatService(db, createCoachChatCleanup(db, attachments));
    },
    ...(process.env.COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED === '1' ? { createAttachmentService: async () => {
      const { createPrivateAttachmentRouteService } = await import('@/agents/coach-assistant/private-photo-runtime');
      return createPrivateAttachmentRouteService(process.env);
    } } : {}),
    createFoodPreferenceService: async () => {
      const { db } = await import('@/db/client');
      const { createFoodPreferenceService } = await import('@/agents/coach-assistant/food-preference-service');
      return createFoodPreferenceService(db);
    },
    createFoodService: async () => {
      const { db } = await import('@/db/client');
      const { createFoodQuantityService } = await import('@/agents/coach-assistant/food-service');
      return createFoodQuantityService(db);
    },
    createPhotoFoodService: async (operation:unknown, actorId:string) => {
      if (process.env.COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED === '1') {
        const { createGovernedPrivatePhotoFoodService } = await import('@/agents/coach-assistant/private-photo-runtime');
        return createGovernedPrivatePhotoFoodService(process.env, actorId);
      }
      const { db } = await import('@/db/client');
      const { createIsolatedPhotoFoodRouteService } = await import('@/agents/coach-assistant/isolated-photo-food-route');
      return createIsolatedPhotoFoodRouteService(process.env,db,operation);
    },
    createProgressService: async () => {
      const { db } = await import('@/db/client');
      const { createProgressService } = await import('@/agents/coach-assistant/progress-service');
      return createProgressService(db);
    },
    createWorkoutSetService: async () => {
      const { db } = await import('@/db/client');
      const { createWorkoutSetService } = await import('@/agents/coach-assistant/set-service');
      return createWorkoutSetService(db);
    },
    ...(process.env.COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED === '1' ? { createMessageService: async () => {
      const { db } = await import('@/db/client');
      const { consumeRateLimit } = await import('@/lib/security/durable-rate-limit');
      const { createCoachMessageService } = await import('@/agents/coach-assistant/message-service');
      return createCoachMessageService(db, consumeRateLimit);
    }} : {}),
    createRepository: async () => {
      const { pool } = await import('@/db/client');
      return createServerRepository(pool);
    },
  });
}

/** Binary uploads share the exact private authentication/allowlist boundary. */
export const PUT = POST;
