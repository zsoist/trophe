/**
 * scripts/ingest/embed-foods.ts — Voyage v4 embedding pipeline.
 *
 * Generates 1024-dim embeddings for all foods that have embedding IS NULL.
 * Idempotent: only processes un-embedded rows. Resumable: processes in batches
 * and commits after each batch, so Ctrl-C + rerun continues from last commit.
 *
 * After all embeddings are generated, creates the HNSW index if it doesn't
 * exist (CREATE INDEX CONCURRENTLY is deferred here post-ingest as specified
 * in the migration comment).
 *
 * Model: voyage-4 (1024-dim), matching the governed production embedding policy.
 *
 * Usage:
 *   source ~/.local/secrets/voyage.env
 *   npx tsx scripts/ingest/embed-foods.ts
 *
 *   # Dry run (shows count only, no API calls):
 *   DRY_RUN=1 npx tsx scripts/ingest/embed-foods.ts
 *
 *   # Custom batch size (default 96 — Voyage v4 limit is 128):
 *   BATCH_SIZE=64 npx tsx scripts/ingest/embed-foods.ts
 *
 * Cost estimate: ~$0.06 per 10k foods at voyage-4 pricing ($0.06/1M tokens,
 * ~100 tokens avg per food text).
 */

import { loadEnvConfig } from '@next/env';
import type { Pool as PgPool } from 'pg';
import { invokeVoyageEmbeddingBatch } from '../safety/paid-ai-provider-facade';
import {
  PAID_AI_ENDPOINTS,
  requirePaidAiToolApproval,
  type BeforePaidTransportAttempt,
} from '../safety/require-paid-ai-approval';

// ── Config ──────────────────────────────────────────────────────────────────
const VOYAGE_MODEL   = 'voyage-4';
const DRY_RUN        = process.env.DRY_RUN === '1';
const EMBED_DIMS     = 1024;
if (DRY_RUN) {
  console.log('[embed] DRY_RUN=1 — provider attempts: 0; database reads: 0; database mutations: 0; dotenv loads: 0.');
  process.exit(0);
}
const paidAiApproval = requirePaidAiToolApproval({
  operation: 'ingest-food-embeddings',
  argv: process.argv.slice(2),
  env: process.env,
  endpoints: [PAID_AI_ENDPOINTS.voyageEmbeddings],
});
loadEnvConfig(process.cwd());
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '96');

// ── Text preparation ─────────────────────────────────────────────────────────
/**
 * Build the embedding input text for a food row.
 * Strategy: concatenate all human-readable fields so the embedding captures
 * multilingual synonyms, brand, and context in one vector.
 * Example: "Feta Cheese Φέτα feta cheese greek cheese PDO cheese Greece"
 */
function buildEmbedText(food: {
  nameEn: string;
  nameEl?: string | null;
  nameEs?: string | null;
  brand?: string | null;
  region?: string[] | null;
}): string {
  const parts = [
    food.nameEn,
    food.nameEl,
    food.nameEs,
    food.brand,
    // Region hint helps differentiate regional variants in kNN
    food.region?.join(' '),
  ].filter(Boolean);
  return parts.join(' ').slice(0, 512); // Voyage max input ~10k tokens, 512 chars is safe
}

// ── Voyage API wrapper ───────────────────────────────────────────────────────
async function embedBatch(
  texts: string[],
  beforeTransportAttempt: BeforePaidTransportAttempt,
): Promise<number[][]> {
  const result = await invokeVoyageEmbeddingBatch({
    model: VOYAGE_MODEL,
    texts,
    inputType: 'document',
    signal: new AbortController().signal,
    beforeTransportAttempt,
  });
  const sorted = result.output
    .sort((a, b) => a.index - b.index);

  // Validate dimensions
  for (const item of sorted) {
    if (item.embedding.length !== EMBED_DIMS) {
      throw new Error(`Unexpected embedding dims: ${item.embedding.length} (expected ${EMBED_DIMS})`);
    }
  }

  return sorted.map(i => i.embedding);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const approval = paidAiApproval;
  const voyageApiKey = process.env.VOYAGE_API_KEY;
  if (!voyageApiKey) {
    throw new Error('VOYAGE_API_KEY is required');
  }
  if (!Number.isSafeInteger(BATCH_SIZE) || BATCH_SIZE <= 0 || BATCH_SIZE > 128) {
    throw new Error('Embedding batch size must be an integer from 1 to 128');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required. See .env.local.example.');
  }
  const [{ drizzle }, { Pool }, { foods }, { sql }] = await Promise.all([
    import('drizzle-orm/node-postgres'),
    import('pg'),
    import('../../db/schema/foods'),
    import('drizzle-orm'),
  ]);
  const pool = new Pool({ connectionString: dbUrl, max: 3 });
  const db = drizzle(pool);

  // Count un-embedded rows
  // Note: embedding is a raw SQL column (pgvector), not in Drizzle schema
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(foods)
    .where(sql`embedding IS NULL`);

  console.log(`[embed] Found ${count} foods without embeddings.`);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Unembedded food count is not safely bounded');
  }
  if (count === 0) {
    console.log('[embed] All foods already embedded. Checking HNSW index...');
    await ensureHnswIndex(pool);
    await pool.end();
    return;
  }

  let processed = 0;
  const totalBatches = Math.ceil(count / BATCH_SIZE);
  const batchSlots = approval.boundJobs(
    Array.from(
      { length: Math.min(totalBatches, approval.maxCalls) },
      (_, index) => index,
    ),
  );

  for (let batchIndex = 0; batchIndex < batchSlots.length; batchIndex++) {
    // Fetch a batch of un-embedded foods
    const batch = await db
      .select({
        id:     foods.id,
        nameEn: foods.nameEn,
        nameEl: foods.nameEl,
        nameEs: foods.nameEs,
        brand:  foods.brand,
        region: foods.region,
      })
      .from(foods)
      .where(sql`embedding IS NULL`)
      .limit(BATCH_SIZE)
      .offset(0); // Always offset 0 — we process and update, so the set shrinks

    if (batch.length === 0) break;

    const texts = batch.map(buildEmbedText);
    let embeddings: number[][];

    try {
      embeddings = await embedBatch(texts, approval.beforeTransportAttempt);
    } catch (err) {
      console.error(`[embed] Voyage error on batch starting at row ${processed}:`, err);
      console.error('[embed] Partial progress committed. Rerun to continue.');
      await pool.end();
      process.exit(1);
    }

    // Update each food with its embedding vector
    // Note: we use raw SQL here because Drizzle doesn't have a native vector update helper
    for (let i = 0; i < batch.length; i++) {
      const vectorLiteral = `[${embeddings[i].join(',')}]`;
      await db.execute(
        sql`UPDATE foods SET embedding = ${vectorLiteral}::vector WHERE id = ${batch[i].id}`
      );
    }

    processed += batch.length;
    const pct = Math.round((processed / count) * 100);
    console.log(`[embed] ${processed}/${count} (${pct}%) — last: "${batch[batch.length - 1].nameEn}"`);

    // Brief pause to avoid hitting rate limits
    await sleep(100);
  }

  console.log(`\n[embed] Approved embedding batches complete. Total: ${processed}`);

  // Build HNSW index post-ingest
  if (processed >= count) await ensureHnswIndex(pool);
  await pool.end();
}

async function ensureHnswIndex(pool: PgPool) {
  const client = await pool.connect();
  try {
    // Check if index exists
    const { rows } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'foods' AND indexname = 'idx_foods_embedding'
    `);
    if (rows.length > 0) {
      console.log('[embed] HNSW index idx_foods_embedding already exists. ✅');
      return;
    }

    console.log('[embed] Building HNSW index (this may take a few minutes for large datasets)...');
    // ef_construction=128 is the recommended default for <1M rows
    // Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
    // so we use autocommit mode via direct pool client
    await client.query(`
      SET maintenance_work_mem = '512MB';
      CREATE INDEX IF NOT EXISTS idx_foods_embedding
        ON foods USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 128);
    `);
    console.log('[embed] ✅ HNSW index built.');
  } finally {
    client.release();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch((err) => { console.error(err); process.exit(1); });
