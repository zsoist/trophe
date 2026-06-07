import type { RagChunk } from './retrieve';

export function formatRagContext(chunks: RagChunk[]): string {
  if (chunks.length === 0) return '';
  return [
    '## Approved Knowledge Context',
    'Use only when relevant. Cite claims with the supplied citation IDs.',
    ...chunks.map((chunk) => `[${chunk.id}] ${chunk.documentTitle} (${chunk.source}, ${chunk.createdAt.toISOString()}):\n${chunk.content}`),
  ].join('\n\n');
}
