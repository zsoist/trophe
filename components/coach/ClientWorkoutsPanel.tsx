'use client';

/**
 * Trophē — coach client-detail "Workouts" panel (panel id: `workouts`).
 *
 * First real consumer of the workout assignment layer (migration 0049):
 *   - Active program summary via trpc.workouts.program.forClient
 *     (name, weekday chips with template names, assigned date).
 *   - "Assign / Edit program" link → /coach/templates?client=<id>.
 *   - Last 5 logged sessions via trpc.workouts.logs.forClient
 *     (date, duration, set count, PR count gold-highlighted, pain flags).
 *   - Weekly training volume (last 4 weeks) computed from the same log data —
 *     replaces the page-level supabase workout_sessions/workout_sets fetch.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Dumbbell, Trophy, AlertTriangle, ChevronRight, Moon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc/client';
import WorkoutVolumeChart from '@/components/coach/WorkoutVolumeChart';
import type { PainFlag } from '@/lib/types';

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display; 0=Sun … 6=Sat (JS getDay())
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function ClientWorkoutsPanel({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  // Time anchor for week bucketing — captured once per mount (render purity).
  const [nowMs] = useState(() => Date.now());
  const programQuery = trpc.workouts.program.forClient.useQuery({ clientId });
  const logsQuery = trpc.workouts.logs.forClient.useQuery({ clientId, limit: 60 });

  const program = programQuery.data ?? null;
  const sessions = logsQuery.data?.sessions ?? [];
  const sets = logsQuery.data?.sets ?? [];

  // ── Per-session rollups (set count, PRs, pain flags) ────────────────────
  const setsBySession = new Map<string, { count: number; prs: number }>();
  for (const s of sets) {
    if (!s.sessionId) continue;
    const agg = setsBySession.get(s.sessionId) ?? { count: 0, prs: 0 };
    agg.count += 1;
    if (s.isPr) agg.prs += 1;
    setsBySession.set(s.sessionId, agg);
  }

  const recentSessions = sessions.slice(0, 5);

  // ── Weekly volume: last 4 weeks bucketed from the fetched logs ──────────
  const volumeWeeks = (() => {
    const agg = [0, 1, 2, 3].map(() => ({ totalSets: 0, totalReps: 0 }));
    const sessionWeek = new Map<string, number>();
    for (const s of sessions) {
      const days = Math.floor(
        (nowMs - new Date(`${s.sessionDate}T12:00:00`).getTime()) / 86400_000,
      );
      if (days < 0 || days >= 28) continue;
      sessionWeek.set(s.id, Math.min(3, Math.floor(days / 7))); // 0 = this week
    }
    for (const set of sets) {
      const w = set.sessionId ? sessionWeek.get(set.sessionId) : undefined;
      if (w == null) continue;
      agg[w].totalSets += 1;
      agg[w].totalReps += set.reps ?? 0;
    }
    const labels = ['This week', 'Last week', '2 weeks ago', '3 weeks ago'];
    return [3, 2, 1, 0].map((w) => ({ weekLabel: labels[w], ...agg[w] }));
  })();

  // ── Weekday chips for the active program ────────────────────────────────
  const dayChips = WEEKDAY_ORDER.map((weekday) => {
    const entries = (program?.days ?? [])
      .filter((d) => d.weekday === weekday)
      .map((d) => d.template.dayLabel || d.template.name);
    return { weekday, label: WEEKDAY_ABBR[weekday], templates: entries };
  });

  const loading = programQuery.isLoading || logsQuery.isLoading;
  const failed = programQuery.isError || logsQuery.isError;

  return (
    <div className="glass p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-[var(--content-primary)] flex items-center gap-2">
          <Dumbbell size={16} className="text-[var(--action-primary)]" />
          {t('coach.workouts.title')}
        </h2>
        <Link
          href={`/coach/templates?client=${clientId}`}
          className="min-h-11 -my-2 flex items-center gap-1 text-xs text-[var(--action-primary)] hover:text-[var(--action-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {program ? t('coach.workouts.assignEdit') : t('coach.workouts.assign')}
          <ChevronRight size={13} />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-[var(--surface-hover)] animate-pulse" />
          ))}
        </div>
      ) : failed ? (
        <p className="text-[var(--content-muted)] text-sm text-center py-4">
          {t('coach.workouts.loadError')}
        </p>
      ) : (
        <>
          {/* ── Active program ── */}
          {program ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-[var(--content-primary)]">{program.program.name}</div>
                <span className="text-xs text-[var(--content-muted)] font-mono">
                  {t('coach.workouts.assigned')}{' '}
                  {formatDate(
                    (program.program.startsOn ??
                      program.program.createdAt?.slice(0, 10) ??
                      new Date(nowMs).toISOString().slice(0, 10)) as string,
                  )}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {dayChips.map((chip) => (
                  <div
                    key={chip.weekday}
                    className={`rounded-lg p-1.5 text-center border ${
                      chip.templates.length > 0
                        ? 'bg-[var(--action-primary)]/10 border-[var(--action-primary)]/20'
                        : 'bg-[var(--surface-hover)] border-[var(--border-subtle)]'
                    }`}
                    title={chip.templates.length > 0 ? chip.templates.join(' + ') : t('coach.workouts.restDay')}
                  >
                    <div
                      className={`text-xs font-semibold mb-0.5 ${
                        chip.templates.length > 0 ? 'text-[var(--action-primary)]' : 'text-[var(--content-muted)]'
                      }`}
                    >
                      {chip.label}
                    </div>
                    {chip.templates.length > 0 ? (
                      <div className="text-xs text-[var(--content-secondary)] leading-tight truncate">
                        {chip.templates.join(' + ')}
                      </div>
                    ) : (
                      <Moon size={10} className="mx-auto text-[var(--content-muted)]" />
                    )}
                  </div>
                ))}
              </div>
              {program.program.notes && (
                <p className="text-xs text-[var(--content-muted)] mt-2 leading-snug">
                  {program.program.notes}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[var(--content-muted)] text-sm text-center py-3 mb-3">
              {t('coach.workouts.noProgram')}
            </p>
          )}

          {/* ── Recent sessions ── */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-[var(--content-muted)] uppercase tracking-wider mb-2">
              {t('coach.workouts.recentSessions')}
            </p>
            {recentSessions.length === 0 ? (
              <p className="text-[var(--content-muted)] text-sm text-center py-3">{t('coach.workouts.noSessions')}</p>
            ) : (
              <div className="space-y-1.5">
                {recentSessions.map((s) => {
                  const agg = setsBySession.get(s.id) ?? { count: 0, prs: 0 };
                  const painFlags = Array.isArray(s.painFlags) ? (s.painFlags as PainFlag[]) : [];
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--surface-hover)] border border-[var(--border-subtle)]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[var(--content-primary)] truncate">
                          {s.name || t('coach.workouts.workout')}
                        </div>
                        <div className="text-xs text-[var(--content-muted)]">
                          {formatDate(s.sessionDate)}
                          {s.durationMinutes ? ` · ${s.durationMinutes} ${t('coach.workouts.min')}` : ''}
                          {` · ${agg.count} ${agg.count !== 1 ? t('coach.workouts.sets') : t('coach.workouts.set')}`}
                        </div>
                      </div>
                      {agg.prs > 0 && (
                        <span
                          className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-[var(--action-primary)]/15 text-[var(--action-primary)] border border-[var(--action-primary)]/30 shrink-0"
                          title={`${agg.prs} ${t('coach.workouts.personalRecords')}`}
                        >
                          <Trophy size={10} />
                          {agg.prs} {agg.prs !== 1 ? t('coach.workouts.prs') : t('coach.workouts.pr')}
                        </span>
                      )}
                      {painFlags.length > 0 && (
                        <span
                          className="flex items-center gap-1 text-amber-400 shrink-0 text-xs font-medium"
                          title={`${t('coach.workouts.painFlags')}: ${painFlags
                            .map((pf) => `${pf.body_part} (${pf.severity}/10)`)
                            .join(', ')}`}
                        >
                          <AlertTriangle size={14} />
                          {painFlags.length}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Weekly volume ── */}
          <WorkoutVolumeChart weeks={volumeWeeks} />
        </>
      )}
    </div>
  );
}
