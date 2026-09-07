import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { db } from '@/db/client';
import type { CoachActionResult, CoachPreferenceOperation, CoachProposal, CoachReceipt } from '@/agents/coach-assistant/contracts';
import { preferenceOperationSchema } from '@/agents/coach-assistant/schema';
import { workoutPreferencesSchema } from './preferences';
import { writeWorkoutPreferences } from './preference-service';

type Database = typeof db;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
interface Scope { actorId: string; subjectId: string; organizationId: string; signal: AbortSignal }
type Authorized = { workout_preferences: unknown; actor_role: string }
type StoredReceipt = { subject_id: string; organization_id: string; conversation_id: string; proposal_id: string; request_hash: string; resource_version: string; result: CoachReceipt }
const failure = (error: CoachActionResult['error']): CoachActionResult => ({ version: 'coach-assistant.v2', storage: 'database', ok: false, error });
const success = (value: { proposal: CoachProposal } | { receipt: CoachReceipt }): CoachActionResult => ({ version: 'coach-assistant.v2', storage: 'database', ok: true, ...value });
class Rejected extends Error { constructor(readonly reason: CoachActionResult['error']) { super(reason); } }

async function authorize(transaction: Transaction, scope: Scope): Promise<Authorized> {
  scope.signal.throwIfAborted();
  // The current profile, assignment and BOTH memberships stay locked until commit.
  const result = await transaction.execute<Authorized>(sql`
    SELECT cp.workout_preferences, actor.role::text AS actor_role
    FROM public.client_profiles cp
    JOIN public.profiles actor ON actor.id = ${scope.actorId}::uuid
    JOIN public.organization_members actor_org ON actor_org.user_id = actor.id AND actor_org.org_id = ${scope.organizationId}::uuid
    JOIN public.organization_members subject_org ON subject_org.user_id = cp.user_id AND subject_org.org_id = actor_org.org_id
    WHERE cp.user_id = ${scope.subjectId}::uuid
      AND actor.role::text = 'client' AND actor_org.role::text = 'client' AND actor.id = cp.user_id
    FOR UPDATE OF cp FOR SHARE OF actor, actor_org, subject_org
  `);
  if (result.rows.length !== 1) throw new Rejected('forbidden');
  return result.rows[0];
}
async function revision(transaction: Transaction, subjectId: string) {
  const result = await transaction.execute<{ revision: string }>(sql`SELECT revision::text FROM private.coach_preference_versions WHERE subject_id = ${subjectId}::uuid`);
  if (result.rows.length !== 1) throw new Rejected('uncertain');
  return result.rows[0].revision;
}

/** Unconnected until the isolated SQL/Auth gates pass. No ephemeral fallback.
 * The extra tables are accessed only here; ordinary Workout writes do not need them.
 */
export function createDurablePreferenceService(database: Database) {
  return {
    async read(scope: Scope) {
      return database.transaction(async transaction => {
        await transaction.execute(sql`SET LOCAL statement_timeout = '5000ms'`);
        const authorized = await authorize(transaction, scope);
        const preferences = workoutPreferencesSchema.parse(authorized.workout_preferences);
        const version = await revision(transaction, scope.subjectId);
        scope.signal.throwIfAborted();
        return { preferences, version };
      });
    },
    async execute(scope: Scope & { operation: CoachPreferenceOperation }): Promise<CoachActionResult> {
      const parsed = preferenceOperationSchema.safeParse(scope.operation);
      if (!parsed.success) return failure('invalid_input');
      const operation = parsed.data;
      if (scope.actorId !== scope.subjectId || (operation.clientId ?? scope.actorId) !== scope.subjectId) return failure('forbidden');
      try {
        return await database.transaction(async transaction => {
          await transaction.execute(sql`SET LOCAL statement_timeout = '5000ms'`);
          if (operation.operation !== 'propose') {
            // Serialize a retry even when a malicious payload names a different resource.
            await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId + ':' + operation.actionId}, 0))`);
          }
          const authorized = await authorize(transaction, scope);
          if (operation.operation !== 'propose') {
            const existing = await transaction.execute<StoredReceipt>(sql`SELECT subject_id, organization_id, conversation_id, proposal_id, request_hash, resource_version, result
              FROM private.coach_action_receipts WHERE actor_id = ${scope.actorId}::uuid AND action_id = ${operation.actionId}::uuid`);
            const receipt = existing.rows[0];
            if (receipt) {
              if (receipt.subject_id !== scope.subjectId || receipt.organization_id !== scope.organizationId || receipt.conversation_id !== operation.conversationId
                || (operation.operation === 'apply' && (receipt.proposal_id !== operation.proposalId || receipt.request_hash !== operation.hash || receipt.resource_version !== operation.resourceVersion))) throw new Rejected('idempotency_conflict');
              scope.signal.throwIfAborted();
              return success({ receipt: receipt.result });
            }
            if (operation.operation === 'receipt') return failure('not_found');
          }
          const preferences = workoutPreferencesSchema.safeParse(authorized.workout_preferences);
          if (!preferences.success) throw new Rejected('invalid_input');
          const version = await revision(transaction, scope.subjectId);
          if (operation.operation === 'propose') {
            if (version !== operation.resourceVersion) throw new Rejected('version_conflict');
            const count = await transaction.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM private.coach_action_proposals WHERE actor_id = ${scope.actorId}::uuid AND expires_at > now()`);
            if (Number(count.rows[0].count) >= 128) throw new Rejected('uncertain');
            const clock = await transaction.execute<{ expires: string }>(sql`SELECT (clock_timestamp() + interval '5 minutes')::text AS expires`);
            const proposal: CoachProposal = { id: randomUUID(), hash: '', action: 'preference.update', resource: { kind: 'preference', id: scope.subjectId, version }, before: { durationMinutes: preferences.data.durationMinutes }, after: { durationMinutes: operation.after.durationMinutes }, precondition: version, expiresAt: new Date(clock.rows[0].expires).toISOString(), reviewRequired: true };
            proposal.hash = createHash('sha256').update(JSON.stringify({ actor: scope.actorId, subject: scope.subjectId, organization: scope.organizationId, conversation: operation.conversationId, proposal })).digest('hex');
            await transaction.execute(sql`INSERT INTO private.coach_action_proposals(id, actor_id, subject_id, organization_id, conversation_id, action, request_hash, resource_version, envelope, expires_at)
              VALUES (${proposal.id}::uuid, ${scope.actorId}::uuid, ${scope.subjectId}::uuid, ${scope.organizationId}::uuid, ${operation.conversationId}::uuid, 'preference.update', ${proposal.hash}, ${version}, ${JSON.stringify(proposal)}::jsonb, ${proposal.expiresAt}::timestamptz)`);
            scope.signal.throwIfAborted();
            return success({ proposal });
          }
          if (operation.operation !== 'apply') throw new Rejected('invalid_input');
          const stored = await transaction.execute<{ envelope: CoachProposal; expired: boolean; request_hash: string; resource_version: string }>(sql`
            SELECT envelope, expires_at <= clock_timestamp() AS expired, request_hash, resource_version FROM private.coach_action_proposals
            WHERE id = ${operation.proposalId}::uuid AND actor_id = ${scope.actorId}::uuid AND subject_id = ${scope.subjectId}::uuid
              AND organization_id = ${scope.organizationId}::uuid AND conversation_id = ${operation.conversationId}::uuid`);
          const proposal = stored.rows[0];
          if (!proposal) throw new Rejected('not_found');
          if (proposal.request_hash !== operation.hash) throw new Rejected('invalid_input');
          if (proposal.expired) throw new Rejected('expired');
          if (proposal.resource_version !== version || operation.resourceVersion !== version) throw new Rejected('version_conflict');
          scope.signal.throwIfAborted();
          await writeWorkoutPreferences(transaction, { actorId: scope.actorId, subjectId: scope.subjectId, role: authorized.actor_role, preferences: { ...preferences.data, durationMinutes: proposal.envelope.after.durationMinutes } });
          const resourceVersion = await revision(transaction, scope.subjectId);
          const clock = await transaction.execute<{ recorded: string }>(sql`SELECT clock_timestamp()::text AS recorded`);
          const receipt: CoachReceipt = { id: randomUUID(), actionId: operation.actionId, proposalId: operation.proposalId, status: 'applied', resourceVersion, recordedAt: new Date(clock.rows[0].recorded).toISOString() };
          await transaction.execute(sql`INSERT INTO private.coach_action_receipts(id, actor_id, subject_id, organization_id, conversation_id, action_id, proposal_id, request_hash, resource_version, result)
            VALUES (${receipt.id}::uuid, ${scope.actorId}::uuid, ${scope.subjectId}::uuid, ${scope.organizationId}::uuid, ${operation.conversationId}::uuid, ${operation.actionId}::uuid, ${operation.proposalId}::uuid, ${operation.hash}, ${operation.resourceVersion}, ${JSON.stringify(receipt)}::jsonb)`);
          await transaction.execute(sql`INSERT INTO public.audit_log(actor_id, actor_role, action, table_name, record_id, new_value)
            VALUES (${scope.actorId}::uuid, ${authorized.actor_role}::user_role, 'workout_preferences_updated', 'client_profiles', ${scope.subjectId}::uuid,
              ${JSON.stringify({ clientId: scope.subjectId, version: preferences.data.version, actionId: operation.actionId })}::jsonb)`);
          scope.signal.throwIfAborted();
          return success({ receipt });
        });
      } catch (error) {
        if (error instanceof Rejected) return failure(error.reason);
        if (error instanceof TRPCError && error.code === 'FORBIDDEN') return failure('forbidden');
        // Connection loss can be after commit. The caller must query this actionId.
        return failure('uncertain');
      }
    },
  };
}
