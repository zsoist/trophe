import { resolveDbConfig, withPool, writeArtifact } from '../db/_shared';

const minimumFoods = Number(process.env.FOOD_MINIMUM_ROWS ?? '100');
const minimumAuthoritativeRate = Number(process.env.FOOD_MIN_AUTHORITATIVE_RATE ?? '0.5');
const minimumAuthoritativeRows = Number(
  process.env.FOOD_MIN_AUTHORITATIVE_ROWS ?? minimumFoods,
);
const maximumInvalidMacros = Number(process.env.FOOD_MAX_INVALID_MACROS ?? '0');
const maximumMissingEmbeddings = Number(process.env.FOOD_MAX_MISSING_EMBEDDINGS ?? '0');

withPool(resolveDbConfig(), async (pool) => {
  const result = await pool.query<{
    total: string;
    authoritative: string;
    curated: string;
    reviewed: string;
    canonical: string;
    bootstrap_fixtures: string;
    missing_embeddings: string;
    invalid_macros: string;
    low_confidence: string;
  }>(`
    SELECT
      count(*)::text AS total,
      count(*) FILTER (WHERE data_quality IN ('lab_verified', 'label'))::text AS authoritative,
      count(*) FILTER (WHERE data_quality <> 'crowdsourced')::text AS curated,
      count(*) FILTER (WHERE data_reviewed_at IS NOT NULL OR verified = 'manual')::text AS reviewed,
      count(*) FILTER (WHERE canonical_food_key IS NOT NULL)::text AS canonical,
      count(*) FILTER (WHERE source_id LIKE 'wp2-seed-%')::text AS bootstrap_fixtures,
      count(*) FILTER (WHERE embedding IS NULL AND source_id NOT LIKE 'wp2-seed-%')::text AS missing_embeddings,
      count(*) FILTER (
        WHERE kcal_per_100g < 0 OR protein_per_100g < 0 OR carb_per_100g < 0 OR fat_per_100g < 0
          OR protein_per_100g + carb_per_100g + fat_per_100g > 115
      )::text AS invalid_macros,
      count(*) FILTER (WHERE macro_confidence < 0.5)::text AS low_confidence
    FROM foods
  `);
  const sources = await pool.query<{ source: string; count: string }>(
    'SELECT source::text, count(*)::text FROM foods GROUP BY source ORDER BY count(*) DESC',
  );
  const row = result.rows[0];
  const report = {
    total: Number(row.total),
    authoritative: Number(row.authoritative),
    authoritativeRate: Number(row.total) ? Number(row.authoritative) / Number(row.total) : 0,
    curated: Number(row.curated),
    curatedAuthoritativeRate: Number(row.curated)
      ? Number(row.authoritative) / Number(row.curated)
      : 0,
    reviewed: Number(row.reviewed),
    canonical: Number(row.canonical),
    bootstrapFixtures: Number(row.bootstrap_fixtures),
    missingEmbeddings: Number(row.missing_embeddings),
    invalidMacros: Number(row.invalid_macros),
    lowConfidence: Number(row.low_confidence),
    sources: Object.fromEntries(sources.rows.map((item) => [item.source, Number(item.count)])),
    failures: [] as string[],
  };
  if (report.total < minimumFoods) report.failures.push(`${report.total} food rows is below minimum ${minimumFoods}`);
  if (report.authoritative < minimumAuthoritativeRows) {
    report.failures.push(`${report.authoritative} authoritative food rows is below minimum ${minimumAuthoritativeRows}`);
  }
  if (report.curatedAuthoritativeRate < minimumAuthoritativeRate) {
    report.failures.push(`curated authoritative rate ${(report.curatedAuthoritativeRate * 100).toFixed(1)}% is below ${(minimumAuthoritativeRate * 100).toFixed(1)}%`);
  }
  if (report.invalidMacros > maximumInvalidMacros) report.failures.push(`${report.invalidMacros} food rows have invalid macros`);
  if (report.missingEmbeddings > maximumMissingEmbeddings) report.failures.push(`${report.missingEmbeddings} food rows are missing embeddings`);

  writeArtifact('food-readiness.json', JSON.stringify(report, null, 2));
  if (report.failures.length) throw new Error(report.failures.join('; '));
  console.log(
    `Food readiness passed: ${report.total} foods, ${report.authoritative} authoritative `
    + `(${(report.curatedAuthoritativeRate * 100).toFixed(1)}% of curated; `
    + `${(report.authoritativeRate * 100).toFixed(1)}% overall), ${report.reviewed} reviewed.`,
  );
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
