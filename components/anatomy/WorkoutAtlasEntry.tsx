"use client";
import Link from "next/link";
import { ArrowUpRight, Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { activeAtlasRelease } from "@/lib/anatomy/release";
import { mappingForMuscle } from "@/lib/anatomy/mapping";
/** Entry only: never eagerly imports Three or atlas geometry into workout/logging. */
export function WorkoutAtlasEntry({ muscle }: { muscle?: string | null }) {
  const { t } = useI18n();
  if (!activeAtlasRelease(process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED))
    return null;
  const suffix =
    muscle && mappingForMuscle(muscle)
      ? `?muscle=${encodeURIComponent(muscle)}`
      : "";
  return (
    <Link
      prefetch={false}
      href={`/dashboard/anatomy${suffix}`}
      className="my-3 flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)]"
    >
      <Dumbbell size={22} aria-hidden="true" className="text-[var(--accent)]" />
      <span className="flex-1">
        <strong className="block text-sm">{t("anatomy.workout_title")}</strong>
        <span className="block text-xs text-[var(--text-secondary)]">
          {t("anatomy.workout_entry")}
        </span>
      </span>
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  );
}
