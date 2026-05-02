import { writeArtifact, resolveDbConfig, withPool } from './_shared';

type Expectation = {
  label: string;
  sql: string;
  expected: string[];
};

const config = resolveDbConfig();

const expectations: Expectation[] = [
  {
    label: 'extensions',
    sql: `
      SELECT extname
      FROM pg_extension
      WHERE extname IN ('vector', 'pg_trgm', 'pgcrypto')
      ORDER BY extname;
    `,
    expected: ['pg_trgm', 'pgcrypto', 'vector'],
  },
  {
    label: 'tables',
    sql: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'profiles', 'client_profiles', 'food_log', 'organizations',
          'organization_members', 'audit_log', 'foods', 'food_unit_conversions',
          'memory_chunks', 'wearable_data', 'agent_runs'
        )
      ORDER BY table_name;
    `,
    expected: [
      'agent_runs',
      'audit_log',
      'client_profiles',
      'food_log',
      'food_unit_conversions',
      'foods',
      'memory_chunks',
      'organization_members',
      'organizations',
      'profiles',
      'wearable_data',
    ],
  },
  {
    label: 'policies',
    sql: `
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname IN (
          'Users can view own profile',
          'Clients manage own food log',
          'Members view own membership',
          'Org members can view own org',
          'Super admins read audit log'
        )
      ORDER BY policyname;
    `,
    expected: [
      'Clients manage own food log',
      'Members view own membership',
      'Org members can view own org',
      'Super admins read audit log',
      'Users can view own profile',
    ],
  },
  {
    label: 'functions',
    sql: `
      SELECT n.nspname || '.' || p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname, p.proname) IN (
        ('auth', 'uid'),
        ('auth', 'role'),
        ('public', 'is_super_admin'),
        ('public', 'is_admin_of'),
        ('public', 'is_coach_of'),
        ('public', 'memory_decay_salience')
      )
      ORDER BY 1;
    `,
    expected: [
      'auth.role',
      'auth.uid',
      'public.is_admin_of',
      'public.is_coach_of',
      'public.is_super_admin',
      'public.memory_decay_salience',
    ],
  },
  {
    label: 'indexes',
    sql: `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_food_log_user_date',
          'idx_org_members_org',
          'idx_org_members_user',
          'idx_foods_search',
          'idx_foods_embedding',
          'idx_mc_user_scope_active',
          'idx_mc_user_scope_active_embed',
          'idx_mc_embedding',
          'idx_wd_user_type_recorded'
        )
      ORDER BY indexname;
    `,
    expected: [
      'idx_food_log_user_date',
      'idx_foods_embedding',
      'idx_foods_search',
      'idx_mc_embedding',
      'idx_mc_user_scope_active',
      'idx_mc_user_scope_active_embed',
      'idx_org_members_org',
      'idx_org_members_user',
      'idx_wd_user_type_recorded',
    ],
  },
];

withPool(config, async (pool) => {
  const report: Record<string, string[]> = {};

  for (const expectation of expectations) {
    const result = await pool.query<{ [key: string]: string }>(expectation.sql);
    const values = result.rows.map((row) => Object.values(row)[0]);
    report[expectation.label] = values;

    const missing = expectation.expected.filter((item) => !values.includes(item));
    if (missing.length > 0) {
      throw new Error(`${expectation.label}: missing ${missing.join(', ')}`);
    }
  }

  const embeddingColumns = await pool.query<{
    table_name: string;
    udt_name: string;
  }>(`
    SELECT table_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'embedding'
      AND table_name IN ('foods', 'memory_chunks')
    ORDER BY table_name;
  `);

  if (embeddingColumns.rowCount !== 2 || embeddingColumns.rows.some((row) => row.udt_name !== 'vector')) {
    throw new Error('embedding columns are missing or not typed as vector');
  }

  report.embedding_columns = embeddingColumns.rows.map((row) => `${row.table_name}:${row.udt_name}`);
  writeArtifact('verify.json', JSON.stringify(report, null, 2));
  console.log('Verified DB schema, policies, functions, and index inventory.');
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
