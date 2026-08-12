import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getSession, roleAtLeast } from "@/lib/auth/get-session";

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

function BillingStatus({ org }: { org: OrgRow }) {
  return (
    <>
      {org.stripe_connect_account_id
        ? "Connect ready"
        : org.stripe_customer_id
          ? "Customer ready"
          : "Not configured"}
    </>
  );
}

export default async function AdminOrgsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roleAtLeast(session.role, "admin")) redirect("/dashboard");
  const supabase = createSupabaseServiceClient();
  let orgs: OrgRow[] = [];

  if (session.role === "super_admin") {
    const { data } = await supabase
      .from("organizations")
      .select(
        "id, name, slug, plan, billing_email, stripe_customer_id, stripe_connect_account_id, subscription_status, plan_limits",
      )
      .order("created_at", { ascending: false });
    orgs = data ?? [];
  } else {
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", session.user.id)
      .in("role", ["admin", "super_admin"]);
    const orgIds = (memberships ?? []).map((row) => row.org_id);
    if (orgIds.length) {
      const { data } = await supabase
        .from("organizations")
        .select(
          "id, name, slug, plan, billing_email, stripe_customer_id, stripe_connect_account_id, subscription_status, plan_limits",
        )
        .in("id", orgIds)
        .order("created_at", { ascending: false });
      orgs = data ?? [];
    }
  }

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-8 text-[var(--content-primary)]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--action-primary)]">
              Admin
            </p>
            <h1 className="text-2xl font-semibold">Organizations</h1>
          </div>
          <Link
            href="/admin/costs"
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-default)] px-4 text-sm text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            AI costs
          </Link>
        </header>

        <div data-admin-org-mobile-cards className="space-y-3 md:hidden">
          {orgs.map((org) => (
            <article
              key={org.id}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-low)]"
            >
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--content-muted)]">
                    Org
                  </dt>
                  <dd className="mt-1 break-words font-medium">
                    {org.name}
                    <span className="ml-2 break-all font-mono text-xs text-[var(--content-secondary)]">
                      {org.slug}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--content-muted)]">
                    Plan
                  </dt>
                  <dd className="mt-1">{org.plan}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--content-muted)]">
                    Subscription
                  </dt>
                  <dd className="mt-1">
                    <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-surface)] px-2 py-1 text-xs text-[var(--status-info-fg)]">
                      {org.subscription_status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--content-muted)]">
                    Billing
                  </dt>
                  <dd className="mt-1 break-all text-[var(--content-secondary)]">
                    {org.billing_email ?? "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--content-muted)]">
                    Status
                  </dt>
                  <dd className="mt-1 text-[var(--content-secondary)]">
                    <BillingStatus org={org} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--content-muted)]">
                    Actions
                  </dt>
                  <dd className="mt-1">
                    <Link
                      href="/admin/costs"
                      className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-default)] px-3 text-sm text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                      View AI costs
                    </Link>
                  </dd>
                </div>
              </dl>
            </article>
          ))}
          {!orgs.length && (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-8 text-center text-sm text-[var(--content-secondary)]">
              No organizations available for this admin account.
            </div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)]">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--content-muted)]">
              <tr>
                <th className="px-4 py-3">Org</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className="border-t border-[var(--border-subtle)]"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{org.name}</div>
                    <div className="break-all font-mono text-xs text-[var(--content-secondary)]">
                      {org.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3">{org.plan}</td>
                  <td className="px-4 py-3">{org.subscription_status}</td>
                  <td className="break-all px-4 py-3 text-[var(--content-secondary)]">
                    {org.billing_email ?? "Not set"}
                  </td>
                  <td className="px-4 py-3 text-[var(--content-secondary)]">
                    <BillingStatus org={org} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href="/admin/costs"
                      className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                      AI costs
                    </Link>
                  </td>
                </tr>
              ))}
              {!orgs.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-[var(--content-secondary)]"
                  >
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
