'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calculator, Loader2 } from 'lucide-react';

/**
 * Per-day meal-plan macro rollup (coach). Calls /api/coach/meal-plan-macros,
 * which parses each meal cell through the DB-grounded food pipeline and sums
 * per day. Shows daily kcal/P/C/F vs the client's targets, colour-coded.
 */

interface DayRow { day: number; slots: number; kcal: number; protein: number; carbs: number; fat: number; }
interface Targets { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; }
interface ApiResponse { days: DayRow[]; targets: Targets | null; mealCount: number; error?: string; }

interface Props { isOpen: boolean; clientId: string; clientName?: string | null; onClose: () => void; }

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Colour kcal vs target: green within 10%, amber 10-25%, red beyond.
function kcalColor(kcal: number, target: number | null): string {
  if (!target) return 'var(--t2,#d6d3d1)';
  const off = Math.abs(kcal - target) / target;
  if (off <= 0.1) return 'rgb(34,197,94)';
  if (off <= 0.25) return 'var(--gold-300,#D4A853)';
  return '#f87171';
}

export default function MacroRollupModal({ isOpen, clientId, clientName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    generate();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen, generate]);

  if (!isOpen) return null;
  const t = data?.targets;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-1,#1c1917)', border: '1px solid var(--line-2,rgba(255,255,255,0.08))', maxHeight: '88vh', overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <Calculator size={16} style={{ color: 'var(--gold-300,#D4A853)' }} />
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--t1,#f5f5f4)' }}>Plan macros by day</h2>
                {clientName && <p className="text-[11px]" style={{ color: 'var(--t3,#a8a29e)' }}>{clientName}{data ? ` · ${data.mealCount} meals` : ''}</p>}
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.06)' }}>
              <X size={14} style={{ color: 'var(--t3,#a8a29e)' }} />
            </button>
          </div>

          <div className="px-5 pb-5">
            {loading && (
              <div className="py-12 flex flex-col items-center gap-3">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--gold-300,#D4A853)' }} />
                <p className="text-xs" style={{ color: 'var(--t3,#a8a29e)' }}>Counting the week&apos;s plan…</p>
              </div>
            )}
            {error && !loading && <p className="text-xs py-6 text-center" style={{ color: '#f87171' }}>{error}</p>}
            {data && !loading && data.days.length === 0 && (
              <p className="text-sm py-10 text-center" style={{ color: 'var(--t3,#a8a29e)' }}>No meals in the plan yet.</p>
            )}
            {data && !loading && data.days.length > 0 && (
              <>
                {t?.kcal && (
                  <div className="text-[11px] mb-3" style={{ color: 'var(--t3,#a8a29e)', fontFamily: 'var(--font-mono)' }}>
                    Target: {t.kcal} kcal · {t.protein ?? '–'}P / {t.carbs ?? '–'}C / {t.fat ?? '–'}F
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: 'var(--t4,#78716c)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Day</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>kcal</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>P</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>C</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => (
                      <tr key={d.day} style={{ borderTop: '1px solid var(--line,rgba(255,255,255,.06))' }}>
                        <td style={{ padding: '7px 6px', color: 'var(--t2,#d6d3d1)', fontFamily: 'var(--font-mono)' }}>{DAY_LABELS[d.day] ?? d.day}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: kcalColor(d.kcal, t?.kcal ?? null) }}>{d.kcal}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--t2,#d6d3d1)' }}>{d.protein}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--t2,#d6d3d1)' }}>{d.carbs}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--t2,#d6d3d1)' }}>{d.fat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] mt-3" style={{ color: 'var(--t4,#78716c)' }}>
                  Estimated from meal text via the food database — accuracy ±10-15%. Green = within 10% of target kcal.
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
