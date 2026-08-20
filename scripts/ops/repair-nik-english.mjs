import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseRepairArguments, runEnglishRepair } from './repair-nik-english-core.mjs';

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function createRepairAdapter(client) {
  const checked = async (query, label) => {
    const { data, error } = await query;
    if (error) throw new Error(`${label} failed: ${error.code ?? 'database_error'}`);
    return data ?? [];
  };

  return {
    findProfiles: ({ userId, email }) => checked(
      client
        .from('profiles')
        .select('id,email,full_name,language')
        .eq(userId ? 'id' : 'email', userId ?? email)
        .limit(2),
      'Profile lookup',
    ),
    listMealPlanEntries: (userId) => checked(
      client
        .from('meal_plan_entries')
        .select('id,client_id,day_of_week,meal_slot,description')
        .eq('client_id', userId)
        .order('day_of_week')
        .order('meal_slot'),
      'Meal-plan lookup',
    ),
    updateProfileLanguage: async (userId, language) => {
      const rows = await checked(
        client.from('profiles').update({ language }).eq('id', userId).select('id'),
        'Profile update',
      );
      return rows.map((row) => row.id);
    },
    updateMealPlanEntry: async ({ rowId, userId, description }) => {
      const rows = await checked(
        client
          .from('meal_plan_entries')
          .update({ description })
          .eq('id', rowId)
          .eq('client_id', userId)
          .select('id'),
        `Meal-plan update ${rowId}`,
      );
      return rows.map((row) => row.id);
    },
    verifyProfile: async (userId) => {
      const rows = await checked(
        client.from('profiles').select('id,email,full_name,language').eq('id', userId).limit(1),
        'Profile verification',
      );
      return rows[0] ?? null;
    },
    verifyMealPlanEntries: (userId) => checked(
      client
        .from('meal_plan_entries')
        .select('id,client_id,day_of_week,meal_slot,description')
        .eq('client_id', userId)
        .order('day_of_week')
        .order('meal_slot'),
      'Meal-plan verification',
    ),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseRepairArguments(argv);
  const mapping = JSON.parse(await readFile(args.mappingPath, 'utf8'));
  const url = process.env.SUPABASE_URL?.trim() || requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await runEnglishRepair({
    adapter: createRepairAdapter(client),
    selector: args.selector,
    mapping,
    apply: args.apply,
    backupDirectory: args.backupDirectory ?? tmpdir(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Nik English repair failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
