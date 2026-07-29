import { describe, expect, it } from 'vitest';
import { foodLogAddSchema } from '@/lib/trpc/routers/food';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const valid = {
  foodName: 'Late dinner',
  mealType: 'dinner',
  calories: 650,
  proteinG: 40,
  carbsG: 65,
  fatG: 22,
  qtyG: 450,
  qtyInput: 1,
  qtyInputUnit: 'plate',
  loggedDate: '2026-07-10',
};

describe('food.log.add input boundary', () => {
  it('accepts an explicit client-local calendar date', () => {
    expect(foodLogAddSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    [{ mealType: 'brunch' }, 'mealType'],
    [{ qtyG: 0 }, 'qtyG'],
    [{ qtyG: 10001 }, 'qtyG'],
    [{ qtyInput: 0 }, 'qtyInput'],
    [{ qtyInputUnit: 'x'.repeat(51) }, 'qtyInputUnit'],
    [{ loggedDate: '2026-02-30' }, 'loggedDate'],
    [{ loggedDate: '2026-07-10T01:00:00+03:00' }, 'loggedDate'],
  ])('rejects malformed integration input at %s', (patch, field) => {
    expect(foodLogAddSchema.safeParse({ ...valid, ...patch }).success, field).toBe(false);
  });

  it('does not derive a calendar date from server UTC', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/trpc/routers/food.ts'),
      'utf8',
    );
    const block = source.slice(
      source.indexOf('add: protectedProcedure'),
      source.indexOf('// ── Delete a food log entry'),
    );
    expect(block).toContain('.input(foodLogAddSchema)');
    expect(block).toContain('loggedDate: input.loggedDate');
    expect(block).toContain('if (!entry)');
    expect(block).not.toContain('new Date()');
    expect(block).not.toContain('loggedAt');
  });
});
