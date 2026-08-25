'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, RotateCcw, Save, ChevronDown } from 'lucide-react';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import FormCheck from '@/components/workout/FormCheck';
import FormScore from '@/components/workout/FormScore';
import { EXERCISE_REFERENCES } from '@/lib/fitness/exercise-references';
import type { FormAnalysisResult } from '@/lib/fitness/form-analysis';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

type Phase = 'setup' | 'recording' | 'results';

const EXERCISES = Object.keys(EXERCISE_REFERENCES);

export default function FormCheckPage() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedExercise, setSelectedExercise] = useState(EXERCISES[0] || '');
  const [selectedSide, setSelectedSide] = useState<'right' | 'left'>('right');
  const [result, setResult] = useState<FormAnalysisResult | null>(null);
  const [saveError, setSaveError] = useState(false);

  const exerciseRef = EXERCISE_REFERENCES[selectedExercise];
  const exerciseName = t(`formCheck.exercise.${selectedExercise}`);

  const handleComplete = (analysisResult: FormAnalysisResult) => {
    setResult(analysisResult);
    setPhase('results');
  };

  const handleTryAgain = () => {
    setResult(null);
    setPhase('setup');
  };

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveResults = async () => {
    if (!result || saving || saved) return;
    setSaving(true);
    setSaveError(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaveError(true); return; }

      // Look up the exercise row by its English reference name. The exercises
      // table's column is `name` (there is no name_en column — the old query
      // matched nothing, so exercise_id always saved as null).
      const referenceName = exerciseRef?.name ?? selectedExercise.replace(/_/g, ' ');
      const { data: exerciseRow } = await supabase
        .from('exercises')
        .select('id')
        .ilike('name', referenceName)
        .limit(1)
        .maybeSingle();

      const { error } = await supabase.from('form_analyses').insert({
        user_id: user.id,
        exercise_id: exerciseRow?.id ?? null,
        side: selectedSide,
        reps_analyzed: result.repsAnalyzed,
        overall_score: result.overallScore,
        overall_assessment: result.overallAssessment,
        per_rep_scores: result.repScores,
        reference_comparison: null,
        analyzed_at: new Date().toISOString(),
      });

      if (error) setSaveError(true);
      else setSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  // ─── Recording phase: fullscreen camera ───
  if (phase === 'recording') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--canvas)]">
        <FormCheck
          exercise={selectedExercise}
          side={selectedSide}
          onComplete={handleComplete}
          onBack={() => setPhase('setup')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto px-4 pt-4">
        <AnimatePresence mode="wait">
          {/* ─── Setup Phase ─── */}
          {phase === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              {/* Intro card */}
              <div className="glass p-4">
                <p className="text-sm text-[var(--content-secondary)] mb-1 font-medium">{t('formCheck.title')}</p>
                <p className="text-xs text-[var(--content-muted)] leading-relaxed">{t('formCheck.intro')}</p>
                <p className="mt-2 text-xs text-[var(--content-muted)] leading-relaxed">{t('formCheck.privacy')}</p>
              </div>

              {/* Exercise selector */}
              <div className="glass p-4">
                <label className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-2 block">
                  {t('formCheck.exercise')}
                </label>
                <div className="relative">
                  <select
                    value={selectedExercise}
                    onChange={(e) => setSelectedExercise(e.target.value)}
                    className="w-full py-3 px-4 rounded-xl text-sm font-medium text-[var(--content-primary)] appearance-none cursor-pointer text-base"
                    style={{
                      background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                    }}
                  >
                    {EXERCISES.map((exerciseKey) => (
                      <option key={exerciseKey} value={exerciseKey}>
                        {t(`formCheck.exercise.${exerciseKey}`)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--content-muted)] pointer-events-none"
                  />
                </div>
              </div>

              {/* Side selector */}
              <div className="glass p-4">
                <label className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-2 block">
                  {t('formCheck.side')}
                </label>
                <div className="flex gap-2">
                  {(['right', 'left'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSide(s)}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      style={{
                        background:
                          selectedSide === s
                            ? 'color-mix(in srgb, var(--action-primary) 15%, transparent)'
                            : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                        color: selectedSide === s ? 'var(--action-primary)' : 'var(--content-secondary)',
                        border:
                          selectedSide === s
                            ? '1px solid color-mix(in srgb, var(--action-primary) 30%, transparent)'
                            : '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                      }}
                    >
                      {t(s === 'right' ? 'formCheck.right' : 'formCheck.left')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div className="glass p-4">
                <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-2">{t('formCheck.tips')}</p>
                <ul className="space-y-1.5 text-xs text-[var(--content-secondary)]">
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">1.</span>
                    {t('formCheck.tip_profile')}
                  </li>
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">2.</span>
                    {t('formCheck.tip_full_body')}
                  </li>
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">3.</span>
                    {t('formCheck.tip_light')}
                  </li>
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">4.</span>
                    {t('formCheck.tip_reps')}
                  </li>
                </ul>
              </div>

              {/* Start button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setPhase('recording')}
                className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 text-base font-bold btn-gold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <Camera size={20} />
                {t('formCheck.start')}
              </motion.button>
            </motion.div>
          )}

          {/* ─── Results Phase ─── */}
          {phase === 'results' && result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <FormScore result={result} exerciseName={exerciseName} />

              {/* Action buttons */}
              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleTryAgain}
                  className="flex-1 py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  style={{
                    background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                    color: 'var(--content-secondary)',
                    border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                  }}
                >
                  <RotateCcw size={16} />
                  {t('formCheck.try_again')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveResults}
                  disabled={saving || saved}
                  className="flex-1 py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold btn-gold disabled:opacity-60 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <Save size={16} />
                  {saved ? t('formCheck.saved') : saving ? t('formCheck.saving') : t('formCheck.save')}
                </motion.button>
              </div>
              {saveError ? <p role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('formCheck.save_error')}</p> : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BotNav routes={[
        { href: '/dashboard',          label: t('nav.home'),     icon: <Icon name="i-home"  size={18} /> },
        { href: '/dashboard/log',      label: t('nav.log'),      icon: <Icon name="i-book"  size={18} /> },
        { href: '/dashboard/progress', label: t('nav.progress'), icon: <Icon name="i-chart" size={18} /> },
        { href: '/dashboard/profile',  label: t('nav.me'),       icon: <Icon name="i-user"  size={18} /> },
      ]} />
    </div>
  );
}
