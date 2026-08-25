import type { ReactNode } from "react";
import { InstallCard } from "@/components/shared/InstallCard";
import Providers from "@/components/shared/Providers";
import { TRPCProvider } from "@/lib/trpc/provider";
import { AppHeader } from "@/components/shared/AppHeader";
import { ClientShell } from "@/components/shared/ClientShell";

/**
 * Dashboard layout — wraps all /dashboard/* routes.
 * Mounts the PWA InstallCard (client component) which self-hides
 * when already installed or dismissed.
 *
 * TRPCProvider enables tRPC hooks on client dashboard pages
 * (first consumer: workouts.program.mine on /dashboard/workout).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <TRPCProvider>
        <AppHeader title="Trophē" eyebrow="Client" />
        <ClientShell>
          <div id="main-content" tabIndex={-1} className="outline-none">
            <InstallCard />
            {children}
          </div>
        </ClientShell>
      </TRPCProvider>
    </Providers>
  );
}
