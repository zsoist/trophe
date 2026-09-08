import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPilotBudgetStore } from '../../lib/workout/pilot-budget-service';
import { COACH_ATTEMPT_RESERVATION_NANO_USD as reserve, executePilotBudgetCommand, type PilotAttemptBinding, type PilotBudgetCommand, type PilotBudgetResult } from '../../agents/coach-assistant/pilot-budget';
import { COACH_PILOT_OPERATING_TARGET_USD, COACH_PRICING_VERSION } from '../../agents/coach-assistant/economics';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
  || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const service = createPilotBudgetStore(drizzle(pool), actorId), signal = new AbortController().signal;
const pilotId = randomUUID(), runIds: string[] = [], pilotIds = [pilotId];
const operatingTargetNanoUsd = COACH_PILOT_OPERATING_TARGET_USD * 1e9;
let check = 'setup', fixtureInserted = false;
function pass() { process.stdout.write(JSON.stringify({ event: 'coach_pilot_sql', check, outcome: 'passed' }) + '\n'); }
const execute = (binding: PilotAttemptBinding, operation: PilotBudgetCommand['operation'], usage?: Extract<PilotBudgetCommand, { operation: 'settle' }>['usage']) => service.execute({ operation, binding, ...(usage ? { usage } : {}) } as PilotBudgetCommand, signal) as Promise<PilotBudgetResult>;
function attempt(turnId = randomUUID()): PilotAttemptBinding {
  const agentRunId = randomUUID(); runIds.push(agentRunId);
  return { pilotId, actorId, attemptId: randomUUID(), agentRunId, turnId, model: 'gpt-5.6-luna', pricingVersion: COACH_PRICING_VERSION, requestHash: 'a'.repeat(64), reservedNanoUsd: reserve };
}
const cap = (value: number) => pool.query(`UPDATE private.coach_pilot_budgets
  SET cap_nano_usd=$2::bigint,operating_target_nano_usd=LEAST($2::bigint,$3::bigint) WHERE id=$1`, [pilotId, value, operatingTargetNanoUsd]);
async function main() {
  if (process.argv[2] === 'recover-pricing') {
    const binding = JSON.parse(process.env.COACH_PILOT_RECOVERY!);
    const expected = JSON.parse(process.env.COACH_PILOT_PRICING!);
    const found = await execute(binding, 'lookup'); assert.ok(found.ok);
    assert.deepEqual(found.record.usage, expected.usage);
    assert.equal(found.record.unpricedModel, expected.responseModel); assert.equal(found.record.accountingAlert, true);
    assert.equal(found.record.state, 'unknown'); assert.equal(found.record.chargedNanoUsd, reserve);
    const settlement = await execute(binding, 'settle', expected.usage); assert.ok(!settlement.ok && settlement.error === 'invalid_transition');
    const claim = await execute(binding, 'claim_dispatch'); assert.ok(claim.ok && !claim.dispatchGranted);
    const row = (await pool.query('SELECT actual_cost_usd,status FROM public.agent_runs WHERE id=$1', [binding.agentRunId])).rows[0];
    assert.equal(row.actual_cost_usd, null); assert.equal(row.status, 'pending');
    check = 'restart_preserves_unpriced_usage_reservation_and_blocks_settle_dispatch'; pass(); return;
  }
  if (process.argv[2] === 'recover') {
    const binding = JSON.parse(process.env.COACH_PILOT_RECOVERY!);
    const found = await execute(binding, 'lookup'); assert.equal(found.ok, true); assert.ok(found.ok && found.record.state === 'unknown');
    const claim = await execute(binding, 'claim_dispatch'); assert.ok(claim.ok && !claim.dispatchGranted);
    check = 'restart_keeps_unknown_charge_without_redispatch'; pass(); return;
  }
  check = 'canonical_budget_schema_and_indexes_present';
  const columns = await pool.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='private' AND table_name='coach_pilot_budgets'`);
  const names=new Set(columns.rows.map(row=>row.column_name));
  for(const name of ['id','scope_key','organization_id','allowed_actor_ids','cap_nano_usd','operating_target_nano_usd','budget_day','charged_nano_usd','attempt_count','accounting_blocked'])assert.ok(names.has(name));
  const indexes=await pool.query(`SELECT i.indisunique,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i
    JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='agent_runs' AND pg_get_indexdef(i.indexrelid) LIKE '%coachPilot%'`);
  assert.ok(indexes.rows.some(row=>row.indisunique&&row.definition.includes('attemptId')));
  assert.ok(indexes.rows.some(row=>row.definition.includes('pilotId')));pass();
  await pool.query(`INSERT INTO private.coach_pilot_budgets(
    id,scope_key,organization_id,allowed_actor_ids,cap_nano_usd,operating_target_nano_usd
  ) VALUES($1,'ask-trophe-shared',$2,$3::uuid[],$4,$5)`, [pilotId, organizationId, [actorId], 3_000_000_000, operatingTargetNanoUsd]);
  fixtureInserted=true;
  await cap(0);
  check = 'zero_cap_and_foreign_identity_blocked';
  const zero = await execute(attempt(), 'reserve'); assert.ok(!zero.ok && zero.error === 'budget_blocked');
  const foreign = await execute({ ...attempt(), actorId: randomUUID() }, 'reserve'); assert.ok(!foreign.ok && foreign.error === 'budget_blocked'); pass();
  await cap(reserve);
  check = 'concurrent_reservations_cannot_exceed_cap';
  const left = attempt(), right = attempt();
  const competing = await Promise.all([execute(left, 'reserve'), execute(right, 'reserve')]);
  if (competing.filter(result => result.ok).length !== 1) {
    process.stderr.write(JSON.stringify({ event: 'coach_pilot_sql_diagnostic', check,
      outcomes: competing.map(result => result.ok ? 'reserved' : result.error) }) + '\n');
  }
  assert.equal(competing.filter(result => result.ok).length, 1);
  const selected = competing[0].ok ? left : right;
  assert.equal(Number((await pool.query('SELECT charged_nano_usd FROM private.coach_pilot_budgets WHERE id=$1', [pilotId])).rows[0].charged_nano_usd), reserve); pass();
  check = 'concurrent_dispatch_claim_granted_once';
  const claims = await Promise.all([execute(selected, 'claim_dispatch'), execute(selected, 'claim_dispatch')]);
  assert.equal(claims.filter(result => result.ok && result.dispatchGranted).length, 1);
  assert.equal((await pool.query('SELECT status FROM public.agent_runs WHERE id=$1', [selected.agentRunId])).rows[0].status, 'pending'); pass();
  await execute(selected, 'mark_unknown');
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-pilot-budget-sql.ts', 'recover'], { stdio: 'inherit', env: { ...process.env, COACH_PILOT_RECOVERY: JSON.stringify(selected) } });
  assert.equal(child.status, 0);
  check = 'unknown_cannot_release_and_changed_binding_conflicts';
  const release = await execute(selected, 'release_unstarted'); assert.ok(!release.ok && release.error === 'invalid_transition');
  const changed = await execute({ ...selected, requestHash: 'b'.repeat(64) }, 'lookup'); assert.ok(!changed.ok && changed.error === 'idempotency_conflict'); pass();
  await cap(reserve * 20);
  check = 'release_does_not_reset_two_attempt_turn_limit';
  const turnId = randomUUID(), one = attempt(turnId), two = attempt(turnId), three = attempt(turnId);
  assert.equal((await execute(one, 'reserve')).ok, true); assert.equal((await execute(one, 'release_unstarted')).ok, true);
  assert.deepEqual((await pool.query('SELECT status,estimated_cost_usd FROM public.agent_runs WHERE id=$1', [one.agentRunId])).rows[0], { status: 'failed', estimated_cost_usd: 0 });
  assert.equal((await execute(two, 'reserve')).ok, true); assert.equal((await execute(two, 'release_unstarted')).ok, true);
  const third = await execute(three, 'reserve'); assert.ok(!third.ok && third.error === 'budget_blocked'); pass();
  check = 'aggregate_failure_rolls_back_agent_run_insert';
  const before = (await pool.query('SELECT charged_nano_usd,attempt_count FROM private.coach_pilot_budgets WHERE id=$1', [pilotId])).rows[0];
  const failed = attempt();
  await pool.query('ALTER TABLE private.coach_pilot_budgets ADD CONSTRAINT isolated_budget_failure CHECK(false) NOT VALID');
  try { const result = await execute(failed, 'reserve'); assert.ok(!result.ok && result.error === 'uncertain'); }
  finally { await pool.query('ALTER TABLE private.coach_pilot_budgets DROP CONSTRAINT isolated_budget_failure'); }
  assert.equal((await pool.query('SELECT id FROM public.agent_runs WHERE id=$1', [failed.agentRunId])).rowCount, 0);
  assert.deepEqual((await pool.query('SELECT charged_nano_usd,attempt_count FROM private.coach_pilot_budgets WHERE id=$1', [pilotId])).rows[0], before); pass();
  check = 'settlement_replaces_reservation_idempotently';
  const usage = { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 5 };
  const settled = await execute(selected, 'settle', usage); assert.ok(settled.ok && settled.record.chargedNanoUsd === 32000);
  assert.equal((await pool.query('SELECT status FROM public.agent_runs WHERE id=$1', [selected.agentRunId])).rows[0].status, 'completed');
  const replay = await execute(selected, 'settle', usage); assert.ok(replay.ok && replay.write === 'none' && replay.chargeDeltaNanoUsd === 0); pass();
  check = 'reduced_cap_blocks_existing_reservation_dispatch';
  const held = attempt(); assert.equal((await execute(held, 'reserve')).ok, true); await cap(0);
  const blocked = await execute(held, 'claim_dispatch'); assert.ok(!blocked.ok && blocked.error === 'budget_blocked');
  await cap(reserve * 20); pass();
  check = 'bogota_midnight_drops_only_prior_day_settled_usage_and_retains_open_reservations';
  const days = (await pool.query("SELECT ((statement_timestamp() AT TIME ZONE 'America/Bogota')::date)::text AS today,(((statement_timestamp() AT TIME ZONE 'America/Bogota')::date)-1)::text AS yesterday")).rows[0];
  await pool.query("UPDATE public.agent_runs SET metadata=jsonb_set(metadata,'{coachPilot,admissionDay}',to_jsonb($2::text)) WHERE id=ANY($1::uuid[])", [[selected.agentRunId, held.agentRunId], days.yesterday]);
  await pool.query('UPDATE private.coach_pilot_budgets SET budget_day=$2::date,charged_nano_usd=$3 WHERE id=$1', [pilotId, days.yesterday, reserve + 32000]);
  const midnightLookup = await execute(held, 'lookup'); assert.ok(midnightLookup.ok && midnightLookup.record.state === 'reserved');
  assert.deepEqual((await pool.query('SELECT budget_day::text,charged_nano_usd::text FROM private.coach_pilot_budgets WHERE id=$1', [pilotId])).rows[0], { budget_day: days.today, charged_nano_usd: String(reserve) });
  const todayAttempt=attempt();assert.equal((await execute(todayAttempt,'reserve')).ok,true);assert.equal((await execute(todayAttempt,'release_unstarted')).ok,true);pass();
  check = 'second_shared_budget_authority_is_rejected';
  const otherPilot = randomUUID(); pilotIds.push(otherPilot);
  await assert.rejects(pool.query(`INSERT INTO private.coach_pilot_budgets(
    id,scope_key,organization_id,allowed_actor_ids,cap_nano_usd,operating_target_nano_usd
  ) VALUES($1,'ask-trophe-shared',$2,$3::uuid[],$4,$5)`, [otherPilot, organizationId, [actorId], 3_000_000_000, operatingTargetNanoUsd]), { code: '23505' });
  const foreignPilot = await execute({ ...attempt(), pilotId: otherPilot }, 'reserve');
  assert.ok(!foreignPilot.ok && foreignPilot.error === 'budget_blocked'); pass();
  {
    const responseModel = 'different-model';
    check = 'unverified_model_pricing_stays_reserved_with_durable_alert';
    const unpriced = attempt();
    assert.equal((await execute(unpriced, 'reserve')).ok, true);
    assert.equal((await execute(unpriced, 'claim_dispatch')).ok, true);
    const modelUsage = { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 5 };
    const result = await executePilotBudgetCommand({ operation: 'mark_pricing_unknown', binding: unpriced, usage: modelUsage, responseModel }, service, signal);
    assert.ok(result.ok && result.record.state === 'unknown' && result.record.chargedNanoUsd === reserve && result.record.accountingAlert);
    const next = await execute(attempt(), 'reserve'); assert.ok(!next.ok && next.error === 'budget_blocked');
    const recovery = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-pilot-budget-sql.ts', 'recover-pricing'], { stdio: 'inherit', env: {
      ...process.env, COACH_PILOT_RECOVERY: JSON.stringify(unpriced), COACH_PILOT_PRICING: JSON.stringify({ responseModel, usage: modelUsage }),
    } });
    assert.equal(recovery.status, 0); pass();
    // Isolate the next destructive-accounting case inside this disposable fixture.
    await pool.query('DELETE FROM public.agent_runs WHERE id=$1', [unpriced.agentRunId]);
    await pool.query('UPDATE private.coach_pilot_budgets SET charged_nano_usd=charged_nano_usd-$2,attempt_count=attempt_count-1,accounting_blocked=false WHERE id=$1', [pilotId, reserve]);
  }
  check = 'unsupported_usage_stays_reserved_and_blocks_pilot';
  const anomaly = attempt();
  await execute(anomaly, 'reserve'); await execute(anomaly, 'claim_dispatch');
  const result = await execute(anomaly, 'settle', { ...usage, inputTokens: 300000 });
  assert.ok(result.ok && result.record.state === 'unknown' && result.record.chargedNanoUsd === reserve && result.record.accountingAlert);
  assert.equal((await pool.query('SELECT accounting_blocked FROM private.coach_pilot_budgets WHERE id=$1', [pilotId])).rows[0].accounting_blocked, true);
  pass();
  await pool.query('DELETE FROM public.agent_runs WHERE id=$1', [anomaly.agentRunId]);
  await pool.query('UPDATE private.coach_pilot_budgets SET charged_nano_usd=charged_nano_usd-$2,attempt_count=attempt_count-1,accounting_blocked=false WHERE id=$1', [pilotId, reserve]);
  check = 'measured_overrun_charged_and_quarantines_pilot';
  const over = attempt(); await execute(over, 'reserve'); await execute(over, 'claim_dispatch');
  const billed = await execute(over, 'settle', { ...usage, inputTokens: 200000, outputTokens: 2000 });
  assert.ok(billed.ok && billed.record.chargedNanoUsd === 42400000 && billed.record.accountingAlert);
  const stopped = await execute(held, 'claim_dispatch'); assert.ok(!stopped.ok && stopped.error === 'budget_blocked'); pass();
  check = 'revoked_actor_and_direct_authenticated_access_denied';
  await pool.query("UPDATE private.coach_pilot_budgets SET allowed_actor_ids='{}' WHERE id=$1", [pilotId]);
  const revoked = await execute(held, 'lookup'); assert.ok(!revoked.ok && revoked.error === 'budget_blocked');
  await pool.query('UPDATE private.coach_pilot_budgets SET allowed_actor_ids=$2::uuid[] WHERE id=$1', [pilotId, [actorId]]);
  const connection = await pool.connect();
  try { await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated'); await assert.rejects(connection.query('SELECT * FROM private.coach_pilot_budgets'), { code: '42501' }); }
  finally { await connection.query('ROLLBACK'); connection.release(); }
  pass();
  check = 'deleted_attempt_is_detected_without_resetting_accounting';
  await pool.query('DELETE FROM public.agent_runs WHERE id=$1', [selected.agentRunId]);
  const missing = await execute(held, 'lookup'); assert.ok(!missing.ok && missing.error === 'uncertain'); pass();
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_pilot_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (fixtureInserted) {
      await pool.query("DELETE FROM public.agent_runs WHERE id=ANY($1::uuid[]) AND user_id=$2 AND organization_id=$3 AND task_name='coach_pilot' AND metadata->'coachPilot'->'binding'->>'pilotId'=ANY($4::text[])", [runIds, actorId, organizationId, pilotIds]);
      await pool.query("DELETE FROM private.coach_pilot_budgets WHERE id=$1 AND organization_id=$2 AND scope_key='ask-trophe-shared'", [pilotId, organizationId]);
      assert.ok((await pool.query("SELECT to_regclass('private.coach_pilot_budgets') IS NOT NULL AS present")).rows[0].present);
      assert.ok((await pool.query(`SELECT count(*)::int AS count FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname='public' AND t.relname='agent_runs' AND pg_get_indexdef(i.indexrelid) LIKE '%coachPilot%'`)).rows[0].count>=2);
      check = 'isolated_budget_rows_removed_schema_preserved'; pass();
    }
  } catch { process.stderr.write('Isolated budget fixture cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
