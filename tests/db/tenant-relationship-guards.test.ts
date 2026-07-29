import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('tenant relationship mutation guards', () => {
  it('binds client message inserts to the assigned coach', () => {
    const migration = readFileSync(
      join(process.cwd(), 'drizzle/0064_tenant_relationship_guards.sql'),
      'utf8',
    );

    expect(migration).toContain('DROP POLICY IF EXISTS messages_client_insert');
    expect(migration).toContain('cp.user_id = (SELECT auth.uid())');
    expect(migration).toContain('cp.coach_id = messages.coach_id');
  });

  it('makes appointment cancellation metadata server-authoritative', () => {
    const migration = readFileSync(
      join(process.cwd(), 'drizzle/0064_tenant_relationship_guards.sql'),
      'utf8',
    );

    expect(migration).toContain('OLD.status IS DISTINCT FROM');
    expect(migration).toContain("NEW.cancelled_by := 'client'");
    expect(migration).toContain('NEW.cancelled_at := statement_timestamp()');
    expect(migration).toContain(
      "NEW.late_cancellation := OLD.starts_at < statement_timestamp() + interval '24 hours'",
    );
    expect(migration).toContain('CREATE TRIGGER appointments_guard_client_cancel');
  });
});
