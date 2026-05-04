import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getSession, roleAtLeast } from '@/lib/auth/get-session';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  billing_email: string | null;
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  subscription_status: string;
  plan_limits: unknown;
}

export default async function AdminOrgsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roleAtLeast(session.role, 'admin')) redirect('/dashboard');

  const supabase = createSupabaseServiceClient();
  let orgs: OrgRow[] = [];

  if (session.role === 'super_admin') {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, slug, plan, billing_email, stripe_customer_id, stripe_connect_account_id, subscription_status, plan_limits')
      .order('created_at', { ascending: false });
    orgs = data ?? [];
  } else {
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', session.user.id)
      .in('role', ['admin', 'super_admin']);

    const orgIds = (memberships ?? []).map((row) => row.org_id);
    if (orgIds.length > 0) {
      const { data } = await supabase
        .from('organizations')
        .select('id, name, slug, plan, billing_email, stripe_customer_id, stripe_connect_account_id, subscription_status, plan_limits')
        .in('id', orgIds)
        .order('created_at', { ascending: false });
      orgs = data ?? [];
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-10 text-stone-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#D4A853]">Admin</p>
            <h1 className="text-2xl font-semibold">Organizations</h1>
          </div>
          <Link href="/admin/costs" className="rounded-lg border border-stone-800 px-3 py-2 text-sm text-stone-300 hover:border-[#D4A853]/50">
            AI costs
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-800">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-stone-900 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Org</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-stone-800">
                  <td className="px-4 py-3">
                    <div className="font-medium">{org.name}</div>
                    <div className="text-xs text-stone-500">{org.slug}</div>
                  </td>
                  <td className="px-4 py-3">{org.plan}</td>
                  <td className="px-4 py-3">{org.subscription_status}</td>
                  <td className="px-4 py-3 text-stone-400">{org.billing_email ?? 'Not set'}</td>
                  <td className="px-4 py-3 text-stone-400">
                    {org.stripe_connect_account_id ? 'Connect ready' : org.stripe_customer_id ? 'Customer ready' : 'Not configured'}
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                    No organizations available for this admin account.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
