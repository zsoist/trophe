'use client';

import { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, ClipboardCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localToday, localDateStr } from '../lib/dates';

interface WeeklyCheckinProps {
  userId: string;
  coachId: string | null;
}

const QUESTIONS = [
  { key: 'energy', label: 'Energy level this week', emojis: ['😴', '😐', '🙂', '😊', '⚡'] },
  { key: 'sleep', label: 'Sleep quality', emojis: ['😵', '😪', '😐', '😌', '💤'] },
  { key: 'satiety', label: 'Hunger/satiety management', emojis: ['😩', '😕', '😐', '😊', '🎯'] },
  { key: 'stress', label: 'Stress level', emojis: ['🔥', '😰', '😐', '😌', '🧘'] },
  { key: 'adherence', label: 'Overall adherence confidence', emojis: ['😣', '😓', '😐', '💪', '🏆'] },
];

export default function WeeklyCheckin({ userId, coachId }: WeeklyCheckinProps) {
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
            <ClipboardCheck size={18} className="text-[#D4A853]" />
            <h3 className="text-sm font-semibold text-stone-100">Weekly Check-in</h3>
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
            <span className="text-3xl mb-2 block">✅</span>
            <p className="text-stone-300 text-sm font-medium">Check-in submitted!</p>
            <p className="text-stone-500 text-xs mt-1">Your coach will review this</p>
          </motion.div>
        ) : (
          <>
            <p className="text-stone-500 text-xs mb-4">
              Rate each area from 1 to 5 to help your coach track your progress.
            </p>

            <div className="space-y-3">
              {QUESTIONS.map((q) => (
                <div key={q.key}>
                  <p className="text-xs text-stone-400 mb-1.5">{q.label}</p>
                  <div className="flex gap-1.5">
                    {q.emojis.map((emoji, idx) => {
                      const val = idx + 1;
                      const selected = ratings[q.key] === val;
                      return (
                        <button
                          key={val}
                          onClick={() => setRating(q.key, val)}
                          className={`flex-1 py-2 rounded-lg text-center text-lg transition-all ${
                            selected
                              ? 'bg-[#D4A853]/15 border border-[#D4A853]/40 scale-110'
                              : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]'
                          }`}
                        >
                          {emoji}
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
              {submitting ? 'Submitting...' : 'Submit Check-in'}
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
