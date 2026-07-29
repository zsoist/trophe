import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_PAGE_SIZE,
  SUBJECT_EXPORT_TABLES,
} from '../../lib/privacy/export-manifest';
import {
  CASCADE_COVERED,
  PRE_ERASURE_STEPS,
} from '../../lib/privacy/erasure';

const REQUIRED_SUBJECT_REFS = [
  'agent_conversation.user_id',
  'agent_runs.user_id',
  'appointments.client_id',
  'client_habits.client_id',
  'client_supplements.user_id',
  'coach_blocks.client_id',
  'coach_notes.client_id',
  'consents.user_id',
  'custom_foods.created_by',
  'daily_checkins.user_id',
  'data_requests.user_id',
  'feedback.user_id',
  'food_log.user_id',
  'food_parse_corrections.user_id',
  'form_analyses.user_id',
  'habit_checkins.user_id',
  'invite_reservations.user_id',
  'knowledge_documents.user_id',
  'meal_plan_entries.client_id',
  'measurements.user_id',
  'memory_chunks.user_id',
  'messages.client_id',
  'questionnaire_responses.client_id',
  'raw_captures.user_id',
  'supplement_log.user_id',
  'water_log.user_id',
  'wearable_connections.user_id',
  'wearable_data.user_id',
  'workout_programs.client_id',
  'workout_sessions.user_id',
];

describe('privacy export coverage', () => {
  it('exports every required client-subject table through its real identity column', () => {
    const actual = new Set(
      SUBJECT_EXPORT_TABLES.map(({ table, column }) => `${table}.${column}`),
    );
    const missing = REQUIRED_SUBJECT_REFS.filter((ref) => !actual.has(ref));

    expect(missing).toEqual([]);
    expect(actual.has('client_habits.user_id')).toBe(false);
    expect(actual.has('questionnaire_responses.user_id')).toBe(false);
  });

  it('keeps one unambiguous subject query per table and a 1,000-row page size', () => {
    const tables = SUBJECT_EXPORT_TABLES.map(({ table }) => table);
    expect(new Set(tables).size).toBe(tables.length);
    expect(EXPORT_PAGE_SIZE).toBe(1_000);
  });

  it('covers every user_id/client_id subject reference classified for erasure', () => {
    const exported = new Set(
      SUBJECT_EXPORT_TABLES.map(({ table, column }) => `${table}.${column}`),
    );
    const erasureSubjectRefs = [...PRE_ERASURE_STEPS, ...CASCADE_COVERED]
      .filter(({ column }) => column === 'user_id' || column === 'client_id')
      .map(({ table, column }) => `${table}.${column}`);
    const missing = erasureSubjectRefs.filter((ref) => !exported.has(ref));

    expect(missing).toEqual([]);
  });

  it('paginates rows, includes attachment downloads, and marks partial exports honestly', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/privacy/export/route.ts'),
      'utf8',
    );

    expect(route).toContain('.range(from, from + EXPORT_PAGE_SIZE - 1)');
    expect(route).toContain("requireRole(['client'], { request })");
    expect(route).toContain("data['chat_attachments']");
    expect(route).toContain('createSignedUrl(path, 3_600)');
    expect(route).toContain('const complete = unavailableTables.length === 0');
    expect(route).toContain('status: complete ? 200 : 206');
  });
});
