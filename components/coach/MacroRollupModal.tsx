'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Calculator, Loader2 } from 'lucide-react';
import { useCoachDialogFocus } from '@/components/coach/useCoachDialogFocus';

/**
 * Per-day meal-plan macro rollup (coach). Calls /api/coach/meal-plan-macros,
 * which parses each meal cell through the DB-grounded food pipeline and sums
 * per day. Shows daily kcal/P/C/F vs the client's targets, colour-coded.
 */

interface DayRow {
  day: number;
  slots: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  complete: boolean;
}
interface Targets { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; }
interface ApiResponse {
  days: DayRow[];
  targets: Targets | null;
  mealCount: number;
  parsedMealCount: number;
  failedMealCount: number;
  complete: boolean;
  error?: string;
}

interface Props { isOpen: boolean; clientId: string; clientName?: string | null; onClose: () => void; }

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Colour kcal vs target: green within 10%, amber 10-25%, red beyond.
function kcalColor(kcal: number, target: number | null): string {
  if (!target) return 'var(--content-secondary)';
  const off = Math.abs(kcal - target) / target;
  if (off <= 0.1) return 'var(--status-success-fg)';
  if (off <= 0.25) return 'var(--action-primary)';
  return 'var(--status-danger-fg)';
}

export default function MacroRollupModal({ isOpen, clientId, clientName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const generate = useCallback(async () => {
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch('/api/coach/meal-plan-macros', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const body = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compute macros.');
    } finally { setLoading(false); }
  }, [clientId]);

  useCoachDialogFocus(isOpen, onClose, dialogRef);
  useEffect(() => {
    if (!isOpen) return;
    generate();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, generate]);

  if (!isOpen) return null;
  const t = data?.targets;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }} animate={reduceMotion ? undefined : { opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }}
        className="fixed inset-0 z-[var(--z-modal,60)] flex items-end sm:items-center justify-center"
        style={{ background: 'color-mix(in srgb, var(--canvas) 80%, transparent)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="macro-rollup-title"
          tabIndex={-1}
          initial={reduceMotion ? false : { y: '100%', opacity: 0 }} animate={reduceMotion ? undefined : { y: 0, opacity: 1 }} exit={reduceMotion ? undefined : { y: '100%', opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="safe-bottom w-full overflow-hidden rounded-t-3xl pb-[env(safe-area-inset-bottom)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:max-w-lg sm:rounded-3xl"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', maxHeight: '88vh', overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <Calculator size={16} style={{ color: 'var(--action-primary)' }} />
              <div>
                <h2 id="macro-rollup-title" className="text-base font-bold" style={{ color: 'var(--content-primary)' }}>Plan macros by day</h2>
                {clientName && <p className="text-xs" style={{ color: 'var(--content-muted)' }}>{clientName}{data ? ` · ${data.mealCount} meals` : ''}</p>}
              </div>
            </div>
            <button aria-label="Close plan macro summary" onClick={onClose} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--border-subtle)' }}>
              <X aria-hidden="true" size={14} style={{ color: 'var(--content-muted)' }} />
            </button>
          </div>

          <div className="px-5 pb-5">
            {loading && (
              <div className="py-12 flex flex-col items-center gap-3">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--action-primary)' }} />
                <p className="text-xs" style={{ color: 'var(--content-muted)' }}>Counting the week&apos;s plan…</p>
              </div>
            )}
            {error && !loading && <p className="text-xs py-6 text-center" style={{ color: 'var(--status-danger-fg)' }}>{error}</p>}
            {data && !loading && data.days.length === 0 && (
              <p className="text-sm py-10 text-center" style={{ color: 'var(--content-muted)' }}>No meals in the plan yet.</p>
            )}
            {data && !loading && data.days.length > 0 && (
              <>
                {!data.complete && (
                  <div
                    role="alert"
                    className="text-xs mb-3 rounded-lg px-3 py-2"
                    style={{ color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-bg)' }}
                  >
                    Some meal descriptions could not be counted ({data.failedMealCount}). Incomplete days show — instead of misleading zero totals.
                  </div>
                )}
                {t?.kcal && (
                  <div className="text-xs mb-3" style={{ color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>
                    Target: {t.kcal} kcal · {t.protein ?? '–'}P / {t.carbs ?? '–'}C / {t.fat ?? '–'}F
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: 'var(--content-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Day</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>kcal</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>P</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>C</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => (
                      <tr key={d.day} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '7px 6px', color: 'var(--content-secondary)', fontFamily: 'var(--font-mono)' }}>{DAY_LABELS[d.day] ?? d.day}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: d.complete ? kcalColor(d.kcal, t?.kcal ?? null) : 'var(--content-muted)' }}>{d.complete ? d.kcal : '—'}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--content-secondary)' }}>{d.complete ? d.protein : '—'}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--content-secondary)' }}>{d.complete ? d.carbs : '—'}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--content-secondary)' }}>{d.complete ? d.fat : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs mt-3" style={{ color: 'var(--content-muted)' }}>
                  {data.complete
                    ? 'Estimated from meal text via the food database — accuracy ±10-15%. Green = within 10% of target kcal.'
                    : 'Only complete days are shown as totals. Retry after reviewing any long or ambiguous meal descriptions.'}
                </p>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
