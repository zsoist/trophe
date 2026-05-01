'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FoodLogEntry } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

interface NutrientDensityProps {
  entries: FoodLogEntry[];
}

// Score: (protein×4 + fiber×2) / calories × 100  — higher = more nutrients per calorie
function calcScore(e: FoodLogEntry): number {
  const cal = e.calories ?? 1;
  if (cal <= 0) return 0;
  const protein = e.protein_g ?? 0;
  const fiber   = e.fiber_g   ?? 0;
  return ((protein * 4 + fiber * 2) / cal) * 100;
}

function ScoreRing({ score, max = 60 }: { score: number; max?: number }) {
  const r   = 26;
  const C   = 2 * Math.PI * r;
  const pct = Math.min(score / max, 1);
  const color = score >= 35 ? '#65D387' : score >= 22 ? '#D4A853' : score >= 12 ? '#fb923c' : '#E87A6E';

  return (
    <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
      <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={32} cy={32} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={5} />
        <motion.circle
          cx={32} cy={32} r={r} fill="none" stroke={color}
          strokeWidth={5} strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
          {Math.round(score)}
        </span>
        <span style={{ fontSize: 7, color: 'var(--t5)', marginTop: 1 }}>score</span>
      </div>
    </div>
  );
}

export default function NutrientDensity({ entries }: NutrientDensityProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const scored = entries
    .filter(e => (e.calories ?? 0) > 0)
    .map(e => ({
      name:     e.food_name,
      score:    Math.round(calcScore(e) * 10) / 10,
      calories: e.calories ?? 0,
      protein:  e.protein_g ?? 0,
      fiber:    e.fiber_g ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const avgScore  = scored.reduce((s, f) => s + f.score, 0) / scored.length;
  const maxScore  = scored[0].score;
  const roundedAvg = Math.round(avgScore * 10) / 10;

  const grade  = avgScore >= 35 ? 'A' : avgScore >= 22 ? 'B' : avgScore >= 12 ? 'C' : 'D';
  const label  = avgScore >= 35 ? t('density.excellent') : avgScore >= 22 ? t('density.good') : avgScore >= 12 ? t('density.fair') : t('density.low');
  const tip    = avgScore >= 30 ? t('density.tip_high') : avgScore >= 18 ? t('density.tip_med') : t('density.tip_low');

  const gradeColor = { A: '#65D387', B: '#D4A853', C: '#fb923c', D: '#E87A6E' }[grade];
  const gradeBg    = { A: 'rgba(101,211,135,.08)', B: 'rgba(212,168,83,.08)', C: 'rgba(251,146,60,.08)', D: 'rgba(232,122,110,.08)' }[grade];
  const gradeBorder = { A: 'rgba(101,211,135,.2)', B: 'rgba(212,168,83,.2)', C: 'rgba(251,146,60,.2)', D: 'rgba(232,122,110,.2)' }[grade];

  return (
    <div className="glass p-3">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between mb-1">
        <span className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          {t('analytics.nutrient_density')}
        </span>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, fontWeight: 700, color: gradeColor }}>{label}</span>
          {expanded ? <ChevronUp size={13} className="text-stone-500" /> : <ChevronDown size={13} className="text-stone-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Score ring + grade + explanation */}
            <div className="flex items-center gap-3 mt-2 mb-3">
              <ScoreRing score={roundedAvg} />
              <div className="flex-1 min-w-0">
                {/* Grade badge */}
                <div className="flex items-center gap-2 mb-1">
                  <span style={{
                    fontSize: 18, fontWeight: 900, color: gradeColor,
                    fontFamily: 'var(--font-mono)', lineHeight: 1,
                  }}>
                    {grade}
                  </span>
                  <div style={{
                    padding: '2px 7px', borderRadius: 8, fontSize: 9, fontWeight: 600,
                    background: gradeBg, border: `1px solid ${gradeBorder}`,
                    color: gradeColor,
                  }}>
                    {label}
                  </div>
                </div>
                {/* What the score means */}
                <p style={{ fontSize: 9, color: 'var(--t4)', lineHeight: 1.5 }}>
                  {t('density.score_desc')}
                </p>
              </div>
            </div>

            {/* Tip */}
            <div style={{
              padding: '8px 10px', borderRadius: 10, marginBottom: 10,
              background: gradeBg, border: `1px solid ${gradeBorder}`,
            }}>
              <p style={{ fontSize: 9.5, color: 'var(--t3)', lineHeight: 1.5 }}>
                💡 {tip}
              </p>
            </div>

            {/* Per-food bars */}
            <div className="space-y-2">
              {scored.slice(0, 6).map((food, i) => {
                const barPct   = maxScore > 0 ? (food.score / maxScore) * 100 : 0;
                const barColor = food.score >= 35 ? '#65D387' : food.score >= 22 ? '#D4A853' : food.score >= 12 ? '#fb923c' : '#78716c';
                return (
                  <div key={`${food.name}-${i}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span style={{ fontSize: 9, color: 'var(--t3)', maxWidth: '60%' }} className="truncate">{food.name}</span>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 8, color: 'var(--t5)', fontFamily: 'var(--font-mono)' }}>
                          {food.protein}g P · {food.fiber}g F
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: barColor, fontFamily: 'var(--font-mono)', minWidth: 26, textAlign: 'right' }}>
                          {food.score}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
                      <motion.div
                        style={{ height: '100%', borderRadius: 2, backgroundColor: barColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ delay: i * 0.06, duration: 0.4, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scale legend */}
            <div className="flex items-center gap-1 mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.04)' }}>
              <span style={{ fontSize: 8, color: 'var(--t5)' }}>{t('density.scale_label')} →</span>
              {[['< 12', '#E87A6E', 'D'], ['12–22', '#fb923c', 'C'], ['22–35', '#D4A853', 'B'], ['35+', '#65D387', 'A']].map(([range, color, g]) => (
                <span key={g} style={{
                  fontSize: 7.5, padding: '1px 5px', borderRadius: 5,
                  background: `${color}18`, color, border: `1px solid ${color}40`,
                }}>
                  {g} {range}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
