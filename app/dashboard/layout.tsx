import type { ReactNode } from "react";
import { InstallCard } from "@/components/shared/InstallCard";
import { TRPCProvider } from "@/lib/trpc/provider";

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
    <TRPCProvider>
      {children}
      <InstallCard />
    </TRPCProvider>
  );
}
