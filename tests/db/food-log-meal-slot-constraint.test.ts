/**
 * Migration 0089 `food_log_meal_slot_check` — SQL NULL-semantics regression.
 *
 * The defect: `meal_type` is nullable, so a bare combination arm
 * (`meal_slot = 'snack_am' AND meal_type = 'snack'`) evaluates to NULL — not
 * FALSE — when `meal_type IS NULL`, and a CHECK constraint is *satisfied* by a
 * NULL result. A present `meal_slot` therefore demanded nothing of `meal_type`,
 * so a row with `meal_slot='breakfast', meal_type=NULL` wrongly passed.
 *
 * No local Postgres is reachable from the sandbox (127.0.0.1:54322 → EPERM),
 * so this test does NOT execute SQL. Instead it reads the CHECK predicate from
 * BOTH sources (the real migration and `db/schema/food.ts`), and evaluates that
 * extracted predicate under a faithful three-valued-logic interpreter — the
 * exact semantics an ADD CONSTRAINT CHECK uses. It is not a text-containment
 * assertion: the pass/fail classification is computed by running the predicate.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Truth = boolean | null;

const and3 = (a: Truth, b: Truth): Truth =>
  a === false || b === false ? false : a === null || b === null ? null : true;
const or3 = (a: Truth, b: Truth): Truth =>
  a === true || b === true ? true : a === null || b === null ? null : false;

/** A CHECK constraint is violated ONLY when it evaluates to FALSE (NULL passes). */
const checkPasses = (result: Truth): boolean => result !== false;

const unquote = (token: string): string => token.slice(1, -1);

function tokenize(sql: string): string[] {
  const stripped = sql.replace(/::\s*text/gi, '');
  const tokens: string[] = [];
  const re = /'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_]*|[()[\],=]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped))) tokens.push(match[0]);
  return tokens;
}

class Predicate {
  private i = 0;
  constructor(
    private readonly tokens: string[],
    private readonly env: Record<string, string | null>,
  ) {}

  private peek(): string | undefined {
    return this.tokens[this.i];
  }
  private next(): string {
    return this.tokens[this.i++]!;
  }
  private expect(token: string): void {
    const got = this.next();
    if (got?.toUpperCase() !== token.toUpperCase()) {
      throw new Error(`expected ${token}, got ${got}`);
    }
  }

  evaluate(): Truth {
    const value = this.parseOr();
    if (this.i !== this.tokens.length) throw new Error('trailing tokens');
    return value;
  }

  private parseOr(): Truth {
    let left = this.parseAnd();
    while (this.peek()?.toUpperCase() === 'OR') {
      this.next();
      left = or3(left, this.parseAnd());
    }
    return left;
  }

  private parseAnd(): Truth {
    let left = this.parseAtom();
    while (this.peek()?.toUpperCase() === 'AND') {
      this.next();
      left = and3(left, this.parseAtom());
    }
    return left;
  }

  private parseAtom(): Truth {
    if (this.peek() === '(') {
      this.next();
      const value = this.parseOr();
      this.expect(')');
      return value;
    }
    return this.parsePredicate();
  }

  private parsePredicate(): Truth {
    const ident = this.next();
    const left = this.env[ident] ?? null;
    const op = this.next();

    if (op.toUpperCase() === 'IS') {
      const negated = this.peek()?.toUpperCase() === 'NOT';
      if (negated) this.next();
      this.expect('NULL');
      return negated ? left !== null : left === null;
    }

    if (op === '=') {
      if (this.peek()?.toUpperCase() === 'ANY') {
        this.next();
        this.expect('(');
        this.expect('ARRAY');
        this.expect('[');
        const list: string[] = [];
        while (this.peek() !== ']') {
          list.push(unquote(this.next()));
          if (this.peek() === ',') this.next();
        }
        this.expect(']');
        this.expect(')');
        return left === null ? null : list.includes(left);
      }
      const rhs = this.next();
      const right = rhs.startsWith("'") ? unquote(rhs) : (this.env[rhs] ?? null);
      return left === null || right === null ? null : left === right;
    }

    throw new Error(`unexpected operator ${op}`);
  }
}

const evaluate = (predicate: string, env: Record<string, string | null>): Truth =>
  new Predicate(tokenize(predicate), env).evaluate();

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** Full CHECK body of `food_log_meal_slot_check` in the migration. */
function migrationPredicate(): string {
  const src = read('drizzle/0089_food_log_meal_slot.sql');
  const checkParen = src.indexOf('CHECK (', src.indexOf('food_log_meal_slot_check'));
  const open = checkParen + 'CHECK '.length;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced CHECK predicate');
}

/** CHECK body of `food_log_meal_slot_check` in the drizzle schema. */
function schemaPredicate(): string {
  const src = read('db/schema/food.ts');
  const sqlStart = src.indexOf('sql`', src.indexOf('food_log_meal_slot_check'));
  const end = src.indexOf('`', sqlStart + 4);
  return src.slice(sqlStart + 4, end);
}

const MIGRATION = migrationPredicate();
const SCHEMA = schemaPredicate();

// The pre-fix predicate (no `meal_type IS NOT NULL` guard) kept for regression
// contrast only — it is NOT what ships.
const LEGACY_BUGGY =
  "meal_slot IS NULL OR (meal_slot = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'pre_workout'::text, 'post_workout'::text]) AND meal_type = meal_slot) OR (meal_slot = ANY (ARRAY['snack_am'::text, 'snack_pm'::text]) AND meal_type = 'snack'::text)";

describe('food_log_meal_slot_check — SQL NULL semantics', () => {
  it('extracts the real predicates from both sources (not hand-typed)', () => {
    expect(MIGRATION).toContain('meal_type IS NOT NULL');
    expect(SCHEMA).toContain('meal_type IS NOT NULL');
    expect(MIGRATION).toContain('snack_am');
    expect(SCHEMA).toContain('snack_am');
  });

  it('the migration and drizzle-schema predicates are token-equivalent', () => {
    expect(tokenize(SCHEMA)).toEqual(tokenize(MIGRATION));
  });

  it('rejects a present meal_slot with a NULL meal_type (the regression)', () => {
    // Pre-fix, this trio PASSED (result NULL) — the actual defect.
    for (const slot of ['breakfast', 'snack_am', 'snack_pm', 'dinner']) {
      expect(checkPasses(evaluate(LEGACY_BUGGY, { meal_slot: slot, meal_type: null }))).toBe(true);
      expect(checkPasses(evaluate(MIGRATION, { meal_slot: slot, meal_type: null }))).toBe(false);
      expect(checkPasses(evaluate(SCHEMA, { meal_slot: slot, meal_type: null }))).toBe(false);
    }
  });

  it('keeps legacy NULL-slot rows valid regardless of meal_type', () => {
    for (const mealType of [null, 'snack', 'lunch', 'dinner']) {
      expect(checkPasses(evaluate(MIGRATION, { meal_slot: null, meal_type: mealType }))).toBe(true);
      expect(checkPasses(evaluate(SCHEMA, { meal_slot: null, meal_type: mealType }))).toBe(true);
    }
  });

  it('classifies every slot/type combination identically in both sources', () => {
    const expected: Array<[string | null, string | null, boolean]> = [
      ['breakfast', 'breakfast', true],
      ['lunch', 'lunch', true],
      ['dinner', 'dinner', true],
      ['snack', 'snack', true],
      ['pre_workout', 'pre_workout', true],
      ['post_workout', 'post_workout', true],
      ['snack_am', 'snack', true],
      ['snack_pm', 'snack', true],
      ['breakfast', 'lunch', false],
      ['dinner', 'snack', false],
      ['snack', 'dinner', false],
      ['snack_am', 'dinner', false],
      ['snack_pm', 'breakfast', false],
      ['bogus', 'snack', false],
      ['bogus', null, false],
    ];
    for (const [slot, type, passes] of expected) {
      const env = { meal_slot: slot, meal_type: type };
      expect(checkPasses(evaluate(MIGRATION, env)), `${slot}/${type}`).toBe(passes);
      expect(checkPasses(evaluate(SCHEMA, env)), `${slot}/${type}`).toBe(passes);
    }
  });

});
