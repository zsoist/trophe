'use client';

import { useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Habit, ClientHabit, HabitCheckin, Language, CoreLanguage } from '@/lib/types';
import { localDateStr } from '@/lib/utils/dates';
import { useCoachDialogFocus } from '@/components/coach/useCoachDialogFocus';

interface HabitDetailModalProps {
  open: boolean;
  onClose: () => void;
  habit: Habit | null;
  clientHabit: ClientHabit | null;
  checkins: HabitCheckin[];
  language: Language;
}

const CATEGORY_EDUCATION: Record<string, Record<CoreLanguage, string>> = {
  nutrition: {
    en: 'Nutrition habits build the foundation for energy, recovery, and body composition. Consistent eating patterns regulate hunger hormones and stabilize blood sugar.',
    es: 'Los habitos nutricionales construyen la base para la energia, recuperacion y composicion corporal. Patrones alimenticios consistentes regulan hormonas del hambre.',
    el: 'Οι διατροφικες συνηθειες χτιζουν τη βαση για ενεργεια, αποκατασταση και συνθεση σωματος.',
  },
  hydration: {
    en: 'Proper hydration affects everything: metabolism, cognitive function, joint health, and performance. Even mild dehydration impairs concentration and increases fatigue.',
    es: 'La hidratacion adecuada afecta todo: metabolismo, funcion cognitiva, salud articular y rendimiento.',
    el: 'Η σωστη ενυδατωση επηρεαζει τα παντα: μεταβολισμο, γνωστικη λειτουργια, υγεια αρθρωσεων.',
  },
  movement: {
    en: 'Regular movement improves insulin sensitivity, bone density, cardiovascular health, and mental wellbeing. The best exercise routine is one you can sustain consistently.',
    es: 'El movimiento regular mejora la sensibilidad a la insulina, densidad osea, salud cardiovascular y bienestar mental.',
    el: 'Η τακτικη κινηση βελτιωνει την ευαισθησια στην ινσουλινη, την οστικη πυκνοτητα.',
  },
  sleep: {
    en: 'Quality sleep is when your body repairs, grows muscle, and consolidates memories. Poor sleep increases cortisol, hunger, and injury risk.',
    es: 'El sueno de calidad es cuando tu cuerpo repara, crece musculo y consolida memorias.',
    el: 'Ο ποιοτικος υπνος ειναι οταν το σωμα σας επισκευαζει, αναπτυσσει μυες.',
  },
  mindset: {
    en: 'Mental resilience determines long-term adherence. Building awareness around triggers, stress responses, and self-talk patterns creates sustainable change.',
    es: 'La resiliencia mental determina la adherencia a largo plazo.',
    el: 'Η ψυχικη ανθεκτικοτητα καθοριζει τη μακροπροθεσμη προσηλωση.',
  },
  recovery: {
    en: 'Recovery is where adaptation happens. Active recovery, stretching, and rest days prevent overtraining and reduce injury risk.',
    es: 'La recuperacion es donde ocurre la adaptacion.',
    el: 'Η αποκατασταση ειναι εκει που συμβαινει η προσαρμογη.',
  },
};

function getHabitName(habit: Habit, language: Language): string {
  if (language === 'es' && habit.name_es) return habit.name_es;
  if (language === 'el' && habit.name_el) return habit.name_el;
  return habit.name_en;
}

function getHabitDescription(habit: Habit, language: Language): string {
  if (language === 'es' && habit.description_es) return habit.description_es;
  if (language === 'el' && habit.description_el) return habit.description_el;
  return habit.description_en ?? '';
}

export default function HabitDetailModal({
  open,
  onClose,
  habit,
  clientHabit,
  checkins,
  language,
}: HabitDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useCoachDialogFocus(open, onClose, dialogRef);
  if (!habit || !clientHabit) return null;

  const currentStreak = clientHabit.current_streak ?? 0;
  const bestStreak = clientHabit.best_streak ?? 0;
  const cycleDays = habit.cycle_days ?? 14;
  const category = habit.category ?? 'nutrition';
  const educationText = CATEGORY_EDUCATION[category]?.[language as CoreLanguage] ?? CATEGORY_EDUCATION[category]?.en ?? '';

  // Build 14-day calendar grid
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completedDates = new Set(checkins.filter((c) => c.completed).map((c) => c.checked_date));
  const missedDates = new Set(checkins.filter((c) => !c.completed).map((c) => c.checked_date));
  const moodMap = new Map(checkins.filter((c) => c.mood).map((c) => [c.checked_date, c.mood]));

  const habitStart = clientHabit.started_at ? new Date(clientHabit.started_at) : null;
  if (habitStart) habitStart.setHours(0, 0, 0, 0);

  const MOOD_EMOJI: Record<string, string> = {
    great: '😄',
    good: '😊',
    okay: '😐',
    tough: '😓',
    struggled: '😰',
  };

  const days: { date: string; dayNum: number; status: 'completed' | 'missed' | 'empty'; mood?: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    const dayNum = d.getDate();
    const mood = moodMap.get(dateStr) ?? undefined;

    if (completedDates.has(dateStr)) {
      days.push({ date: dateStr, dayNum, status: 'completed', mood });
    } else if (missedDates.has(dateStr)) {
      days.push({ date: dateStr, dayNum, status: 'missed', mood });
    } else if (d > today || (habitStart && d < habitStart)) {
      days.push({ date: dateStr, dayNum, status: 'empty' });
    } else {
      days.push({ date: dateStr, dayNum, status: habitStart && d >= habitStart ? 'missed' : 'empty' });
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: reducedMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: reducedMotion ? 1 : 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--surface-overlay)]/90 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            initial={reducedMotion ? { opacity: 1 } : { y: '100%' }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { y: '100%' }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog" aria-modal="true" aria-labelledby="habit-detail-title"
            className="glass-elevated w-full max-w-md max-h-[85vh] overflow-y-auto p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] rounded-t-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-[var(--surface-2)]" />
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close habit details"
              className="absolute top-4 right-4 min-h-11 min-w-11 inline-flex items-center justify-center text-[var(--content-muted)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition-colors"
            >
              <X size={20} />
            </button>

            {/* Habit header */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-4xl">{habit.emoji}</span>
              <div>
                <h2 id="habit-detail-title" className="text-xl font-bold text-[var(--content-primary)]">{getHabitName(habit, language)}</h2>
                <p className="text-[var(--content-muted)] text-xs capitalize">{category} &middot; {habit.difficulty}</p>
              </div>
            </div>

            {/* Description */}
            {getHabitDescription(habit, language) && (
              <p className="text-[var(--content-muted)] text-sm mb-5 leading-relaxed">
                {getHabitDescription(habit, language)}
              </p>
            )}

            {/* Streak comparison */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="glass p-4 text-center">
                <p className="text-2xl font-bold gold-text">{currentStreak}</p>
                <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider mt-1">Current Streak</p>
              </div>
              <div className="glass p-4 text-center">
                <p className="text-2xl font-bold text-[var(--content-primary)]">{bestStreak}</p>
                <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider mt-1">Best Streak</p>
              </div>
            </div>

            {/* Streak comparison bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs text-[var(--content-muted)] mb-1">
                <span>Current vs Best</span>
                <span>{bestStreak > 0 ? Math.round((currentStreak / bestStreak) * 100) : 0}%</span>
              </div>
              <div className="streak-bar h-3 relative">
                {/* Best streak marker */}
                <div
                  className="absolute top-0 h-full border-r-2 border-[var(--border-default)]"
                  style={{ left: `${Math.min((bestStreak / cycleDays) * 100, 100)}%` }}
                />
                <motion.div
                  className="streak-fill h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((currentStreak / cycleDays) * 100, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
              </div>
            </div>

            {/* 14-Day Calendar Grid */}
            <div className="mb-5">
              <p className="text-[var(--content-muted)] text-xs mb-2 uppercase tracking-wider font-semibold">14-Day History</p>
              <div className="grid grid-cols-7 gap-2">
                {days.map((day) => (
                  <div
                    key={day.date}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center ${
                      day.status === 'completed'
                        ? 'bg-green-500/20 border border-green-500/30'
                        : day.status === 'missed'
                        ? 'bg-red-500/15 border border-red-500/20'
                        : 'bg-[var(--surface-2)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    <span className="text-xs text-[var(--content-muted)] leading-none">{day.dayNum}</span>
                    {day.mood && (
                      <span className="text-xs leading-none mt-0.5">{MOOD_EMOJI[day.mood] ?? ''}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Mood History (last 7 with mood) */}
            {checkins.filter((c) => c.mood).length > 0 && (
              <div className="mb-5">
                <p className="text-[var(--content-muted)] text-xs mb-2 uppercase tracking-wider font-semibold">Mood Log</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {checkins
                    .filter((c) => c.mood)
                    .slice(-7)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="glass flex-shrink-0 px-3 py-2 flex flex-col items-center gap-0.5"
                      >
                        <span className="text-sm">{MOOD_EMOJI[c.mood!] ?? ''}</span>
                        <span className="text-xs text-[var(--content-muted)]">
                          {new Date(c.checked_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Why this habit? */}
            {educationText && (
              <div className="glass p-4">
                <p className="text-[var(--content-muted)] text-xs font-semibold uppercase tracking-wider mb-2">
                  Why this habit?
                </p>
                <p className="text-[var(--content-primary)] text-sm leading-relaxed">{educationText}</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
