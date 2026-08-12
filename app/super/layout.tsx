import { redirect } from 'next/navigation';
import Providers from '@/components/shared/Providers';
import { getSession } from '@/lib/auth/get-session';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'super_admin') redirect('/dashboard');
  return (
    <Providers>
      <AdminShell
        title="Operations"
        eyebrow="Super admin"
        actions={(
          <Link href="/admin/orgs" className="hidden hover:text-[var(--content-primary)] sm:inline-flex">
            Administration
          </Link>
        )}
      >
        {children}
      </AdminShell>
    </Providers>
  );
}
