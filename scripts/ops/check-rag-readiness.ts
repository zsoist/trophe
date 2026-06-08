import { resolveDbConfig, withPool, writeArtifact } from '../db/_shared';

const requireContent = process.env.RAG_REQUIRE_CONTENT === '1';
const maxProcessingMinutes = Number(process.env.RAG_MAX_PROCESSING_MINUTES ?? '30');

withPool(resolveDbConfig(), async (pool) => {
  const result = await pool.query<{
    documents: string;
    ready_documents: string;
    failed_documents: string;
    stale_processing_documents: string;
    chunks: string;
    missing_embeddings: string;
    orphan_chunks: string;
  }>(`
    SELECT
      (SELECT count(*) FROM knowledge_documents WHERE status <> 'tombstoned')::text AS documents,
      (SELECT count(*) FROM knowledge_documents WHERE status = 'ready')::text AS ready_documents,
      (SELECT count(*) FROM knowledge_documents WHERE status = 'failed')::text AS failed_documents,
      (SELECT count(*) FROM knowledge_documents
        WHERE status IN ('pending', 'processing')
          AND updated_at < NOW() - ($1::text || ' minutes')::interval)::text AS stale_processing_documents,
      (SELECT count(*) FROM knowledge_chunks)::text AS chunks,
      (SELECT count(*) FROM knowledge_chunks WHERE embedding IS NULL)::text AS missing_embeddings,
      (SELECT count(*) FROM knowledge_chunks c
        LEFT JOIN knowledge_documents d ON d.id = c.document_id
        WHERE d.id IS NULL)::text AS orphan_chunks
  `, [maxProcessingMinutes]);

  const row = result.rows[0];
  const report = {
    requireContent,
    documents: Number(row.documents),
    readyDocuments: Number(row.ready_documents),
    failedDocuments: Number(row.failed_documents),
    staleProcessingDocuments: Number(row.stale_processing_documents),
    chunks: Number(row.chunks),
    missingEmbeddings: Number(row.missing_embeddings),
    orphanChunks: Number(row.orphan_chunks),
    failures: [] as string[],
  };

  if (requireContent && (report.readyDocuments === 0 || report.chunks === 0)) {
    report.failures.push('RAG has no ready documents/chunks');
  }
  if (report.failedDocuments > 0) report.failures.push(`${report.failedDocuments} failed RAG document(s)`);
  if (report.staleProcessingDocuments > 0) report.failures.push(`${report.staleProcessingDocuments} stale RAG ingestion(s)`);
  if (report.missingEmbeddings > 0) report.failures.push(`${report.missingEmbeddings} chunk(s) missing embeddings`);
  if (report.orphanChunks > 0) report.failures.push(`${report.orphanChunks} orphan chunk(s)`);

  writeArtifact('rag-readiness.json', JSON.stringify(report, null, 2));
  if (report.failures.length) throw new Error(report.failures.join('; '));
  console.log(`RAG readiness passed: ${report.readyDocuments} ready documents, ${report.chunks} embedded chunks.`);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
