import { writeArtifact, resolveDbConfig, withPool } from './_shared';

const config = resolveDbConfig();

const plans = [
  {
    name: 'food_log_by_user_date',
    sql: `
      EXPLAIN (FORMAT JSON)
      SELECT id, food_name, logged_date
      FROM food_log
      WHERE user_id = 'f0000000-0000-0000-0000-000000000004'::uuid
        AND logged_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE
      ORDER BY logged_date DESC;
    `,
  },
  {
    name: 'organization_members_by_org',
    sql: `
      EXPLAIN (FORMAT JSON)
      SELECT user_id, role
      FROM organization_members
      WHERE org_id = 'e0000000-0000-0000-0000-000000000001'::uuid;
    `,
  },
  {
    name: 'foods_full_text_lookup',
    sql: `
      EXPLAIN (FORMAT JSON)
      SELECT id, name_en
      FROM foods
      WHERE search_text @@ plainto_tsquery('simple', 'banana')
      ORDER BY popularity DESC
      LIMIT 10;
    `,
  },
  {
    name: 'memory_chunks_by_scope',
    sql: `
      EXPLAIN (FORMAT JSON)
      SELECT id, fact_text
      FROM memory_chunks
      WHERE user_id = 'f0000000-0000-0000-0000-000000000004'::uuid
        AND scope = 'user'
        AND active = true
      ORDER BY salience DESC
      LIMIT 12;
    `,
  },
  {
    name: 'wearable_data_by_user_type_date',
    sql: `
      EXPLAIN (FORMAT JSON)
      SELECT id, recorded_at, value_numeric
      FROM wearable_data
      WHERE user_id = 'f0000000-0000-0000-0000-000000000004'::uuid
        AND data_type = 'steps'
        AND recorded_at >= NOW() - INTERVAL '30 days'
      ORDER BY recorded_at DESC;
    `,
  },
];

withPool(config, async (pool) => {
  const report: Record<string, unknown> = {};

  for (const plan of plans) {
    const result = await pool.query(plan.sql);
    report[plan.name] = result.rows[0]['QUERY PLAN'];
  }

  writeArtifact('explain-plans.json', JSON.stringify(report, null, 2));
  console.log('Wrote EXPLAIN plans to artifacts/db/explain-plans.json');
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
