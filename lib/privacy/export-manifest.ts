export interface SubjectExportTable {
  table: string;
  column: string;
}

export const EXPORT_PAGE_SIZE = 1_000;

/**
 * Tables whose rows directly describe or were produced by the authenticated
 * subject. Relationship columns for other people (coach_id, assigned_by, etc.)
 * are intentionally not used as selectors: a coach's identity on a client row
 * does not make the client's health record part of the coach's personal export.
 */
export const SUBJECT_EXPORT_TABLES: SubjectExportTable[] = [
  { table: 'profiles', column: 'id' },
  { table: 'client_profiles', column: 'user_id' },
  { table: 'agent_conversation', column: 'user_id' },
  { table: 'agent_runs', column: 'user_id' },
  { table: 'api_usage_log', column: 'user_id' },
  { table: 'appointments', column: 'client_id' },
  { table: 'audit_log', column: 'actor_id' },
  { table: 'client_habits', column: 'client_id' },
  { table: 'client_invites', column: 'accepted_user_id' },
  { table: 'client_supplements', column: 'user_id' },
  { table: 'coach_blocks', column: 'client_id' },
  { table: 'coach_notes', column: 'client_id' },
  { table: 'consents', column: 'user_id' },
  { table: 'custom_foods', column: 'created_by' },
  { table: 'daily_checkins', column: 'user_id' },
  { table: 'data_requests', column: 'user_id' },
  { table: 'feedback', column: 'user_id' },
  { table: 'food_log', column: 'user_id' },
  { table: 'food_parse_corrections', column: 'user_id' },
  { table: 'form_analyses', column: 'user_id' },
  { table: 'habit_checkins', column: 'user_id' },
  { table: 'invite_reservations', column: 'user_id' },
  { table: 'knowledge_documents', column: 'user_id' },
  { table: 'meal_plan_entries', column: 'client_id' },
  { table: 'measurements', column: 'user_id' },
  { table: 'memory_chunks', column: 'user_id' },
  { table: 'messages', column: 'client_id' },
  { table: 'organization_members', column: 'user_id' },
  { table: 'questionnaire_responses', column: 'client_id' },
  { table: 'raw_captures', column: 'user_id' },
  { table: 'supplement_log', column: 'user_id' },
  { table: 'water_log', column: 'user_id' },
  { table: 'wearable_connections', column: 'user_id' },
  { table: 'wearable_data', column: 'user_id' },
  { table: 'workout_programs', column: 'client_id' },
  { table: 'workout_sessions', column: 'user_id' },
];
