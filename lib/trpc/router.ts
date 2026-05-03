/**
 * Trophē v0.3 — tRPC root AppRouter (Phase 7).
 *
 * Combines all sub-routers into the single AppRouter.
 * The AppRouter type is the source of truth for client inference.
 *
 * Import AppRouter in the tRPC client (lib/trpc/client.ts) to get
 * end-to-end type safety from DB → procedure → React hook.
 */

import { router } from './init';
import { clientsRouter } from './routers/clients';
import { coachRouter } from './routers/coach';
import { foodRouter } from './routers/food';
import { memoryRouter } from './routers/memory';

export const appRouter = router({
  clients: clientsRouter,
  coach: coachRouter,
  food: foodRouter,
  memory: memoryRouter,
});

/** AppRouter type — import in client.ts and anywhere you need types. */
export type AppRouter = typeof appRouter;
