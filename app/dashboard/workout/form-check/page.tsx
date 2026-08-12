'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, RotateCcw, Save, ChevronDown } from 'lucide-react';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import FormCheck from '@/components/workout/FormCheck';
import FormScore from '@/components/workout/FormScore';
import { EXERCISE_REFERENCES } from '@/lib/fitness/exercise-references';
import type { FormAnalysisResult } from '@/lib/fitness/form-analysis';
import { supabase } from '@/lib/supabase';

type Phase = 'setup' | 'recording' | 'results';

const EXERCISES = Object.entries(EXERCISE_REFERENCES).map(([key, ref]) => ({
  key,
  name: ref.nameEs,
}));

export default function FormCheckPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedExercise, setSelectedExercise] = useState(EXERCISES[0]?.key || '');
  const [selectedSide, setSelectedSide] = useState<'right' | 'left'>('right');
  const [result, setResult] = useState<FormAnalysisResult | null>(null);

  const exerciseRef = EXERCISE_REFERENCES[selectedExercise];
  const exerciseName = exerciseRef?.nameEs || selectedExercise;

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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

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

      if (!error) setSaved(true);
    } catch {
      // Non-critical — results visible on screen
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
      {/* Header */}
      <div className="sticky top-0 z-40 glass-elevated px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/workout')}
            className="p-2 rounded-xl min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}
          >
            <ArrowLeft size={20} className="text-[var(--content-secondary)]" />
          </button>
          <div className="flex items-center gap-2">
            <Camera size={20} className="gold-text" />
            <h1 className="text-lg font-bold">Form Check</h1>
          </div>
        </div>
      </div>

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
                <p className="text-sm text-[var(--content-secondary)] mb-1 font-medium">AI Form Check</p>
                <p className="text-xs text-[var(--content-muted)] leading-relaxed">
                  Analiza tu forma en tiempo real usando la camara. Selecciona un ejercicio,
                  posicionate de perfil y graba tus repeticiones. El sistema comparara tus
                  angulos contra la referencia ideal.
                </p>
              </div>

              {/* Exercise selector */}
              <div className="glass p-4">
                <label className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-2 block">
                  Ejercicio
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
                    {EXERCISES.map((ex) => (
                      <option key={ex.key} value={ex.key}>
                        {ex.name}
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
                  Lado
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
                      {s === 'right' ? 'Derecho' : 'Izquierdo'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div className="glass p-4">
                <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-2">Tips</p>
                <ul className="space-y-1.5 text-xs text-[var(--content-secondary)]">
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">1.</span>
                    Posicionate de perfil a la camara
                  </li>
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">2.</span>
                    Asegurate de que todo tu cuerpo sea visible
                  </li>
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">3.</span>
                    Buena iluminacion mejora la deteccion
                  </li>
                  <li className="flex gap-2">
                    <span className="gold-text shrink-0">4.</span>
                    Haz al menos 3 reps para mejor analisis
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
                Iniciar Form Check
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
                  Intentar de nuevo
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveResults}
                  disabled={saving || saved}
                  className="flex-1 py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold btn-gold disabled:opacity-60 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <Save size={16} />
                  {saved ? '¡Guardado!' : saving ? 'Guardando…' : 'Guardar'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BotNav routes={[
        { href: '/dashboard',          label: 'Home',     icon: <Icon name="i-home"  size={18} /> },
        { href: '/dashboard/log',      label: 'Log',      icon: <Icon name="i-book"  size={18} /> },
        { href: '/dashboard/progress', label: 'Progress', icon: <Icon name="i-chart" size={18} /> },
        { href: '/dashboard/profile',  label: 'Me',       icon: <Icon name="i-user"  size={18} /> },
      ]} />
    </div>
  );
}
