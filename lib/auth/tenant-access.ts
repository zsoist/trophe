import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { clientProfiles } from '@/db/schema/profiles';
import { db as dbType } from '@/db/client';
import type { UserRole } from './get-session';

type Db = typeof dbType;

export function clientAccessPredicate(actorId: string, role: UserRole) {
  if (role === 'super_admin') return sql`true`;

  if (role === 'admin') {
    return sql`EXISTS (
      SELECT 1
      FROM organization_members actor_org
      JOIN organization_members client_org ON client_org.org_id = actor_org.org_id
      WHERE actor_org.user_id = ${actorId}::uuid
        AND actor_org.role IN ('admin', 'super_admin')
        AND client_org.user_id = ${clientProfiles.userId}
    )`;
  }

  return eq(clientProfiles.coachId, actorId);
}

export async function assertCanAccessClient(
  db: Db,
  actorId: string,
  role: UserRole,
  clientId: string,
): Promise<void> {
  const [row] = await db
    .select({ userId: clientProfiles.userId })
    .from(clientProfiles)
    .where(and(eq(clientProfiles.userId, clientId), clientAccessPredicate(actorId, role)))
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Client not accessible for this role or organization',
    });
  }
}
