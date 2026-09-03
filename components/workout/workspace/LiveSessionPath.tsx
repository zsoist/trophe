'use client';

import { useI18n } from '@/lib/i18n';

interface LiveSessionPathProps {
  exercises: Array<{ id: string; name: string }>;
  selectedId: string | null;
  completedIds: ReadonlySet<string>;
  onSelect(id: string): void;
}

/** A compact, text-first trace of the workout so logging never becomes a catalogue. */
export function LiveSessionPath({ exercises, selectedId, completedIds, onSelect }: LiveSessionPathProps) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('workout.session_path')} className="border-y border-[var(--border-subtle)] py-3">
      <ol className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-sm">
        {exercises.map((exercise, index) => {
          const current = exercise.id === selectedId;
          const stateKey = current ? 'workout.path_current' : completedIds.has(exercise.id) ? 'workout.path_completed' : 'workout.path_pending';
          return <li key={exercise.id} aria-current={current ? 'step' : undefined}>
            <button type="button" onClick={() => onSelect(exercise.id)} aria-label={t(stateKey, { n: index + 1 })} className={`min-h-11 shrink-0 rounded-xl px-2 text-left ${current ? 'font-semibold text-[var(--content-primary)]' : 'text-[var(--content-muted)]'}`}>
              <span className="font-mono tabular-nums">{index + 1}</span>{' '}{exercise.name}
            </button>
          </li>;
        })}
      </ol>
    </nav>
  );
}
