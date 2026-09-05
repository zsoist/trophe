import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * GDPR Art. 17 — right to erasure, FULFILMENT engine (WP5).
 *
 * Deleting the profiles row cascades ~35 user tables (ON DELETE CASCADE),
 * but the cascade has stragglers this module handles explicitly:
 *   - NO ACTION FKs that would abort the profile delete (habit_checkins,
 *     custom_foods.created_by, …)
 *   - RESTRICT FKs (knowledge_documents.created_by)
 *   - tables with NO FK at all (agent_runs, food_parse_corrections,
 *     invite_reservations) — a cascade never touches these
 * After public-schema cleanup the auth.users row is removed via the admin API.
 *
 * v1 SCOPE: CLIENT accounts only. Coach/admin erasure needs human decisions
 * (template/program reassignment, org ownership) — refused with a clear error
 * and handled as a documented manual runbook case.
 *
 * Every table with a user-reference column MUST appear in exactly one of the
 * lists below — tests/privacy/erasure-coverage.test.ts introspects the Drizzle
 * schema and REDS CI when a new user-data table is added but not classified.
 */

export interface ErasureStep {
  table: string;
  column: string;
  /** delete = remove rows · nullify = anonymize (keep row, drop identity) */
  action: 'delete' | 'nullify';
}

/**
 * Executed IN ORDER before the profiles delete. Rationale per row:
 *  - habit_checkins: user_id FK is NO ACTION → would block the cascade
 *  - food_parse_corrections: no FK; input_text is user-typed → delete
 *  - invite_reservations: no FK → delete
 *  - custom_foods: created_by FK is NO ACTION → would block; user-specific rows
 *  - knowledge_documents: created_by FK is RESTRICT → would block
 *  - agent_runs: no FK; cost telemetry is retained for accounting under
 *    legitimate interest — identity is stripped (nullify), Art. 17(3) balance
 */
export const PRE_ERASURE_STEPS: ErasureStep[] = [
  { table: 'habit_checkins', column: 'user_id', action: 'delete' },
  { table: 'food_parse_corrections', column: 'user_id', action: 'delete' },
  { table: 'food_parse_corrections', column: 'corrected_by', action: 'nullify' },
  { table: 'invite_reservations', column: 'user_id', action: 'delete' },
  { table: 'custom_foods', column: 'created_by', action: 'delete' },
  { table: 'knowledge_documents', column: 'created_by', action: 'delete' },
  // Clients can create private exercises. The scrub above removes authored
  // names/cues; nulling ownership then keeps only a generic referential row for
  // any retained aggregate, without retaining the user's identity or content.
  { table: 'exercises', column: 'created_by', action: 'nullify' },
  { table: 'agent_runs', column: 'user_id', action: 'nullify' },
];

/**
 * Handled automatically when the profiles row is deleted — kept here so the
 * coverage test can assert every user column is accounted for.
 * CASCADE deletes the row; SET NULL anonymizes in place (audit_log stays as a
 * security record per Art. 17(3)(b), api_usage_log/feedback keep anonymous
 * telemetry, org ownership detaches).
 */
export const CASCADE_COVERED: Array<{ table: string; column: string; rule: 'CASCADE' | 'SET NULL' }> = [
  { table: 'agent_conversation', column: 'user_id', rule: 'CASCADE' },
  { table: 'appointments', column: 'client_id', rule: 'CASCADE' },
  { table: 'appointments', column: 'coach_id', rule: 'CASCADE' },
  { table: 'client_habits', column: 'client_id', rule: 'CASCADE' },
  { table: 'client_habits', column: 'assigned_by', rule: 'SET NULL' },
  { table: 'client_invites', column: 'coach_id', rule: 'CASCADE' },
  { table: 'client_profiles', column: 'user_id', rule: 'CASCADE' },
  { table: 'client_profiles', column: 'coach_id', rule: 'SET NULL' },
  { table: 'client_supplements', column: 'user_id', rule: 'CASCADE' },
  { table: 'coach_availability', column: 'coach_id', rule: 'CASCADE' },
  { table: 'coach_blocks', column: 'client_id', rule: 'CASCADE' },
  { table: 'coach_blocks', column: 'coach_id', rule: 'CASCADE' },
  { table: 'coach_notes', column: 'client_id', rule: 'CASCADE' },
  { table: 'coach_notes', column: 'coach_id', rule: 'CASCADE' },
  { table: 'coach_time_off', column: 'coach_id', rule: 'CASCADE' },
  { table: 'consents', column: 'user_id', rule: 'CASCADE' },
  { table: 'daily_checkins', column: 'user_id', rule: 'CASCADE' },
  { table: 'data_requests', column: 'user_id', rule: 'CASCADE' },
  { table: 'data_requests', column: 'processed_by', rule: 'SET NULL' },
  { table: 'food_log', column: 'user_id', rule: 'CASCADE' },
  { table: 'form_analyses', column: 'user_id', rule: 'CASCADE' },
  { table: 'knowledge_documents', column: 'user_id', rule: 'CASCADE' },
  { table: 'meal_plan_entries', column: 'client_id', rule: 'CASCADE' },
  { table: 'meal_plan_entries', column: 'coach_id', rule: 'CASCADE' },
  { table: 'measurements', column: 'user_id', rule: 'CASCADE' },
  { table: 'memory_chunks', column: 'user_id', rule: 'CASCADE' },
  { table: 'messages', column: 'client_id', rule: 'CASCADE' },
  { table: 'messages', column: 'coach_id', rule: 'CASCADE' },
  { table: 'organization_members', column: 'user_id', rule: 'CASCADE' },
  { table: 'organization_members', column: 'invited_by', rule: 'SET NULL' },
  { table: 'organizations', column: 'owner_id', rule: 'SET NULL' },
  { table: 'questionnaire_responses', column: 'client_id', rule: 'CASCADE' },
  { table: 'questionnaire_responses', column: 'coach_id', rule: 'CASCADE' },
  { table: 'questionnaires', column: 'coach_id', rule: 'CASCADE' },
  { table: 'raw_captures', column: 'user_id', rule: 'CASCADE' },
  { table: 'supplement_log', column: 'user_id', rule: 'CASCADE' },
  { table: 'water_log', column: 'user_id', rule: 'CASCADE' },
  { table: 'wearable_connections', column: 'user_id', rule: 'CASCADE' },
  { table: 'wearable_data', column: 'user_id', rule: 'CASCADE' },
  { table: 'workout_programs', column: 'client_id', rule: 'CASCADE' },
  { table: 'workout_sessions', column: 'user_id', rule: 'CASCADE' },
  { table: 'api_usage_log', column: 'user_id', rule: 'SET NULL' },
  { table: 'audit_log', column: 'actor_id', rule: 'SET NULL' },
  { table: 'feedback', column: 'user_id', rule: 'SET NULL' },
];

/**
 * Coach-authored columns that only block COACH erasure (out of v1 scope).
 * Listed so the coverage test is exhaustive: adding a coach-content table
 * still requires an explicit classification decision.
 */
export const COACH_SCOPE_ONLY: Array<{ table: string; column: string }> = [
  { table: 'client_supplements', column: 'assigned_by' },
  { table: 'dish_recipes', column: 'verified_by' },
  { table: 'habits', column: 'created_by' },
  { table: 'supplement_protocols', column: 'coach_id' },
  { table: 'workout_programs', column: 'coach_id' },
  { table: 'workout_templates', column: 'created_by' },
];

/**
 * SQL-only user-data erased by a BESPOKE code block in eraseUser (not a
 * step-list row), because the table has no Drizzle mirror OR no profiles FK,
 * so neither the cascade nor the coverage-test introspection can see it.
 * The coverage guard asserts each of these is actually referenced in
 * eraseUser — so removing the handling reds CI. Keep in sync with eraseUser.
 */
export const BESPOKE_ERASED: Array<{ table: string; note: string }> = [
  { table: 'client_invites', note: 'step 0b — delete by accepted_user_id or client_email' },
  { table: 'chat-attachments', note: 'step 0 — storage objects under {coach}/{client} prefixes (paginated)' },
];

export interface ErasureResult {
  dryRun: boolean;
  userId: string;
  role: string | null;
  counts: Record<string, number>;
  authUserDeleted: boolean;
  errors: string[];
}

/**
 * Erase (or dry-run count) all personal data for a CLIENT user.
 * Dry-run performs zero writes — it reports the rows each step would touch.
 */
export async function eraseUser(userId: string, opts: { dryRun: boolean }): Promise<ErasureResult> {
  const service = createSupabaseServiceClient();
  const result: ErasureResult = {
    dryRun: opts.dryRun, userId, role: null, counts: {}, authUserDeleted: false, errors: [],
  };

  const { data: profile } = await service.from('profiles').select('role').eq('id', userId).maybeSingle();
  result.role = profile?.role ?? null;
  if (!profile) {
    result.errors.push('profile not found — nothing to erase (auth-only account?)');
  } else if (profile.role !== 'client') {
    result.errors.push(
      `role '${profile.role}' is out of v1 erasure scope — coach/admin erasure requires ` +
      'content-reassignment decisions; follow the manual runbook (docs/ops/perf-command-center-2026-07-03.md follow-ups)'
    );
    return result;
  }

  // 0) Chat attachments in storage — storage.objects has no FK to profiles,
  //    so the cascade never touches it. Path convention (migration 0052):
  //    {coach_id}/{client_id}/{uuid}.{ext} — remove every object under each
  //    coach this client ever messaged with. BOTH queries are paginated:
  //    PostgREST caps at 1000 rows and storage.list caps per page, so a client
  //    with a long chat history would otherwise leave later attachments behind
  //    while reporting success.
  {
    // Distinct coach_ids across ALL messages (page past the 1000-row cap).
    const coachIds = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await service
        .from('messages').select('coach_id').eq('client_id', userId)
        .order('coach_id').range(from, from + 999);
      for (const r of data ?? []) coachIds.add(r.coach_id as string);
      if (!data || data.length < 1000) break;
    }
    let objCount = 0;
    for (const coachId of coachIds) {
      const prefix = `${coachId}/${userId}`;
      // Page storage.list until a short page (fewer than the limit) is returned.
      for (let offset = 0; ; offset += 1000) {
        const { data: objs } = await service.storage.from('chat-attachments')
          .list(prefix, { limit: 1000, offset });
        const paths = (objs ?? []).map((o) => `${prefix}/${o.name}`);
        objCount += paths.length;
        if (!opts.dryRun && paths.length > 0) {
          const { error } = await service.storage.from('chat-attachments').remove(paths);
          if (error) result.errors.push(`chat-attachments remove: ${error.message}`);
        }
        if (!objs || objs.length < 1000) break;
      }
    }
    result.counts['chat-attachments storage (delete)'] = objCount;
  }

  // 0b) client_invites — the invite row that onboarded this client carries
  //     their email + name + accepted_user_id, and accepted_user_id has NO FK,
  //     so neither the cascade nor any classified step removes it. Left behind,
  //     it's an Art. 17 gap (name + email persist after "successful" erasure).
  {
    const { data: prof } = await service.from('profiles').select('email').eq('id', userId).maybeSingle();
    const email = (prof?.email as string | undefined)?.trim() || null;
    const orClause = email
      ? `accepted_user_id.eq.${userId},client_email.eq.${email}`
      : `accepted_user_id.eq.${userId}`;
    const { count } = await service
      .from('client_invites').select('*', { count: 'exact', head: true }).or(orClause);
    result.counts['client_invites (delete)'] = count ?? 0;
    if (!opts.dryRun && (count ?? 0) > 0) {
      const { error } = await service.from('client_invites').delete().or(orClause);
      if (error) result.errors.push(`client_invites: ${error.message}`);
    }
  }

  // 1) Scrub authored exercise content before ownership is nulled. Workout
  // history normally cascades with the profile, but a historical set or form
  // row can still hold an FK to an exercise created by this client. Keeping a
  // generic row avoids an FK failure while ensuring no authored name or cue is
  // retained after erasure.
  {
    const authoredExerciseIds: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service
        .from('exercises').select('id').eq('created_by', userId).range(from, from + 999);
      if (error) {
        result.errors.push(`exercises (content scrub): count failed — ${error.message}`);
        break;
      }
      authoredExerciseIds.push(...(data ?? []).map((row) => row.id as string).filter(Boolean));
      if (!data || data.length < 1000) break;
    }
    result.counts['exercises (content scrub)'] = authoredExerciseIds.length;
    if (!opts.dryRun && authoredExerciseIds.length > 0) {
      const { error } = await service.from('exercises').update({
        name: 'Deleted exercise',
        name_es: null,
        name_el: null,
        instructions: null,
        instructions_es: null,
        instructions_el: null,
      }).in('id', authoredExerciseIds);
      if (error) result.errors.push(`exercises (content scrub): ${error.message}`);
    }
  }

  // 2) Straggler steps (would block or escape the cascade)
  for (const step of PRE_ERASURE_STEPS) {
    const key = `${step.table}.${step.column} (${step.action})`;
    const { count, error: countErr } = await service
      .from(step.table).select('*', { count: 'exact', head: true }).eq(step.column, userId);
    if (countErr) { result.errors.push(`${key}: count failed — ${countErr.message}`); continue; }
    result.counts[key] = count ?? 0;
    if (opts.dryRun || !count) continue;
    const { error } = step.action === 'delete'
      ? await service.from(step.table).delete().eq(step.column, userId)
      : await service.from(step.table).update({ [step.column]: null }).eq(step.column, userId);
    if (error) result.errors.push(`${key}: ${error.message}`);
  }

  // 3) Cascade root — count the big tables for the evidence trail, then delete
  for (const t of ['food_log', 'water_log', 'measurements', 'messages', 'workout_sessions', 'consents'] as const) {
    const col = t === 'messages' ? 'client_id' : 'user_id';
    const { count } = await service.from(t).select('*', { count: 'exact', head: true }).eq(col, userId);
    result.counts[`${t} (cascade)`] = count ?? 0;
  }
  if (!opts.dryRun && profile && result.errors.length === 0) {
    const { error: profileErr } = await service.from('profiles').delete().eq('id', userId);
    if (profileErr) {
      result.errors.push(`profiles delete: ${profileErr.message}`);
    } else {
      result.counts['profiles (deleted)'] = 1;
      // 4) auth.users — idempotent admin delete (lib/auth/auth-admin.ts pattern)
      const { error: authErr } = await service.auth.admin.deleteUser(userId);
      if (authErr && !/user.*not.*found/i.test(authErr.message)) {
        result.errors.push(`auth delete: ${authErr.message}`);
      } else {
        result.authUserDeleted = true;
      }
    }
  }

  return result;
}
