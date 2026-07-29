import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('chat attachment orphan cleanup policy', () => {
  const migration = readFileSync(
    join(process.cwd(), 'drizzle/0061_chat_attachment_orphan_cleanup.sql'),
    'utf8',
  );

  it('is guarded for plain Postgres and scoped to authenticated deletes', () => {
    expect(migration).toMatch(
      /FROM information_schema\.schemata\s+WHERE schema_name = 'storage'/,
    );
    expect(migration).toContain(
      'CREATE POLICY "chat uploader delete orphan" ON storage.objects',
    );
    expect(migration).toContain('FOR DELETE TO authenticated');
  });

  it('allows only the uploader to delete an unreferenced chat object', () => {
    expect(migration).toContain("bucket_id = 'chat-attachments'");
    expect(migration).toContain(
      "owner_id = (SELECT auth.uid())::text",
    );
    expect(migration).toContain('NOT EXISTS');
    expect(migration).toContain(
      'm.attachment_path = storage.objects.name',
    );
  });
});
