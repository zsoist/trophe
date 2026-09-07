"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { activeAtlasRelease } from "@/lib/anatomy/release";
import { atlasEntryHref } from "@/lib/anatomy/workout-navigation";
import type { WorkoutRouteContext } from "@/lib/workout/workspace-routes";
import { useContext } from 'react';
import { WorkoutAnatomySource } from './WorkoutAnatomySource';
/** Entry only: never eagerly imports Three or atlas geometry into workout/logging. */
export function WorkoutAtlasEntry({ muscle, context }: { muscle?: string | null; context?: WorkoutRouteContext }) {
  const { t } = useI18n();
  const reviewSource = useContext(WorkoutAnatomySource);
  if (!reviewSource && !activeAtlasRelease(process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED))
    return null;
  return (
    <Link
      prefetch={false}
      href={atlasEntryHref(muscle, context)}
      className="my-3 flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)]"
    >
      <Image
        unoptimized
        src="/anatomy/muscle-atlas-mark.webp"
        width={48}
        height={48}
        alt=""
        className="rounded-lg"
      />
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
