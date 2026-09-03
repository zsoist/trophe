'use client';

import { useI18n } from '@/lib/i18n';

interface LiveSessionPathProps {
  exercises: Array<{ id: string; name: string }>;
  currentIndex: number;
}

/** A compact, text-first trace of the workout so logging never becomes a catalogue. */
export function LiveSessionPath({ exercises, currentIndex }: LiveSessionPathProps) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('workout.session_path')} className="border-y border-[var(--border-subtle)] py-3">
      <ol className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-sm">
        {exercises.map((exercise, index) => (
          <li key={exercise.id} aria-current={index === currentIndex ? 'step' : undefined} className={`shrink-0 ${index === currentIndex ? 'font-semibold text-[var(--content-primary)]' : 'text-[var(--content-muted)]'}`}>
            <span className="font-mono tabular-nums">{index + 1}</span>{' '}{exercise.name}
          </li>
        ))}
      </ol>
    </nav>
  );
}
