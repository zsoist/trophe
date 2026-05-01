/**
 * Trophē v0.3 schema barrel — Phase 1.
 *
 * Per-domain files replace the Phase 0 auto-introspected `drizzle/schema.ts`.
 * Drizzle Kit reads this file as the single source of truth.
 *
 * Domain layout:
 *   enums.ts          — pgEnum definitions (userRoleEnum)
 *   auth.ts           — auth.users shim (Supabase Auth on prod, local shim in dev)
 *   profiles.ts       — profiles + client_profiles
 *   organizations.ts  — organizations + organization_members  [Phase 1 NEW]
 *   audit_log.ts      — append-only audit trail              [Phase 1 NEW]
 *   habits.ts         — habits + client_habits + habit_checkins
 *   food.ts           — food_log + food_database + custom_foods
 *   water_log.ts      — water_log
 *   supplements.ts    — supplement_protocols + supplement_log + client_supplements
 *   coach.ts          — coach_notes
 *   measurements.ts   — measurements
 *   api_usage.ts      — api_usage_log
 *   workouts.ts       — exercises + workout_templates + workout_sessions + workout_sets + form_analyses
 *
 *   agent_runs.ts     — LLM call audit + Langfuse trace links [Phase 3 NEW]
 *   foods.ts          — canonical food reference, pgvector 1024-dim [Phase 4 NEW]
 *   food_unit_conversions.ts — deterministic gram lookup [Phase 4 NEW]
 *   food_aliases.ts   — multilingual aliases for hybrid retrieval [Phase 4 NEW]
 *
 * Phase 5 will add:  memory_chunks.ts + coach_blocks.ts + agent_conversation.ts
 * Phase 5 will add:  memory_chunks.ts + coach_blocks.ts + agent_conversation.ts
 * Phase 6 will add:  wearable_connections.ts + wearable_data.ts
 */

export * from './enums';
export * from './auth';
export * from './profiles';
export * from './organizations';
export * from './audit_log';
export * from './habits';
export * from './food';
export * from './water_log';
export * from './supplements';
export * from './coach';
export * from './measurements';
export * from './api_usage';
export * from './workouts';
export * from './agent_runs';
export * from './foods';
export * from './food_unit_conversions';
export * from './food_aliases';
