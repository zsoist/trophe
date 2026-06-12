import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'super_admin') redirect('/dashboard');
  return <>{children}</>;
}
