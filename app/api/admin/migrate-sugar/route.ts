/**
 * ONE-TIME migration: adds sugar_g column to food_log and custom_foods.
 * Hit GET /api/admin/migrate-sugar once while logged in as super_admin.
 * Safe to re-run (IF NOT EXISTS).
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const admin = createClient(url, serviceKey);

  const steps = [
    `ALTER TABLE food_log ADD COLUMN IF NOT EXISTS sugar_g REAL`,
    `ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS sugar_g REAL`,
    `COMMENT ON COLUMN food_log.sugar_g IS 'Total sugar in grams per serving'`,
  ];

  const results: { sql: string; ok: boolean; error?: string }[] = [];

  for (const sql of steps) {
    const { error } = await admin.rpc('run_sql', { query: sql }).maybeSingle();
    // rpc might not exist — try direct insert approach as fallback check
    if (error && error.message.includes('run_sql')) {
      // run_sql RPC not available — use the workaround via pg function creation
      results.push({ sql, ok: false, error: 'run_sql RPC not found. Run SQL manually in Supabase dashboard SQL editor.' });
    } else if (error) {
      results.push({ sql, ok: false, error: error.message });
    } else {
      results.push({ sql, ok: true });
    }
  }

  const allOk = results.every(r => r.ok);

  return NextResponse.json({
    success: allOk,
    results,
    manualSQL: allOk ? null : [
      'ALTER TABLE food_log ADD COLUMN IF NOT EXISTS sugar_g REAL;',
      'ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS sugar_g REAL;',
    ],
    note: allOk
      ? 'Migration complete! sugar_g column added to food_log and custom_foods.'
      : 'Auto-migration failed (run_sql RPC not available). Copy the manualSQL above and run it in your Supabase dashboard → SQL editor.',
  });
}
