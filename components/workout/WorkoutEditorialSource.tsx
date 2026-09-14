'use client';

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

/** Private review injection only. Editorial equipment is never a technique poster. */
export const WorkoutEditorialSource = createContext<string | null>(null);
export function WorkoutEditorialCover({ slug, canDemonstrate, children }: { slug: string; canDemonstrate: boolean; children: ReactNode }) {
  const source = useContext(WorkoutEditorialSource);
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!source || slug !== 'smith-bench-press') return children;
  return <div className="workout-editorial-cover">
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${source}/smith-flat-bench-480.webp`} srcSet={`${source}/smith-flat-bench-480.webp 480w, ${source}/smith-flat-bench-768.webp 768w`} sizes="(max-width: 600px) 100vw, 640px" width={1122} height={1402} alt={`${t('workout.picker_equipment')}: Smith Machine · ${t('workout.editorial_equipment')}`} />
      <figcaption>{t('workout.picker_equipment')} · {t('workout.editorial_equipment')}</figcaption>
    </figure>
    {canDemonstrate && <details onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>{t('workout.info_technique')}</summary>
      {expanded ? children : null}
    </details>}
  </div>;
}
