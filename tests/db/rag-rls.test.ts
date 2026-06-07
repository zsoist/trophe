import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(path.join(process.cwd(), 'drizzle/0011_permission_aware_rag.sql'), 'utf8');

describe('permission-aware RAG migration invariants', () => {
  it('enables RLS on documents and chunks', () => {
    expect(migration).toContain('ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY');
  });

  it('enforces ownership, coach assignment, and organization membership', () => {
    expect(migration).toContain('private.is_coach_of(user_id)');
    expect(migration).toContain('organization_members');
    expect(migration).toContain('om.user_id = requester_id');
    expect(migration).toContain('requester_id = subject_user_id');
    expect(migration).toContain('cp.coach_id = requester_id');
    expect(migration).toContain("p.role = 'super_admin'");
  });

  it('uses hybrid keyword and vector retrieval with reciprocal rank fusion', () => {
    expect(migration).toContain('websearch_to_tsquery');
    expect(migration).toContain('embedding <=> query_embedding');
    expect(migration).toContain('1.0 / (60 + k.rank)');
    expect(migration).toContain('1.0 / (60 + s.rank)');
  });
});
