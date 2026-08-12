'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * W4 "provenance passport" — the confidence/data-quality ring that replaces the
 * old static 2px ConfidenceDot in ParsedFoodList.
 *
 * A 14px SVG ring whose arc DRAWS 0→confidence once on mount (strokeDashoffset,
 * ~0.6s) in the tier color. Under prefers-reduced-motion it renders the full arc
 * instantly (no frames scheduled). Reuses the XpRing draw math from
 * MealBadges.tsx — a background track circle plus a foreground motion.circle with
 * strokeDasharray = circumference and an animated strokeDashoffset.
 *
 * The effective tier is resolved from `data_quality` first, then falls back to
 * `confidence` bands (mission mapping: lab_verified/high→gold, label/medium→stone,
 * crowdsourced→stone-dim, estimated/low→amber). Calm styling only — no red.
 */

export type ProvenanceTier = 'lab_verified' | 'label' | 'crowdsourced' | 'estimated';

/** Ring stroke colors — gold token + stone palette + calm amber (never red). */
const TIER_COLOR: Record<ProvenanceTier, string> = {
  lab_verified: 'var(--action-primary)',
  label:        'var(--content-muted)', // stone-500
  crowdsourced: '#57534e', // stone-600 (dim)
  estimated:    'var(--status-warning-fg)', // amber-400 (calm)
};

/**
 * Resolve the display tier. `data_quality` (when present) is authoritative;
 * otherwise map the 0–1 confidence into the same four buckets so every row still
 * gets a meaningful ring color.
 */
export function resolveTier(
  dataQuality: string | null | undefined,
  confidence: number,
): ProvenanceTier {
  switch (dataQuality) {
    case 'lab_verified': return 'lab_verified';
    case 'label':        return 'label';
    case 'crowdsourced': return 'crowdsourced';
    case 'estimated':    return 'estimated';
    default:
      // Confidence fallback: high→gold, medium→stone, low→amber.
      if (confidence >= 0.8) return 'lab_verified';
      if (confidence >= 0.5) return 'label';
      return 'estimated';
  }
}

interface ProvenanceRingProps {
  /** 0–1 fill fraction — how much of the arc is drawn. */
  confidence: number;
  tier: ProvenanceTier;
  size?: number;
  /** Optional click handler — parent uses it to toggle the tap-to-explain caption. */
  onClick?: () => void;
  /** Accessible label for the interactive ring. */
  ariaLabel?: string;
  expanded?: boolean;
}

export function ProvenanceRing({
  confidence,
  tier,
  size = 14,
  onClick,
  ariaLabel,
  expanded = false,
}: ProvenanceRingProps) {
  const reduceMotion = useReducedMotion();
  const color = TIER_COLOR[tier];
  const strokeWidth = 2;
  const r = (size - strokeWidth) / 2;
  const C = 2 * Math.PI * r;
  // Clamp the fill so a tiny confidence still shows a visible sliver and 1.0 closes the ring.
  const pct = Math.max(0.06, Math.min(confidence, 1));

  const svg = (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)', display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="color-mix(in srgb, var(--content-primary) 8%, transparent)" strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={C}
        initial={{ strokeDashoffset: reduceMotion ? C * (1 - pct) : C }}
        animate={{ strokeDashoffset: C * (1 - pct) }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut', delay: 0.1 }}
      />
    </svg>
  );

  if (!onClick) {
    return <span style={{ display: 'inline-flex', flexShrink: 0 }}>{svg}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      className="inline-flex items-center justify-center flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-500 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      style={{ width: size, height: size, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      {svg}
    </button>
  );
}

export default ProvenanceRing;
