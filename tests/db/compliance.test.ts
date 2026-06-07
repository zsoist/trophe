import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(join(process.cwd(), 'drizzle/0013_compliance_foundation.sql'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/privacy/requests/route.ts'), 'utf8');

describe('B2B compliance foundation', () => {
  it('adds consent and data request records with RLS', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS consents');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS data_requests');
    expect(migration).toContain('ALTER TABLE consents ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('data_requests_admin_select');
  });

  it('makes the audit log immutable at the database layer', () => {
    expect(migration).toContain('CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log');
    expect(migration).toContain("RAISE EXCEPTION 'audit_log is append-only'");
  });

  it('creates privacy requests server-side and records audit events', () => {
    expect(route).toContain("requireRole(['client', 'coach', 'admin', 'super_admin']");
    expect(route).toContain("service.from('data_requests').insert");
    expect(route).toContain("service.from('audit_log').insert");
    expect(route).toContain('dueAt.setDate(dueAt.getDate() + 30)');
  });
});
