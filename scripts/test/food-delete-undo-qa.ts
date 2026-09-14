/** Explicit QA-only witness. Creates and cleans only UUID-tagged synthetic rows. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createFoodLogDeletePort, type FoodLogDeleteClient } from '../../components/food/food-log-delete-port';
import { isSamePersistedRow, type FoodLogRowSnapshot } from '../../components/food/food-log-row';

async function main() {
  assert.equal(process.env.AG1_QA_DELETE_UNDO_WITNESS, '1');
  const credentials = JSON.parse(readFileSync('/Users/daniel_serverm4/.codex/private/trophe/qa-zoist-access.json', 'utf8'));
  assert.equal(credentials.projectRef, 'nhawdvqqxscwxbpngaql');
  const key = process.env.AG1_QA_PUBLISHABLE_KEY;
  assert.ok(key);
  const client = createClient(`https://${credentials.projectRef}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
  assert.equal(auth.error, null, 'QA password login failed');
  assert.equal(auth.data.user?.id, credentials.userId);
  const id = randomUUID();
  const checks: string[] = [];
  const port = createFoodLogDeletePort(client as unknown as FoodLogDeleteClient);
  try {
    const inserted = await client.from('food_log').insert({
      id, user_id: credentials.userId, logged_date: '2026-09-12', meal_type: 'snack',
      food_name: `QA Delete Undo witness ${id}`, quantity: 1, unit: 'serving',
      calories: 120, protein_g: 4, carbs_g: 20, fat_g: 3, fiber_g: 2, sugar_g: 5,
      source: 'custom', source_id: `qa-delete-undo:${id}`, qty_g: 100.25,
      qty_input: 1.5, qty_input_unit: 'serving', parse_confidence: 0.75, llm_recognized: false,
    }).select('*').single();
    assert.equal(inserted.error, null, 'Synthetic insert failed');
    const snapshot = inserted.data as FoodLogRowSnapshot;
    assert.equal(Object.keys(snapshot).length, 24);
    assert.equal(await port.deleteOne(id), 'confirmed');
    const absent = await client.from('food_log').select('id').eq('id', id).maybeSingle();
    assert.equal(absent.error, null); assert.equal(absent.data, null);
    assert.equal(await port.restoreOne(snapshot), 'confirmed');
    const restored = await client.from('food_log').select('*').eq('id', id).single();
    assert.equal(restored.error, null); assert.ok(isSamePersistedRow(snapshot, restored.data));
    checks.push('authenticated delete and undo preserve all 24 persisted columns');
    assert.equal(await port.restoreOne(snapshot), 'noop');
    checks.push('identical duplicate restore is verified noop');
    const changed = await client.from('food_log').update({ qty_input: 9.25 }).eq('id', id);
    assert.equal(changed.error, null);
    assert.equal(await port.restoreOne(snapshot), 'unknown');
    const authoritative = await client.from('food_log').select('qty_input').eq('id', id).single();
    assert.equal(Number(authoritative.data?.qty_input), 9.25);
    checks.push('full-row collision is unknown and preserves authoritative quantity');
    const anon = createClient(`https://${credentials.projectRef}.supabase.co`, key, { auth: { persistSession: false } });
    assert.equal(await createFoodLogDeletePort(anon as unknown as FoodLogDeleteClient).deleteOne(id), 'unknown');
    const retained = await client.from('food_log').select('id').eq('id', id).single();
    assert.equal(retained.data?.id, id);
    checks.push('anonymous delete cannot remove authenticated row');
  } finally {
    const cleanup = await client.from('food_log').delete().eq('id', id).eq('user_id', credentials.userId).select('id');
    assert.equal(cleanup.error, null, 'Synthetic row cleanup failed');
    const remaining = await client.from('food_log').select('id').eq('id', id).maybeSingle();
    assert.equal(remaining.error, null); assert.equal(remaining.data, null, 'Synthetic row remains');
    await client.auth.signOut({ scope: 'local' });
  }
  console.log(JSON.stringify({ project: credentials.projectRef, checks, syntheticRowsCleaned: true, providerCalls: 0, browserVerified: false }, null, 2));
}

main().catch(() => { console.error('QA Delete/Undo witness failed; inspect controlled checks without printing credentials.'); process.exitCode = 1; });
