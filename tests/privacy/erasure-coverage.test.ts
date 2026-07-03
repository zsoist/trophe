import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { PRE_ERASURE_STEPS, CASCADE_COVERED, COACH_SCOPE_ONLY } from '@/lib/privacy/erasure';

/**
 * WP5 guard: every user-reference column in the Drizzle schema must be
 * CLASSIFIED for erasure — handled by a pre-erasure step, covered by the
 * profiles cascade (CASCADE / SET NULL), coach-scope-only, or explicitly
 * retained below with a reason. Adding a new user-data table without deciding
 * its erasure behaviour REDS CI here. (This mirrors the live FK rules verified
 * against prod information_schema on 2026-07-03.)
 */

// Column names that carry a user identity.
const USER_COLUMNS = new Set([
  'user_id', 'client_id', 'coach_id', 'actor_id', 'sender_id', 'created_by',
  'processed_by', 'corrected_by', 'assigned_by', 'invited_by', 'owner_id',
  'verified_by', 'uploaded_by', 'author_id', 'recipient_id',
]);

// Tables whose "user" columns do NOT reference people (or reference them in a
// non-personal way) — each entry needs a reason.
const RETAINED: Array<{ table: string; column: string; reason: string }> = [
  // foods.verified is a boolean, not a user; no user columns — nothing here yet.
];

// Tables that hold no personal data even though a column name matches
// (e.g. knowledge_chunks are keyed by document, not user).
const NON_PERSONAL_TABLES = new Set<string>([]);

function collectSchemaUserColumns(): Array<{ table: string; column: string }> {
  const found: Array<{ table: string; column: string }> = [];
  for (const exported of Object.values(schema)) {
    if (!(exported instanceof PgTable)) continue;
    const cfg = getTableConfig(exported);
    if (NON_PERSONAL_TABLES.has(cfg.name)) continue;
    for (const col of cfg.columns) {
      if (USER_COLUMNS.has(col.name)) found.push({ table: cfg.name, column: col.name });
    }
  }
  return found;
}

describe('erasure coverage (WP5)', () => {
  it('classifies every user-reference column in the schema', () => {
    const classified = new Set([
      ...PRE_ERASURE_STEPS.map((s) => `${s.table}.${s.column}`),
      ...CASCADE_COVERED.map((s) => `${s.table}.${s.column}`),
      ...COACH_SCOPE_ONLY.map((s) => `${s.table}.${s.column}`),
      ...RETAINED.map((s) => `${s.table}.${s.column}`),
    ]);
    const missing = collectSchemaUserColumns()
      .map(({ table, column }) => `${table}.${column}`)
      .filter((key) => !classified.has(key));

    expect(missing, [
      'Unclassified user-data columns found. For each, decide its GDPR erasure',
      'behaviour and add it to exactly one list in lib/privacy/erasure.ts',
      '(PRE_ERASURE_STEPS / CASCADE_COVERED / COACH_SCOPE_ONLY) or RETAINED in',
      'this test with a documented reason:',
      ...missing,
    ].join('\n')).toEqual([]);
  });

  it('never classifies the same column twice (delete vs cascade ambiguity)', () => {
    const all = [
      ...PRE_ERASURE_STEPS.map((s) => `${s.table}.${s.column}`),
      ...CASCADE_COVERED.map((s) => `${s.table}.${s.column}`),
      ...COACH_SCOPE_ONLY.map((s) => `${s.table}.${s.column}`),
      ...RETAINED.map((s) => `${s.table}.${s.column}`),
    ];
    const dupes = all.filter((k, i) => all.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it('pre-erasure steps use only known actions', () => {
    for (const s of PRE_ERASURE_STEPS) expect(['delete', 'nullify']).toContain(s.action);
  });
});
