'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { FoodLogEntry } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

interface MealBadgesProps {
  todayLog: FoodLogEntry[];
  streak: number;
  targets: { protein_g: number };
}

interface Badge {
  id: string;
  icon: IconName;
  name: string;
  description: string;
  earned: boolean;
  progress?: number;   // 0–1
  progressLabel?: string;
  xp: number;
  rarity: 'common' | 'rare' | 'legendary';
}

const RARITY_COLOR: Record<string, string> = {
  common:    '#78716c',
  rare:      '#7DA3D9',
  legendary: '#D4A853',
};
const RARITY_BG: Record<string, string> = {
  common:    'rgba(120,113,108,.12)',
  rare:      'rgba(125,163,217,.12)',
  legendary: 'rgba(212,168,83,.12)',
};
const RARITY_BORDER: Record<string, string> = {
  common:    'rgba(120,113,108,.25)',
  rare:      'rgba(125,163,217,.25)',
  legendary: 'rgba(212,168,83,.3)',
};

function loadEarnedBadges(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('trophe_badges') || '[]')); }
  catch { return new Set(); }
}
function saveEarnedBadge(id: string) {
  const earned = loadEarnedBadges(); earned.add(id);
  localStorage.setItem('trophe_badges', JSON.stringify([...earned]));
}

// XP ring SVG
function XpRing({ pct, color, size = 40 }: { pct: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={4} />
      <motion.circle
        cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={4} strokeLinecap="round"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - pct) }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
      />
    </svg>
  );
}

export default function MealBadges({ todayLog, streak, targets }: MealBadgesProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [newBadge, setNewBadge] = useState<string | null>(null);
  const [earnedSet, setEarnedSet] = useState<Set<string>>(() => loadEarnedBadges());

  const badges: Badge[] = useMemo(() => {
    const mealTypes   = new Set(todayLog.map(e => e.meal_type));
    const totalProtein = todayLog.reduce((s, e) => s + (e.protein_g ?? 0), 0);
    const hasPhoto    = todayLog.some(e => e.source === 'photo_ai');
    const mealsToday  = todayLog.length;
    const mealTypeCount = mealTypes.size;

    const allFive = mealTypeCount >= 3 && (
      mealTypes.has('breakfast') && mealTypes.has('lunch') && mealTypes.has('dinner')
    );
    const proteinHit  = targets.protein_g > 0 && totalProtein >= targets.protein_g;
    const proteinPct  = targets.protein_g > 0 ? Math.min(totalProtein / targets.protein_g, 1) : 0;

    return [
      {
        id: 'first_meal', icon: 'i-flame' as IconName,
        name: t('badge.first_meal'), description: t('badge.desc_first_meal'),
        earned: mealsToday > 0 || earnedSet.has('first_meal'),
        progress: Math.min(mealsToday, 1),
        progressLabel: mealsToday > 0 ? '1/1' : '0/1',
        xp: 10, rarity: 'common' as const,
      },
      {
        id: 'three_meals', icon: 'i-bowl' as IconName,
        name: t('badge.triple_log'), description: t('badge.desc_triple_log'),
        earned: mealsToday >= 3 || earnedSet.has('three_meals'),
        progress: Math.min(mealsToday / 3, 1),
        progressLabel: `${Math.min(mealsToday, 3)}/3`,
        xp: 25, rarity: 'common' as const,
      },
      {
        id: 'protein_hit', icon: 'i-dumbbell' as IconName,
        name: t('badge.protein_champion'), description: t('badge.desc_protein'),
        earned: proteinHit || earnedSet.has('protein_hit'),
        progress: proteinPct,
        progressLabel: targets.protein_g > 0 ? `${Math.round(totalProtein)}/${targets.protein_g}g` : '—',
        xp: 40, rarity: 'rare' as const,
      },
      {
        id: 'photo_log', icon: 'i-camera' as IconName,
        name: t('badge.photo_logger'), description: t('badge.desc_photo'),
        earned: hasPhoto || earnedSet.has('photo_log'),
        progress: hasPhoto ? 1 : 0,
        progressLabel: hasPhoto ? t('badge.done') : t('badge.not_yet'),
        xp: 30, rarity: 'rare' as const,
      },
      {
        id: 'all_meals', icon: 'i-sparkle' as IconName,
        name: t('badge.full_day'), description: t('badge.desc_full_day'),
        earned: allFive || earnedSet.has('all_meals'),
        progress: Math.min(mealTypeCount / 3, 1),
        progressLabel: `${Math.min(mealTypeCount, 3)}/3`,
        xp: 50, rarity: 'rare' as const,
      },
      {
        id: 'streak_7', icon: 'i-target' as IconName,
        name: t('badge.streak_7'), description: t('badge.desc_streak_7'),
        earned: streak >= 7 || earnedSet.has('streak_7'),
        progress: Math.min(streak / 7, 1),
        progressLabel: `${Math.min(streak, 7)}/7d`,
        xp: 75, rarity: 'rare' as const,
      },
      {
        id: 'streak_30', icon: 'i-trophy' as IconName,
        name: t('badge.streak_30'), description: t('badge.desc_streak_30'),
        earned: streak >= 30 || earnedSet.has('streak_30'),
        progress: Math.min(streak / 30, 1),
        progressLabel: `${Math.min(streak, 30)}/30d`,
        xp: 200, rarity: 'legendary' as const,
      },
      {
        id: 'streak_100', icon: 'i-zap' as IconName,
        name: t('badge.century'), description: t('badge.desc_century'),
        earned: streak >= 100 || earnedSet.has('streak_100'),
        progress: Math.min(streak / 100, 1),
        progressLabel: `${Math.min(streak, 100)}/100d`,
        xp: 500, rarity: 'legendary' as const,
      },
    ];
  }, [todayLog, streak, targets, earnedSet, t]);

  // Detect newly earned
  useEffect(() => {
    const newlyEarned = badges.find(b => b.earned && !earnedSet.has(b.id));
    if (!newlyEarned) return;
    const timer = window.setTimeout(() => {
      saveEarnedBadge(newlyEarned.id);
      setEarnedSet(prev => new Set([...prev, newlyEarned.id]));
      setNewBadge(newlyEarned.id);
      window.setTimeout(() => setNewBadge(null), 4000);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [badges, earnedSet]);

  const earnedCount = badges.filter(b => b.earned).length;
  const totalXp     = badges.filter(b => b.earned).reduce((s, b) => s + b.xp, 0);

  if (earnedCount === 0 && todayLog.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-3 mb-4"
    >
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <Icon name="i-trophy" size={14} style={{ color: 'var(--gold-300,#D4A853)' }} />
          <span className="text-stone-300 text-xs font-semibold">{t('badge.achievements')}</span>
          <span className="text-stone-600 text-[10px]">{earnedCount}/{badges.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* XP badge */}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
            background: 'rgba(212,168,83,.1)', border: '1px solid rgba(212,168,83,.25)', color: 'var(--gold-300,#D4A853)',
            fontFamily: 'var(--font-mono)',
          }}>
            {totalXp} XP
          </span>
          {/* Mini icon row */}
          <div className="flex gap-0.5">
            {badges.filter(b => b.earned).slice(0, 4).map(b => (
              <span key={b.id} style={{ color: RARITY_COLOR[b.rarity] }}>
                <Icon name={b.icon} size={13} />
              </span>
            ))}
          </div>
          {expanded ? <ChevronUp size={12} className="text-stone-500 ml-0.5" /> : <ChevronDown size={12} className="text-stone-500 ml-0.5" />}
        </div>
      </button>

      {/* New badge pop */}
      <AnimatePresence>
        {newBadge && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            className="mt-2 px-3 py-2 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(212,168,83,.1)', border: '1px solid rgba(212,168,83,.3)' }}
          >
            <Icon name="i-sparkle" size={13} style={{ color: 'var(--gold-300,#D4A853)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600 }}>
              {badges.find(b => b.id === newBadge)?.name} unlocked! +{badges.find(b => b.id === newBadge)?.xp} XP
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="grid grid-cols-4 gap-2">
              {badges.map((badge, i) => {
                const color  = RARITY_COLOR[badge.rarity];
                const isNew  = newBadge === badge.id;

                return (
                  <motion.div
                    key={badge.id}
                    initial={isNew ? { scale: 0 } : { opacity: 0, y: 8 }}
                    animate={isNew ? { scale: [0, 1.3, 1] } : { opacity: 1, y: 0 }}
                    transition={isNew
                      ? { type: 'spring', stiffness: 300, damping: 12 }
                      : { delay: i * 0.04, duration: 0.25 }
                    }
                    style={{
                      background: badge.earned ? RARITY_BG[badge.rarity] : 'rgba(255,255,255,.02)',
                      border: `1px solid ${badge.earned ? RARITY_BORDER[badge.rarity] : 'rgba(255,255,255,.05)'}`,
                      borderRadius: 12, padding: '8px 4px',
                      opacity: badge.earned ? 1 : 0.45,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      position: 'relative',
                    }}
                  >
                    {/* XP ring + icon */}
                    <div style={{ position: 'relative', width: 40, height: 40 }}>
                      <XpRing pct={badge.progress ?? (badge.earned ? 1 : 0)} color={color} size={40} />
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name={badge.icon} size={15} style={{ color }} />
                      </div>
                    </div>

                    <p style={{ fontSize: 8, color: badge.earned ? 'var(--t2)' : 'var(--t5)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                      {badge.name}
                    </p>
                    {badge.progressLabel && !badge.earned && (
                      <p style={{ fontSize: 7, color: 'var(--t5)', fontFamily: 'var(--font-mono)' }}>
                        {badge.progressLabel}
                      </p>
                    )}
                    {badge.earned && (
                      <span style={{ fontSize: 7, color, fontWeight: 700 }}>+{badge.xp}XP</span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* XP total bar */}
            <div className="mt-3 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ fontSize: 9, color: 'var(--t4)' }}>{t('badge.total_xp')}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold-300,#D4A853)', fontFamily: 'var(--font-mono)' }}>
                  {totalXp} / {badges.reduce((s, b) => s + b.xp, 0)} XP
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
                <motion.div
                  style={{
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg,var(--gold-400,#B8923E),var(--gold-200,#E8C078))',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(totalXp / badges.reduce((s, b) => s + b.xp, 0)) * 100}%` }}
                  transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
