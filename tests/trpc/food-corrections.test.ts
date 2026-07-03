/**
 * Trophē — correction-flywheel router tests (migration 0035).
 *
 * Exercises food.corrections.captureAdjustment, food.log.edit and
 * food.log.coachEdit via createCallerFactory with a stubbed ctx.db —
 * no real database or external creds needed (pattern: tests/auth/role-gate).
 *
 * Coverage:
 *   1. captureAdjustment — UNAUTHORIZED without a session
 *   2. captureAdjustment — zod-rejects bad foodLogId uuid
 *   3. captureAdjustment — zod-rejects absurd values (kcal > 10000, negatives)
 *   4. captureAdjustment — maps input → 0035 columns, returns { ok: true }
 *   5. captureAdjustment — silent success ({ ok: false }, no throw) on DB error
 *   6. isAiSourced gate — parse_confidence OR legacy natural_language/photo_ai
 *   7. macrosMateriallyChanged gate — >5% (or >1 abs) on any core macro
 *   8. log.edit — captures a correction for LEGACY AI rows (confidence null,
 *      source natural_language) with ai_source falling back to row source
 *   9. log.edit — does NOT capture non-AI rows; recomputes macros from
 *      quantity / grams factors
 *  10. log.coachEdit — role guard (client FORBIDDEN) + tenant check FORBIDDEN
 */

import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../lib/trpc/init';
import { appRouter } from '../../lib/trpc/router';
import { isAiSourced, macrosMateriallyChanged } from '../../lib/trpc/routers/food';
import type { Context } from '../../lib/trpc/context';
import type { UserRole } from '../../lib/auth/get-session';

const createCaller = createCallerFactory(appRouter);

// ── Fixtures ───────────────────────────────────────────────────────────────

const USER_ID = '00000000-0000-4000-8001-000000000001';
const COACH_ID = '00000000-0000-4000-8002-000000000002';
const ENTRY_ID = '00000000-0000-4000-8003-000000000003';
const CLIENT_ID = '00000000-0000-4000-8004-000000000004';

type Row = Record<string, unknown>;

/** Stubbed Drizzle db: select→[existing], update merges set(), insert records values(). */
function makeStubDb(opts: { selectRows?: Row[]; insertThrows?: boolean } = {}) {
  const inserted: Row[] = [];
  const updates: Row[] = [];
  const selectRows = opts.selectRows ?? [];
  const stub = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => selectRows }),
      }),
    }),
    update: () => ({
      set: (v: Row) => {
        updates.push(v);
        return {
          where: () => ({ returning: async () => [{ ...selectRows[0], ...v }] }),
        };
      },
    }),
    insert: () => ({
      values: async (v: Row) => {
        if (opts.insertThrows) throw new Error('stub insert failure');
        inserted.push(v);
      },
    }),
  };
  return { db: stub as unknown as Context['db'], inserted, updates };
}

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    user: null,
    profile: null,
    db: makeStubDb().db,
    headers: new Headers(),
    ...overrides,
  };
}

function authedCtx(id: string, role: UserRole, db?: Context['db']): Context {
  return makeCtx({
    user: {
      id,
      email: `${role}@test.local`,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as Context['user'],
    profile: { id, role, fullName: `Test ${role}`, email: `${role}@test.local` },
    ...(db ? { db } : {}),
  });
}

/** A food_log row as Drizzle $inferSelect (camelCase). */
function foodLogRow(overrides: Row = {}): Row {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    loggedDate: '2026-07-01',
    mealType: 'lunch',
    foodName: 'grilled chicken with rice',
    quantity: 1,
    unit: 'serving',
    calories: 100,
    proteinG: 10,
    carbsG: 20,
    fatG: 5,
    fiberG: 2,
    sugarG: 1,
    source: null,
    sourceId: null,
    photoUrl: null,
    foodId: null,
    qtyG: null,
    qtyInput: null,
    qtyInputUnit: null,
    conversionId: null,
    parseConfidence: null,
    llmRecognized: null,
    createdAt: '2026-07-01T12:00:00Z',
    ...overrides,
  };
}

const validAdjustment = {
  rawText: '2 souvlakia me pita',
  foodName: 'Pork souvlaki with pita',
  aiSource: 'natural_language',
  parseConfidence: 0.82,
  foodLogId: ENTRY_ID,
  before: { grams: 250, calories: 520, protein_g: 32, carbs_g: 45, fat_g: 22 },
  after: { grams: 300, calories: 610, protein_g: 38, carbs_g: 52, fat_g: 26 },
};

// ── 1–5. corrections.captureAdjustment ─────────────────────────────────────

describe('food.corrections.captureAdjustment', () => {
  it('throws UNAUTHORIZED without a session', async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.food.corrections.captureAdjustment(validAdjustment),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('zod-rejects a bad foodLogId uuid', async () => {
    const caller = createCaller(authedCtx(USER_ID, 'client'));
    await expect(
      caller.food.corrections.captureAdjustment({
        ...validAdjustment,
        foodLogId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('zod-rejects absurd calories (> 10000)', async () => {
    const caller = createCaller(authedCtx(USER_ID, 'client'));
    await expect(
      caller.food.corrections.captureAdjustment({
        ...validAdjustment,
        after: { ...validAdjustment.after, calories: 999999 },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('zod-rejects negative macros and empty rawText', async () => {
    const caller = createCaller(authedCtx(USER_ID, 'client'));
    await expect(
      caller.food.corrections.captureAdjustment({
        ...validAdjustment,
        before: { ...validAdjustment.before, protein_g: -5 },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.food.corrections.captureAdjustment({ ...validAdjustment, rawText: '' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('maps a valid payload onto 0035 columns and returns { ok: true }', async () => {
    const { db, inserted } = makeStubDb();
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    const result = await caller.food.corrections.captureAdjustment(validAdjustment);

    expect(result).toEqual({ ok: true });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      userId: USER_ID,
      correctedBy: USER_ID,
      foodLogId: ENTRY_ID,
      inputText: '2 souvlakia me pita',
      qtyInput: '250',
      qtyInputUnit: 'g',
      aiSource: 'natural_language',
      aiConfidence: 0.82,
      aiCalories: 520,
      aiProteinG: 32,
      aiCarbsG: 45,
      aiFatG: 22,
      correctedCalories: 610,
      correctedProteinG: 38,
      correctedCarbsG: 52,
      correctedFatG: 26,
    });
  });

  it('clamps values to numeric(8,2)-safe precision', async () => {
    const { db, inserted } = makeStubDb();
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await caller.food.corrections.captureAdjustment({
      ...validAdjustment,
      before: { ...validAdjustment.before, calories: 123.456789 },
    });
    expect(inserted[0].aiCalories).toBe(123.46);
  });

  it('silent success: returns { ok: false } (never throws) on DB failure', async () => {
    const { db } = makeStubDb({ insertThrows: true });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await expect(
      caller.food.corrections.captureAdjustment(validAdjustment),
    ).resolves.toEqual({ ok: false });
  });
});

// ── 6. isAiSourced gate ────────────────────────────────────────────────────

describe('isAiSourced (capture gate)', () => {
  it('true when parse_confidence is set (modern rows)', () => {
    expect(isAiSourced({ parseConfidence: 0.9, source: null })).toBe(true);
  });

  it('true for LEGACY AI rows lacking confidence (source fallback)', () => {
    expect(isAiSourced({ parseConfidence: null, source: 'natural_language' })).toBe(true);
    expect(isAiSourced({ parseConfidence: null, source: 'photo_ai' })).toBe(true);
  });

  it('false for human-sourced rows', () => {
    expect(isAiSourced({ parseConfidence: null, source: 'usda' })).toBe(false);
    expect(isAiSourced({ parseConfidence: null, source: 'custom' })).toBe(false);
    expect(isAiSourced({ parseConfidence: null, source: null })).toBe(false);
  });
});

// ── 7. macrosMateriallyChanged gate ────────────────────────────────────────

describe('macrosMateriallyChanged (capture gate)', () => {
  const base = { calories: 100, proteinG: 10, carbsG: 20, fatG: 5 };

  it('true when any macro changes >5%', () => {
    expect(macrosMateriallyChanged(base, { ...base, calories: 110 })).toBe(true);
    expect(macrosMateriallyChanged(base, { ...base, proteinG: 12 })).toBe(true);
  });

  it('false for rounding jitter (≤5% and ≤1 absolute)', () => {
    expect(macrosMateriallyChanged(base, { ...base, calories: 101 })).toBe(false);
    expect(macrosMateriallyChanged(base, { ...base, fatG: 5.2 })).toBe(false);
    expect(macrosMateriallyChanged(base, base)).toBe(false);
  });
});

// ── 8–9. log.edit — flywheel capture end-to-end (stubbed db) ───────────────

describe('food.log.edit (capture-gate integration)', () => {
  it('captures a correction for a LEGACY AI row (confidence null, source natural_language)', async () => {
    const existing = foodLogRow({ source: 'natural_language', parseConfidence: null });
    const { db, inserted } = makeStubDb({ selectRows: [existing] });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await caller.food.log.edit({ entryId: ENTRY_ID, calories: 300 });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      userId: USER_ID,
      correctedBy: USER_ID,
      foodLogId: ENTRY_ID,
      inputText: 'grilled chicken with rice',
      aiSource: 'natural_language', // ai_source falls back to the row's source
      aiConfidence: null,
      aiCalories: 100,
      correctedCalories: 300,
    });
  });

  it('does NOT capture for non-AI rows (source custom, no confidence)', async () => {
    const existing = foodLogRow({ source: 'custom', parseConfidence: null });
    const { db, inserted } = makeStubDb({ selectRows: [existing] });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await caller.food.log.edit({ entryId: ENTRY_ID, calories: 300 });
    expect(inserted).toHaveLength(0);
  });

  it('does NOT capture when the change is immaterial (<5%)', async () => {
    const existing = foodLogRow({ source: 'photo_ai', parseConfidence: 0.7 });
    const { db, inserted } = makeStubDb({ selectRows: [existing] });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await caller.food.log.edit({ entryId: ENTRY_ID, calories: 101 });
    expect(inserted).toHaveLength(0);
  });

  it('recomputes macros from a quantity factor (legacy quick path)', async () => {
    const existing = foodLogRow({ source: 'photo_ai', parseConfidence: 0.7 });
    const { db, updates, inserted } = makeStubDb({ selectRows: [existing] });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await caller.food.log.edit({ entryId: ENTRY_ID, quantity: 2 });

    expect(updates[0]).toMatchObject({
      quantity: 2,
      calories: 200,
      proteinG: 20,
      carbsG: 40,
      fatG: 10,
      fiberG: 4,
      sugarG: 2,
    });
    // 100 → 200 kcal is material on an AI row → captured
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ aiCalories: 100, correctedCalories: 200 });
  });

  it('recomputes macros from a grams ratio when the row has qty_g', async () => {
    const existing = foodLogRow({ source: 'natural_language', qtyG: '100.00' });
    const { db, updates } = makeStubDb({ selectRows: [existing] });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await caller.food.log.edit({ entryId: ENTRY_ID, grams: 150 });

    expect(updates[0]).toMatchObject({ qtyG: '150', calories: 150, proteinG: 15 });
  });

  it('explicit macro values win over derivation, per-field', async () => {
    const existing = foodLogRow({ source: 'natural_language', qtyG: '100.00' });
    const { db, updates } = makeStubDb({ selectRows: [existing] });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));

    await caller.food.log.edit({ entryId: ENTRY_ID, grams: 150, proteinG: 99 });

    expect(updates[0]).toMatchObject({ calories: 150, proteinG: 99 });
  });

  it('throws NOT_FOUND when the entry is not the caller’s', async () => {
    const { db } = makeStubDb({ selectRows: [] });
    const caller = createCaller(authedCtx(USER_ID, 'client', db));
    await expect(
      caller.food.log.edit({ entryId: ENTRY_ID, calories: 300 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('zod-rejects a non-positive quantity', async () => {
    const caller = createCaller(authedCtx(USER_ID, 'client'));
    await expect(
      caller.food.log.edit({ entryId: ENTRY_ID, quantity: 0 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ── 10. log.coachEdit guards ───────────────────────────────────────────────

describe('food.log.coachEdit', () => {
  it('throws FORBIDDEN for client role (coachProcedure guard)', async () => {
    const caller = createCaller(authedCtx(USER_ID, 'client'));
    await expect(
      caller.food.log.coachEdit({ clientId: CLIENT_ID, entryId: ENTRY_ID, calories: 300 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN when the coach has no access to the client (tenant check)', async () => {
    // Stub select returns no client_profiles row → assertCanAccessClient throws.
    const { db } = makeStubDb({ selectRows: [] });
    const caller = createCaller(authedCtx(COACH_ID, 'coach', db));
    await expect(
      caller.food.log.coachEdit({ clientId: CLIENT_ID, entryId: ENTRY_ID, calories: 300 }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Client not accessible for this role or organization',
    });
  });

  it('zod-rejects a bad clientId uuid', async () => {
    const caller = createCaller(authedCtx(COACH_ID, 'coach'));
    await expect(
      caller.food.log.coachEdit({ clientId: 'nope', entryId: ENTRY_ID, calories: 300 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
