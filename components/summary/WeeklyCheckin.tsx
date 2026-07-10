'use client';

import { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Send, ClipboardCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { localToday, localDateStr } from '@/lib/utils/dates';

interface WeeklyCheckinProps {
  userId: string;
  coachId: string | null;
}

// Numeric 1–5 scale (no emoji — house rule). labelKey → translated question.
const QUESTIONS = [
  { key: 'energy', labelKey: 'checkin.q_energy' },
  { key: 'sleep', labelKey: 'checkin.q_sleep' },
  { key: 'satiety', labelKey: 'checkin.q_satiety' },
  { key: 'stress', labelKey: 'checkin.q_stress' },
  { key: 'adherence', labelKey: 'checkin.q_adherence' },
];

export default function WeeklyCheckin({ userId, coachId }: WeeklyCheckinProps) {
  const reducedMotion = useReducedMotion();
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const checkIfSunday = useCallback(async () => {
    const now = new Date();
    // 0 = Sunday
    if (now.getDay() !== 0) return;

    // Check if already submitted this week
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString();

    const { data } = await supabase
      .from('coach_notes')
      .select('id')
      .eq('client_id', userId)
      .eq('session_type', 'check_in')
      .gte('created_at', weekStartStr)
      .limit(1);

    // Also check localStorage as a quick guard
    const localKey = `trophe_checkin_${localDateStr(weekStart)}`;
    const localDone = localStorage.getItem(localKey);

    if ((!data || data.length === 0) && !localDone) {
      setShow(true);
    }
  }, [userId]);

  useEffect(() => {
    checkIfSunday();
  }, [checkIfSunday]);

  function setRating(key: string, value: number) {
    setRatings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (Object.keys(ratings).length < 5) return;
    setSubmitting(true);

    try {
      const ratingsJson = JSON.stringify({
        type: 'weekly_checkin',
        week: localToday(),
        ratings,
        average: (Object.values(ratings).reduce((a, b) => a + b, 0) / 5).toFixed(1),
      });

      await supabase.from('coach_notes').insert({
        coach_id: coachId || userId,
        client_id: userId,
        note: ratingsJson,
        session_type: 'check_in',
      });

      // Mark in localStorage
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const localKey = `trophe_checkin_${localDateStr(weekStart)}`;
      localStorage.setItem(localKey, 'done');

      setSubmitted(true);
      setTimeout(() => {
        setShow(false);
      }, 2000);
    } catch (err) {
      console.error('Weekly checkin error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!show || dismissed) return null;

  const allAnswered = Object.keys(ratings).length === 5;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="glass gold-border p-5 mb-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} style={{ color: 'var(--accent, #D4A853)' }} />
            <h3 className="text-sm font-semibold text-stone-100">{t('checkin.title')}</h3>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-stone-600 hover:text-stone-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {submitted ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-4"
          >
            {/* Animated check draw (instant under reduced motion) */}
            <svg width={40} height={40} viewBox="0 0 40 40" className="mx-auto mb-2 block" aria-hidden>
              <circle cx={20} cy={20} r={18} fill="none" stroke="var(--ok,#65D387)" strokeWidth={2} opacity={0.25} />
              <motion.path
                d="M12 20.5 L17.5 26 L28 14.5"
                fill="none"
                stroke="var(--ok,#65D387)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reducedMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
              />
            </svg>
            <p className="text-stone-300 text-sm font-medium">{t('checkin.submitted')}</p>
            <p className="text-stone-500 text-xs mt-1">{t('checkin.coach_review')}</p>
          </motion.div>
        ) : (
          <>
            <p className="text-stone-500 text-xs mb-4">
              {t('checkin.instructions')}
            </p>

            <div className="space-y-3">
              {QUESTIONS.map((q) => (
                <div key={q.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-stone-400">{t(q.labelKey)}</p>
                    <span className="text-[9px] text-stone-600 font-mono">{t('checkin.scale_hint')}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((val) => {
                      const selected = ratings[q.key] === val;
                      return (
                        <button
                          key={val}
                          onClick={() => setRating(q.key, val)}
                          aria-label={`${t(q.labelKey)}: ${val}`}
                          aria-pressed={selected}
                          className="flex-1 py-2 rounded-lg text-center text-sm font-bold transition-all"
                          style={{
                            background: selected ? 'var(--accent-soft, rgba(212,168,83,.15))' : 'rgba(255,255,255,.03)',
                            border: `1px solid ${selected ? 'var(--accent, #D4A853)' : 'rgba(255,255,255,.05)'}`,
                            color: selected ? 'var(--accent, #D4A853)' : 'var(--t3)',
                          }}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className={`btn-gold w-full mt-4 flex items-center justify-center gap-2 text-sm py-3 ${
                !allAnswered ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              <Send size={14} />
              {submitting ? t('checkin.submitting') : t('checkin.submit')}
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
