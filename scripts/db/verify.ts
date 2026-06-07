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
          'dish_recipes', 'memory_chunks', 'wearable_data', 'agent_runs',
          'knowledge_documents', 'knowledge_chunks', 'consents', 'data_requests'
        )
      ORDER BY table_name;
    `,
    expected: [
      'agent_runs',
      'audit_log',
      'client_profiles',
      'consents',
      'data_requests',
      'dish_recipes',
      'food_log',
      'food_unit_conversions',
      'foods',
      'memory_chunks',
      'knowledge_chunks',
      'knowledge_documents',
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
          'profiles_own_select',
          'food_log_own_all',
          'organization_members_own_select',
          'organizations_member_select',
          'audit_log_super_admin_select'
        )
      ORDER BY policyname;
    `,
    expected: [
      'audit_log_super_admin_select',
      'food_log_own_all',
      'organization_members_own_select',
      'organizations_member_select',
      'profiles_own_select',
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
        ('private', 'is_super_admin'),
        ('private', 'is_admin_of'),
        ('private', 'is_coach_of'),
        ('public', 'memory_decay_salience'),
        ('public', 'hybrid_search_knowledge'),
        ('public', 'prevent_audit_log_mutation')
      )
      ORDER BY 1;
    `,
    expected: [
      'auth.role',
      'auth.uid',
      'private.is_admin_of',
      'private.is_coach_of',
      'private.is_super_admin',
      'public.memory_decay_salience',
      'public.hybrid_search_knowledge',
      'public.prevent_audit_log_mutation',
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
          'idx_wd_user_type_recorded',
          'idx_kc_fts',
          'idx_kc_embedding'
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
      'idx_kc_embedding',
      'idx_kc_fts',
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
      AND table_name IN ('foods', 'memory_chunks', 'knowledge_chunks')
    ORDER BY table_name;
  `);

  if (embeddingColumns.rowCount !== 3 || embeddingColumns.rows.some((row) => row.udt_name !== 'vector')) {
    throw new Error('embedding columns are missing or not typed as vector');
  }

  report.embedding_columns = embeddingColumns.rows.map((row) => `${row.table_name}:${row.udt_name}`);

  const governedRunColumns = await pool.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_runs'
      AND column_name IN (
        'generation_id', 'status', 'prompt_version', 'prompt_hash',
        'provider_generation_id', 'estimated_cost_usd', 'actual_cost_usd',
        'organization_id', 'metadata', 'completed_at'
      )
    ORDER BY column_name;
  `);
  const expectedRunColumns = [
    'actual_cost_usd', 'completed_at', 'estimated_cost_usd', 'generation_id',
    'metadata', 'organization_id', 'prompt_hash', 'prompt_version',
    'provider_generation_id', 'status',
  ];
  const missingRunColumns = expectedRunColumns.filter((column) =>
    !governedRunColumns.rows.some((row) => row.column_name === column),
  );
  if (missingRunColumns.length) throw new Error(`agent_runs missing governed columns: ${missingRunColumns.join(', ')}`);
  report.agent_runs_governance = expectedRunColumns;

  const immutableAudit = await pool.query<{ tgname: string }>(`
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.audit_log'::regclass
      AND NOT tgisinternal
      AND tgname = 'audit_log_immutable';
  `);
  if (immutableAudit.rowCount !== 1) throw new Error('audit_log immutable trigger missing');
  report.audit_immutability = ['audit_log_immutable'];

  const unsafeRls = await pool.query<{ table_name: string }>(`
    SELECT tablename AS table_name
    FROM pg_tables
    WHERE schemaname = 'public' AND NOT rowsecurity
    UNION ALL
    SELECT tablename || ':' || policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND (
        (cmd <> 'INSERT' AND qual IS NULL)
        OR (cmd IN ('INSERT', 'UPDATE', 'ALL') AND with_check IS NULL)
      )
    ORDER BY 1;
  `);
  if (unsafeRls.rowCount !== 0) {
    throw new Error(`unsafe RLS posture: ${unsafeRls.rows.map((row) => row.table_name).join(', ')}`);
  }
  report.rls_posture = ['all_public_tables_enabled', 'all_permissive_policies_predicated'];

  writeArtifact('verify.json', JSON.stringify(report, null, 2));
  console.log('Verified DB schema, policies, functions, and index inventory.');
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
