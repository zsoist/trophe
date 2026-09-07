import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPilotBudgetStore } from '../../lib/workout/pilot-budget-service';
import { COACH_ATTEMPT_RESERVATION_NANO_USD as reserve, executePilotBudgetCommand, type PilotAttemptBinding, type PilotBudgetCommand, type PilotBudgetResult } from '../../agents/coach-assistant/pilot-budget';
import { COACH_PRICING_VERSION } from '../../agents/coach-assistant/economics';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
  || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const service = createPilotBudgetStore(drizzle(pool), actorId), signal = new AbortController().signal;
const pilotId = randomUUID(), runIds: string[] = [], pilotIds = [pilotId];
let check = 'setup', installed = false;
function pass() { process.stdout.write(JSON.stringify({ event: 'coach_pilot_sql', check, outcome: 'passed' }) + '\n'); }
const execute = (binding: PilotAttemptBinding, operation: PilotBudgetCommand['operation'], usage?: Extract<PilotBudgetCommand, { operation: 'settle' }>['usage']) => service.execute({ operation, binding, ...(usage ? { usage } : {}) } as PilotBudgetCommand, signal) as Promise<PilotBudgetResult>;
function attempt(turnId = randomUUID()): PilotAttemptBinding {
  const agentRunId = randomUUID(); runIds.push(agentRunId);
  return { pilotId, actorId, attemptId: randomUUID(), agentRunId, turnId, model: 'gpt-5.6-luna', pricingVersion: COACH_PRICING_VERSION, requestHash: 'a'.repeat(64), reservedNanoUsd: reserve };
}
const cap = (value: number) => pool.query('UPDATE private.coach_pilot_budgets SET cap_nano_usd=$2 WHERE id=$1', [pilotId, value]);
async function main() {
  if (process.argv[2] === 'recover-pricing') {
    const binding = JSON.parse(process.env.COACH_PILOT_RECOVERY!);
    const expected = JSON.parse(process.env.COACH_PILOT_PRICING!);
    const found = await execute(binding, 'lookup'); assert.ok(found.ok);
    assert.deepEqual(found.record.usage, expected.usage);
    assert.equal(found.record.unpricedModel, expected.responseModel); assert.equal(found.record.accountingAlert, true);
    assert.equal(found.record.state, 'unknown'); assert.equal(found.record.chargedNanoUsd, reserve);
    const settlement = await execute(binding, 'settle', expected.usage); assert.ok(!settlement.ok && settlement.error === 'invalid_transition');
    const claim = await execute(binding, 'claim_dispatch'); assert.ok(!claim.ok && claim.error === 'budget_blocked');
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
  await pool.query(await readFile('db/isolated/coach-pilot-budget.sql', 'utf8')); installed = true;
  await pool.query('INSERT INTO private.coach_pilot_budgets(id,organization_id,allowed_actor_ids) VALUES($1,$2,$3::uuid[])', [pilotId, organizationId, [actorId]]);
  check = 'zero_cap_and_foreign_identity_blocked';
  const zero = await execute(attempt(), 'reserve'); assert.ok(!zero.ok && zero.error === 'budget_blocked');
  const foreign = await execute({ ...attempt(), actorId: randomUUID() }, 'reserve'); assert.ok(!foreign.ok && foreign.error === 'budget_blocked'); pass();
  await cap(reserve);
  check = 'concurrent_reservations_cannot_exceed_cap';
  const left = attempt(), right = attempt();
  const competing = await Promise.all([execute(left, 'reserve'), execute(right, 'reserve')]);
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
  check = 'measured_overrun_charged_and_quarantines_pilot';
  const over = attempt(); await execute(over, 'reserve'); await execute(over, 'claim_dispatch');
  const billed = await execute(over, 'settle', { ...usage, inputTokens: 200000, outputTokens: 2000 });
  assert.ok(billed.ok && billed.record.chargedNanoUsd === 42400000 && billed.record.accountingAlert);
  const stopped = await execute(held, 'claim_dispatch'); assert.ok(!stopped.ok && stopped.error === 'budget_blocked'); pass();
  check = 'cross_pilot_attempt_and_run_identity_collisions';
  const otherPilot = randomUUID(); pilotIds.push(otherPilot);
  await pool.query('INSERT INTO private.coach_pilot_budgets(id,organization_id,allowed_actor_ids,cap_nano_usd) VALUES($1,$2,$3::uuid[],$4)', [otherPilot, organizationId, [actorId], reserve * 20]);
  for (const collision of [{ ...selected, pilotId: otherPilot }, { ...attempt(), pilotId: otherPilot, attemptId: selected.attemptId }]) {
    const result = await execute(collision, 'reserve'); assert.ok(!result.ok && result.error === 'idempotency_conflict');
  }
  assert.equal(Number((await pool.query('SELECT charged_nano_usd FROM private.coach_pilot_budgets WHERE id=$1', [otherPilot])).rows[0].charged_nano_usd), 0); pass();
  check = 'unsupported_usage_stays_reserved_and_blocks_pilot';
  const anomaly = { ...attempt(), pilotId: otherPilot };
  await execute(anomaly, 'reserve'); await execute(anomaly, 'claim_dispatch');
  const result = await execute(anomaly, 'settle', { ...usage, inputTokens: 300000 });
  assert.ok(result.ok && result.record.state === 'unknown' && result.record.chargedNanoUsd === reserve && result.record.accountingAlert);
  assert.equal((await pool.query('SELECT accounting_blocked FROM private.coach_pilot_budgets WHERE id=$1', [otherPilot])).rows[0].accounting_blocked, true);
  pass();
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
  for (const responseModel of [null, 'different-model', 'gpt-5.6-luna-snapshot']) {
    check = 'unverified_model_pricing_stays_reserved_with_durable_alert';
    const pricingPilot = randomUUID(); pilotIds.push(pricingPilot);
    await pool.query('INSERT INTO private.coach_pilot_budgets(id,organization_id,allowed_actor_ids,cap_nano_usd) VALUES($1,$2,$3::uuid[],$4)', [pricingPilot, organizationId, [actorId], reserve * 3]);
    const unpriced = { ...attempt(), pilotId: pricingPilot };
    assert.equal((await execute(unpriced, 'reserve')).ok, true);
    assert.equal((await execute(unpriced, 'claim_dispatch')).ok, true);
    const usage = { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 5 };
    const result = await executePilotBudgetCommand({ operation: 'mark_pricing_unknown', binding: unpriced, usage, responseModel }, service, signal);
    assert.ok(result.ok && result.record.state === 'unknown' && result.record.chargedNanoUsd === reserve && result.record.accountingAlert);
    const next = await execute({ ...attempt(), pilotId: pricingPilot }, 'reserve'); assert.ok(!next.ok && next.error === 'budget_blocked');
    const recovery = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-pilot-budget-sql.ts', 'recover-pricing'], { stdio: 'inherit', env: {
      ...process.env, COACH_PILOT_RECOVERY: JSON.stringify(unpriced), COACH_PILOT_PRICING: JSON.stringify({ responseModel, usage }),
    } });
    assert.equal(recovery.status, 0); pass();
  }
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_pilot_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed) {
      await pool.query("DELETE FROM public.agent_runs WHERE id=ANY($1::uuid[]) AND user_id=$2 AND organization_id=$3 AND task_name='coach_pilot' AND metadata->'coachPilot'->'binding'->>'pilotId'=ANY($4::text[])", [runIds, actorId, organizationId, pilotIds]);
      await pool.query('DROP INDEX public.isolated_coach_pilot_attempt; DROP INDEX public.isolated_coach_pilot_rows; DROP TABLE private.coach_pilot_budgets;');
      check = 'isolated_budget_fixture_removed'; pass();
    }
  } catch { process.stderr.write('Isolated budget fixture cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
