import { sql } from 'drizzle-orm';
import type { db } from '@/db/client';
import {
  decidePilotBudgetCommand, pilotAttemptRecordSchema, pilotBudgetCommandSchema, pilotRecordActiveCharge, pilotTurnProfile, PARALLEL_SEARCH_MODEL,
  type PilotAttemptRecord, type PilotBudgetResult, type PilotBudgetStore,
} from '@/agents/coach-assistant/pilot-budget';
import { COACH_PILOT_BUDGET_USD, COACH_PILOT_TIME_ZONE } from '@/agents/coach-assistant/economics';
import { HAIKU_MODEL } from '@/agents/router/policies';

const fail = (error: 'budget_blocked' | 'invalid_input' | 'idempotency_conflict' | 'uncertain' | 'cancelled'): PilotBudgetResult => ({ storage: 'database', ok: false, error });
const integer = (value: string | number) => {
  if (!/^(0|[1-9]\d*)$/.test(String(value))) throw new Error('invalid_accounting');
  const amount = BigInt(value);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid_accounting');
  return Number(amount);
};

/** Server-only persistent port; caller identity must already be authenticated.
 * No provider connection, production enablement, cap provisioning or automatic retry.
 */
export function createPilotBudgetStore(database: typeof db, actorId: string): PilotBudgetStore {
  return {
    async execute(raw, signal): Promise<PilotBudgetResult> {
      const parsed = pilotBudgetCommandSchema.safeParse(raw);
      if (!parsed.success) return fail('invalid_input');
      const command = parsed.data, binding = command.binding;
      if (binding.actorId !== actorId) return fail('budget_blocked');
      if (signal.aborted) return fail('cancelled');
      try {
        return await database.transaction(async transaction => {
          await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
          const configRows = await transaction.execute<{ organization_id: string; cap_nano_usd: string; operating_target_nano_usd:string; budget_day:string; server_budget_day:string; charged_nano_usd: string; attempt_count: number; accounting_blocked: boolean; allowed: boolean; carryover_records?: unknown }>(sql`
            SELECT organization_id, cap_nano_usd::text, operating_target_nano_usd::text, budget_day::text,
              ((statement_timestamp() AT TIME ZONE ${COACH_PILOT_TIME_ZONE})::date)::text AS server_budget_day,
              charged_nano_usd::text, attempt_count, accounting_blocked,
              COALESCE(to_jsonb(b)->'carryover_records','[]'::jsonb) AS carryover_records,
              ${actorId}::uuid=ANY(allowed_actor_ids) AS allowed
            FROM private.coach_pilot_budgets b WHERE id=${binding.pilotId}::uuid FOR UPDATE`);
          const config = configRows.rows[0];
          if (!config?.allowed) return fail('budget_blocked');
          const auth = await transaction.execute(sql`SELECT p.id FROM public.profiles p JOIN public.organization_members m ON m.user_id=p.id
            WHERE p.id=${actorId}::uuid AND m.org_id=${config.organization_id}::uuid FOR SHARE OF p,m`);
          if (!auth.rows.length) return fail('budget_blocked');
          signal.throwIfAborted();
          // The stored total/count detects deleted or reclassified rows, not just malformed metadata.
          const rows = await transaction.execute<{ id: string; user_id: string; organization_id: string; model: string; record: unknown }>(sql`
            SELECT id,user_id,organization_id,model,metadata->'coachPilot' AS record FROM public.agent_runs
            WHERE metadata ? 'coachPilot' AND metadata->'coachPilot'->'binding'->>'pilotId'=${binding.pilotId} LIMIT 4097 FOR UPDATE`);
          const carried = config.carryover_records ?? [];
          if (!Array.isArray(carried) || carried.length > 4096 || rows.rows.length + carried.length > 4096 || rows.rows.length + carried.length !== config.attempt_count) return fail('uncertain');
          let total = BigInt(0), turnAttemptCount = 0, textFoodTurnCount = 0, searchTurnCount = 0, accountingBlocked = config.accounting_blocked;
          const carriedAttemptIds = new Set<string>(), carriedRunIds = new Set<string>();
          // Immutable financial history only. Source identities remain audit metadata;
          // no QA profile, food record, or authority is recreated in this database.
          for (const rawRecord of carried) {
            const parsedRecord = pilotAttemptRecordSchema.safeParse(rawRecord);
            if (!parsedRecord.success) return fail('uncertain');
            const record = parsedRecord.data;
            if (record.binding.pilotId !== binding.pilotId || carriedAttemptIds.has(record.binding.attemptId) || carriedRunIds.has(record.binding.agentRunId)) return fail('uncertain');
            carriedAttemptIds.add(record.binding.attemptId); carriedRunIds.add(record.binding.agentRunId);
            if (record.binding.attemptId === binding.attemptId || record.binding.agentRunId === binding.agentRunId) return fail('idempotency_conflict');
            total += BigInt(pilotRecordActiveCharge(record,config.server_budget_day));
            accountingBlocked ||= record.accountingAlert;
            if (record.binding.turnId === binding.turnId) {
              const profile=pilotTurnProfile(record.binding);
              if(profile==='search')searchTurnCount++;else if(profile==='native_food')textFoodTurnCount++;else turnAttemptCount++;
            }
          }
          let existing: PilotAttemptRecord | undefined;
          for (const row of rows.rows) {
            const record = pilotAttemptRecordSchema.safeParse(row.record);
            if (!record.success || carriedAttemptIds.has(record.data.binding.attemptId) || carriedRunIds.has(row.id) || record.data.binding.agentRunId !== row.id || record.data.binding.actorId !== row.user_id
              || record.data.binding.pilotId !== binding.pilotId || row.organization_id !== config.organization_id || row.model !== record.data.binding.model) return fail('uncertain');
            total += BigInt(pilotRecordActiveCharge(record.data,config.server_budget_day));
            if (record.data.binding.turnId === binding.turnId) {
              // Ordinary conversation, native Food selector/phases and paid
              // searches are counted independently, from persisted rows under
              // this same pilot lock. No profile trusts a caller's own tally
              // and none is counted from a freshly minted turn id, so the
              // ceilings cannot be evaded by a new service or a replayed turn,
              // and one profile never consumes another's slot.
              const profile = pilotTurnProfile(record.data.binding);
              if (profile === 'search') searchTurnCount++;
              else if (profile === 'native_food') textFoodTurnCount++;
              else turnAttemptCount++;
            }
            accountingBlocked ||= record.data.accountingAlert;
            if (record.data.binding.attemptId === binding.attemptId || row.id === binding.agentRunId) {
              if (existing) return fail('uncertain');
              existing = record.data;
            }
          }
          if (total > BigInt(Number.MAX_SAFE_INTEGER)) return fail('uncertain');
          if (config.budget_day === config.server_budget_day) {
            if (total !== BigInt(config.charged_nano_usd)) return fail('uncertain');
          } else {
            // A natural Bogotá day change recomputes today's settled usage plus every
            // still-open reservation. Historical rows remain untouched and auditable.
            await transaction.execute(sql`UPDATE private.coach_pilot_budgets SET budget_day=${config.server_budget_day}::date,charged_nano_usd=${total}::bigint WHERE id=${binding.pilotId}::uuid`);
          }
          if (!existing && rows.rows.length + carried.length === 4096) return fail('budget_blocked');
          const admissionCap=Math.min(integer(config.cap_nano_usd),integer(config.operating_target_nano_usd),COACH_PILOT_BUDGET_USD*1e9);
          const decision = decidePilotBudgetCommand({ pilotId: binding.pilotId, budgetDay:config.server_budget_day, capNanoUsd: admissionCap, chargedNanoUsd: Number(total), turnAttemptCount, textFoodTurnCount, searchTurnCount, accountingBlocked, existing }, command);
          if (!decision.ok || decision.write === 'none') { signal.throwIfAborted(); return { ...decision, storage: 'database' }; }
          if (total + BigInt(decision.chargeDeltaNanoUsd) > BigInt(Number.MAX_SAFE_INTEGER)) {
            // A measured overrun must stop the pilot even when its aggregate cannot fit the port's integer range.
            await transaction.execute(sql`UPDATE private.coach_pilot_budgets SET accounting_blocked=true WHERE id=${binding.pilotId}::uuid`);
            signal.throwIfAborted(); return fail('uncertain');
          }
          const record = decision.record, metadata = JSON.stringify({ coachPilot: record });
          // Haiku is recognized only while settling legacy ledger rows. New
          // governed bindings are Luna or the dedicated transcription model.
          // Metered search reports its real provider; it must never be booked as
          // an OpenAI/Luna generation or priced with token rates.
          const provider = binding.model === HAIKU_MODEL ? 'anthropic' : binding.model === PARALLEL_SEARCH_MODEL ? 'parallel' : 'openai';
          // Preserve the existing generation status constraint. Financial state lives in metadata.
          const status = record.state === 'settled' ? 'completed' : record.state === 'released' ? 'failed' : 'pending';
          if (decision.write === 'insert') {
            await transaction.execute(sql`INSERT INTO public.agent_runs(id,generation_id,user_id,organization_id,task_name,provider,model,status,metadata,estimated_cost_usd)
              VALUES (${binding.agentRunId}::uuid,${binding.agentRunId}::uuid,${actorId}::uuid,${config.organization_id}::uuid,'coach_pilot',${provider},${binding.model},${status},${metadata}::jsonb,${binding.reservedNanoUsd / 1e9})`);
          } else {
            await transaction.execute(sql`UPDATE public.agent_runs SET metadata=jsonb_set(metadata,'{coachPilot}',${JSON.stringify(record)}::jsonb),request_id=${record.providerSuccess?.requestId??null},
              status=${status},estimated_cost_usd=${record.state === 'released' ? 0 : binding.reservedNanoUsd / 1e9},error_message=${record.state === 'released' ? 'pilot_cancelled_before_dispatch' : null},actual_cost_usd=${record.state === 'settled' ? record.chargedNanoUsd / 1e9 : null}
              WHERE id=${binding.agentRunId}::uuid`);
          }
          await transaction.execute(sql`UPDATE private.coach_pilot_budgets SET budget_day=${config.server_budget_day}::date,charged_nano_usd=charged_nano_usd+${decision.chargeDeltaNanoUsd}::bigint,
            attempt_count=attempt_count+${decision.write === 'insert' ? 1 : 0},accounting_blocked=${accountingBlocked || record.accountingAlert}
            WHERE id=${binding.pilotId}::uuid`);
          signal.throwIfAborted();
          return { ...decision, storage: 'database' };
        });
      } catch (error) {
        const code = (error as { code?: unknown; cause?: { code?: unknown } })?.cause?.code ?? (error as { code?: unknown })?.code;
        return fail(code === '23505' ? 'idempotency_conflict' : 'uncertain');
      }
    },
  };
}
