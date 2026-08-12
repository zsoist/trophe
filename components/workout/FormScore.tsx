'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Target, TrendingUp } from 'lucide-react';
import type { FormAnalysisResult, RepScore } from '@/lib/fitness/form-analysis';

interface FormScoreProps {
  result: FormAnalysisResult;
  exerciseName: string;
}

// ─── Score Gauge (CalorieGauge-style arc) ───
function ScoreGauge({ score, color }: { score: number; color: string }) {
  const r = 54;
  const cx = 75;
  const cy = 75;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * r;
  const arcLength = circumference * (270 / 360);
  const pct = Math.min(score / 100, 1);
  const fillLength = arcLength * pct;
  const gapLength = circumference - arcLength;

  return (
    <div className="flex flex-col items-center">
      <svg width="150" height="110" viewBox="0 0 150 110">
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--content-primary) 8%, transparent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeDashoffset={-circumference * (135 / 360)}
        />

        {/* Tick marks at 25, 50, 75, 100 */}
        {[0.25, 0.5, 0.75, 1.0].map((z) => {
          const angle = 135 + z * 270;
          const rad = (angle * Math.PI) / 180;
          const inner = r - strokeWidth / 2 - 2;
          const outer = r + strokeWidth / 2 + 2;
          return (
            <line
              key={z}
              x1={cx + inner * Math.cos(rad)}
              y1={cy + inner * Math.sin(rad)}
              x2={cx + outer * Math.cos(rad)}
              y2={cy + outer * Math.sin(rad)}
              stroke="color-mix(in srgb, var(--content-primary) 8%, transparent)"
              strokeWidth="1"
            />
          );
        })}

        {/* Filled arc */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeDashoffset={-circumference * (135 / 360)}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${fillLength} ${circumference - fillLength}` }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />

        {/* Needle */}
        {(() => {
          const needleAngle = 135 + Math.min(pct, 1) * 270;
          const needleRad = (needleAngle * Math.PI) / 180;
          const needleX = cx + (r - 15) * Math.cos(needleRad);
          const needleY = cy + (r - 15) * Math.sin(needleRad);
          return (
            <>
              <motion.line
                x1={cx}
                y1={cy}
                x2={needleX}
                y2={needleY}
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                transition={{ delay: 1 }}
              />
              <circle cx={cx} cy={cy} r="4" fill={color} />
              <circle cx={cx} cy={cy} r="2" fill="#1a1a1a" />
            </>
          );
        })()}

        {/* Center score */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--content-primary)"
          fontSize="22"
          fontWeight="bold"
        >
          {score}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--content-muted)"
          fontSize="12"
        >
          / 100
        </text>

        {/* Arc labels */}
        <text x="18" y="95" fill="var(--content-muted)" fontSize="12">0</text>
        <text x="125" y="95" fill="var(--content-muted)" fontSize="12">100</text>
      </svg>
    </div>
  );
}

// ─── Rep Detail Row ───
function RepRow({ rep }: { rep: RepScore }) {
  const [expanded, setExpanded] = useState(false);

  const angleDiffColor = (diffPct: number) => {
    if (diffPct <= 3) return 'var(--status-success-fg)';
    if (diffPct <= 8) return 'var(--action-primary)';
    if (diffPct <= 16) return 'var(--status-warning-fg)';
    if (diffPct <= 25) return 'var(--status-warning-fg)';
    return 'var(--status-danger-fg)';
  };

  return (
    <div className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: rep.assessmentColor + '22', color: rep.assessmentColor }}
        >
          {rep.rep}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm text-[var(--content-primary)] font-medium truncate">
            {rep.segmentType === 'descent' ? 'Descenso' : 'Ascenso'}
          </p>
          <p className="text-xs" style={{ color: rep.assessmentColor }}>
            {rep.assessment}
          </p>
        </div>
        <span
          className="text-lg font-bold tabular-nums"
          style={{ color: rep.assessmentColor }}
        >
          {rep.score}
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-[var(--content-muted)] shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[var(--content-muted)] shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-1.5">
              {[
                { label: 'Rodilla', data: rep.angles.knee },
                { label: 'Torso', data: rep.angles.torso },
                { label: 'Cuello', data: rep.angles.neck },
              ].map(({ label, data }) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}
                >
                  <span className="text-xs text-[var(--content-secondary)]">{label}</span>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-[var(--content-muted)]">
                      {data.avg.toFixed(1)}° / {data.refAvg.toFixed(1)}°
                    </span>
                    <span
                      className="font-semibold"
                      style={{ color: angleDiffColor(data.diffPct) }}
                    >
                      {data.diffPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───
export default function FormScore({ result, exerciseName }: FormScoreProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      {/* Overall Score Card */}
      <div className="glass p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target size={18} className="gold-text" />
          <h3 className="text-base font-semibold text-[var(--content-primary)]">{exerciseName}</h3>
        </div>

        <div className="flex flex-col items-center">
          <ScoreGauge score={result.overallScore} color={result.assessmentColor} />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-sm font-semibold mt-1 capitalize"
            style={{ color: result.assessmentColor }}
          >
            {result.overallAssessment}
          </motion.p>
          <p className="text-xs text-[var(--content-muted)] mt-1">
            {result.repsAnalyzed} {result.repsAnalyzed === 1 ? 'rep analizada' : 'reps analizadas'}
          </p>
        </div>
      </div>

      {/* Rep Breakdown */}
      {result.repScores.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-[var(--content-secondary)]" />
            <h4 className="text-sm font-semibold text-[var(--content-secondary)]">Detalle por rep</h4>
          </div>

          <div className="space-y-1">
            {result.repScores.map((rep) => (
              <RepRow key={`${rep.rep}-${rep.segmentType}`} rep={rep} />
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
