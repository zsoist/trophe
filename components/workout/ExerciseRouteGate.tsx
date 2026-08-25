'use client';

import { useI18n } from '@/lib/i18n';

export function ExerciseRouteGate({ actionLabel, message, onAction }: { actionLabel: string; message?: string; onAction: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-3xl items-center px-4 py-10">
      <section role="status" className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 text-center">
        <h1 className="text-xl font-semibold text-[var(--content-primary)]">{t('workout.add_exercise')}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--content-secondary)]">{message ?? t('workout.exercise_requires_strength_draft')}</p>
        <button type="button" onClick={onAction} className="btn-gold mt-5 min-h-12 rounded-xl px-5 font-semibold">
          {actionLabel}
        </button>
      </section>
    </main>
  );
}

export default ExerciseRouteGate;
