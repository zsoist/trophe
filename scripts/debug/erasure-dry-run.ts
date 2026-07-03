import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

/**
 * READ-ONLY erasure dry-run — counts what Art. 17 erasure WOULD touch for one
 * client (first client by default, or pass a user id). Zero writes.
 *
 *   npx tsx scripts/debug/erasure-dry-run.ts [userId]
 */
import { eraseUser } from '../../lib/privacy/erasure';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );
  let userId = process.argv[2];
  let label = userId;
  if (!userId) {
    const { data: clients } = await svc.from('profiles').select('id, full_name').eq('role', 'client').limit(1);
    if (!clients?.length) { console.log('no client accounts found'); return; }
    userId = clients[0].id;
    label = clients[0].full_name;
  }
  const r = await eraseUser(userId, { dryRun: true });
  console.log(`subject: ${label} | role: ${r.role} | dryRun: ${r.dryRun}`);
  console.log('counts:', JSON.stringify(r.counts, null, 1));
  console.log('errors:', r.errors);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
