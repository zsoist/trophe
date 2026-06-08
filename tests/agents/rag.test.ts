import { describe, expect, it } from 'vitest';
import { chunkKnowledge } from '@/agents/rag/ingest';
import { formatRagContext } from '@/agents/rag/context';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('RAG ingestion and context contracts', () => {
  it('chunks deterministically while preserving all content', () => {
    const content = ['First paragraph.', 'Second paragraph is longer.', 'Third paragraph.'].join('\n\n');
    const first = chunkKnowledge(content, 35);
    const second = chunkKnowledge(content, 35);

    expect(first).toEqual(second);
    expect(first.join('\n\n')).toBe(content);
    expect(first.every((chunk) => chunk.length <= 35)).toBe(true);
  });

  it('formats citation IDs, source timestamps, and approved context', () => {
    const block = formatRagContext([{
      id: 'chunk-1',
      documentId: 'document-1',
      documentTitle: 'Nutrition Protocol',
      source: 'coach_protocol',
      content: 'Prioritize the approved protein target.',
      createdAt: new Date('2026-06-07T00:00:00Z'),
      score: 0.03,
    }]);

    expect(block).toContain('[chunk-1]');
    expect(block).toContain('coach_protocol');
    expect(block).toContain('2026-06-07T00:00:00.000Z');
    expect(block).toContain('Prioritize the approved protein target.');
  });

  it('returns no context when retrieval has no approved chunks', () => {
    expect(formatRagContext([])).toBe('');
  });

  it('requires explicit provenance and scope-safe operator ingestion', () => {
    const cli = readFileSync(join(process.cwd(), 'scripts/rag/ingest-document.ts'), 'utf8');
    expect(cli).toContain("'created-by'");
    expect(cli).toContain('Specify only one private scope');
    expect(cli).toContain('Document already exists in this scope');
    expect(cli).toContain('Only reviewed .md and .txt documents may be ingested');
    expect(cli).toContain("args['dry-run']");
  });
});
