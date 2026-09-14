import type { db } from '@/db/client';
import { ASK_TROPHE_SHARED_PILOT_ID } from '@/lib/workout/shared-pilot-budget';
import type { PilotBudgetStore } from './pilot-budget';
import { runGovernedPilotModality } from './governed-modality';
import { createPhotoFoodService } from './photo-food-service';
import type { PhotoFoodService } from './photo-food-actions';
import type { createDatabasePhotoFoodObservationAdapter, runVerifiedPhotoFoodAnalysis } from './photo-food-observation-adapter';

type ObservationAdapter = ReturnType<typeof createDatabasePhotoFoodObservationAdapter>;
type PhotoInvoke = Parameters<typeof runVerifiedPhotoFoodAnalysis>[2]['invoke'];

/** Adds analysis only to a missing-observation read. Existing observations and
 * every proposal/apply/receipt continue through the ordinary durable service. */
export function createGovernedPhotoFoodService(input: {
  database: typeof db;
  actorId: string;
  store: PilotBudgetStore;
  observations: ObservationAdapter;
  invoke: PhotoInvoke;
  pilotId?: string;
  service?: PhotoFoodService;
  govern?: typeof runGovernedPilotModality;
}): PhotoFoodService {
  const service = input.service ?? createPhotoFoodService(input.database, input.observations);
  return { async execute(scope) {
    const first = await service.execute(scope);
    if (first.ok || scope.operation.operation !== 'photo.food.read' || first.error !== 'not_connected') return first;
    if (scope.actorId !== input.actorId || scope.subjectId !== input.actorId) return first;
    const operation = scope.operation;
    await (input.govern ?? runGovernedPilotModality)({
      pilotId: input.pilotId ?? ASK_TROPHE_SHARED_PILOT_ID,
      actorId: input.actorId,
      turnId: operation.turnId,
      identityParts: [input.pilotId ?? ASK_TROPHE_SHARED_PILOT_ID, input.actorId, scope.organizationId, operation.conversationId, operation.turnId, operation.attachmentId],
      task: 'photo_analyze',
      store: input.store,
      signal: scope.signal,
      run: async pilotBinding => (await input.observations.analyzeAndRecord({
        actorId: scope.actorId,
        subjectId: scope.subjectId,
        organizationId: scope.organizationId,
        conversationId: operation.conversationId,
        attachmentId: operation.attachmentId,
      }, { pilotBinding, invoke: input.invoke }, scope.signal)).result,
    });
    return service.execute(scope);
  } };
}
