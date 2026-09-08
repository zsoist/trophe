import type { NextRequest } from 'next/server';
import { handleCoachRequest } from '@/agents/coach-assistant/handler';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleCoachRequest(request, {
    env: process.env,
    createIsolatedEngine: async () => {
      const { createIsolatedCoachEngineBinding } = await import('@/agents/coach-assistant/isolated-engine');
      return createIsolatedCoachEngineBinding(process.env);
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
      return createCoachChatService(db, createCoachChatCleanup(db));
    },
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
    ...(process.env.COACH_ASSISTANT_ISOLATED_PHOTO_FOOD_ENABLED === '1' ? { createPhotoFoodService: async (operation:unknown) => {
      const { db } = await import('@/db/client');
      const { createIsolatedPhotoFoodRouteService } = await import('@/agents/coach-assistant/isolated-photo-food-route');
      return createIsolatedPhotoFoodRouteService(process.env,db,operation);
    }} : {}),
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
