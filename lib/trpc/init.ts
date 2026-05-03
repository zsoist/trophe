/**
 * Trophē v0.3 — tRPC initializer (Phase 7).
 *
 * Single source of truth for:
 *   - tRPC instance creation
 *   - Context type
 *   - Middleware (auth guard, role guard)
 *   - Base procedures (publicProcedure, protectedProcedure, coachProcedure)
 *
 * tRPC v11 pattern:
 *   initTRPC.context<Context>().create() → { router, procedure, middleware }
 *   createCallerFactory(appRouter) → for Server Component server-side calls
 */

import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

// ── tRPC instance ──────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  /**
   * Data transformer: plain JSON (no superjson dep).
   * Dates are serialized as ISO strings — callers must re-hydrate if needed.
   * To add superjson: npm install superjson, then transformer: superjson
   */
});

// ── Exports ────────────────────────────────────────────────────────────────

export const router = t.router;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;

// ── Auth middleware ────────────────────────────────────────────────────────

const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const isCoach = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const role = ctx.profile?.role;
  if (role !== 'coach' && role !== 'admin' && role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Coach or admin role required',
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const isAdmin = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const role = ctx.profile?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin role required',
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ── Base procedures ────────────────────────────────────────────────────────

/** No auth required — for public endpoints (health, pricing, demo). */
export const publicProcedure = t.procedure;

/** Auth required — any logged-in user. */
export const protectedProcedure = t.procedure.use(isAuthed);

/** Auth required + coach/admin/super_admin role. */
export const coachProcedure = t.procedure.use(isCoach);

/** Auth required + admin/super_admin role. */
export const adminProcedure = t.procedure.use(isAdmin);
