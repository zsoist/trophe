import type { ReactNode } from "react";
import { InstallCard } from "@/components/shared/InstallCard";

/**
 * Dashboard layout — wraps all /dashboard/* routes.
 * Mounts the PWA InstallCard (client component) which self-hides
 * when already installed or dismissed.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <InstallCard />
    </>
  );
}
