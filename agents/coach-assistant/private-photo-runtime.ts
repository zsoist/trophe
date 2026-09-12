import type { PhotoFoodService } from './photo-food-actions';

type Environment = Record<string, string | undefined>;

async function privateAttachmentRuntime(env: Environment) {
  const [{ db }, { createPrivateCoachImageStorage }, { createPrivateAttachmentService }] = await Promise.all([
    import('@/db/client'),
    import('./attachments-storage'),
    import('./attachments-service'),
  ]);
  const signingKey = env.COACH_ASSISTANT_ATTACHMENT_SIGNING_KEY ?? '';
  if (!/^[a-f0-9]{64,128}$/.test(signingKey) || signingKey.length % 2 !== 0) {
    throw new Error('invalid_private_attachment_config');
  }
  const storage = createPrivateCoachImageStorage({
    url: env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: env.COACH_ASSISTANT_PRIVATE_ATTACHMENTS_BUCKET ?? '',
    deploymentEnvironment: env.VERCEL_ENV,
  });
  return {
    db,
    storage,
    service: createPrivateAttachmentService(db, storage, Buffer.from(signingKey, 'hex')),
  };
}

export async function createPrivateAttachmentRouteService(env: Environment) {
  return (await privateAttachmentRuntime(env)).service;
}

/** Composes the reviewed private image, observation, provider and shared-ledger
 * ports. It does not create an alternate model or action pipeline. */
export async function createGovernedPrivatePhotoFoodService(env: Environment, actorId: string): Promise<PhotoFoodService> {
  const [{ createDatabasePhotoFoodObservationAdapter }, { createGovernedPhotoFoodService }, { createPilotBudgetStore }, { createSharedPilotBudgetRuntime }, { invokePrivatePhotoFoodProvider }] = await Promise.all([
    import('./photo-food-observation-adapter'),
    import('./governed-photo-food-service'),
    import('@/lib/workout/pilot-budget-service'),
    import('@/lib/workout/shared-pilot-budget'),
    import('./photo-food-provider'),
  ]);
  const runtime = await privateAttachmentRuntime(env);
  const budget = createSharedPilotBudgetRuntime(env, actorId, createPilotBudgetStore(runtime.db, actorId));
  if (!budget.ok) throw new Error('budget_blocked');
  const observations = createDatabasePhotoFoodObservationAdapter(runtime.db, runtime.storage);
  return createGovernedPhotoFoodService({
    database: runtime.db,
    actorId,
    pilotId: budget.pilotId,
    store: budget.store,
    observations,
    invoke: invokePrivatePhotoFoodProvider,
  });
}
