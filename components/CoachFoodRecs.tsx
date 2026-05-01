'use client';

/**
 * Coach Food Recommendations
 * ─────────────────────────────────────────────────
 * Shows food picks the coach has recommended, pulled from coach_notes
 * using the format: [Food Rec]: Name | Cal:X P:Xg C:Xg F:Xg | Coach note
 *
 * Falls back to a curated set of evidence-based Mediterranean/high-protein
 * recommendations when no coach-specific notes are found.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X, Zap } from 'lucide-react';
import { Icon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { MealType } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────
interface CoachRec {
  id: string;
  food: string;
  emoji: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  note: string;
  category: string;
  isCoachPick: boolean;
}

interface CoachFoodRecsProps {
  userId: string;
  onLogFood?: (food: CoachRec, mealType: MealType) => Promise<void>;
}

// ─── Curated fallback dataset ─────────────────────────────────
// Evidence-based picks aligned with Mediterranean diet + sports nutrition
const CURATED: CoachRec[] = [
  {
    id: 'greek-yogurt',
    food: 'Greek Yogurt',
    emoji: '🥛',
    calories: 130,
    protein: 17,
    carbs: 9,
    fat: 3,
    fiber: 0,
    note: 'High protein, live cultures for gut health. Perfect pre-bed snack or breakfast base.',
    category: 'Snack',
    isCoachPick: false,
  },
  {
    id: 'eggs-2',
    food: '2 Boiled Eggs',
    emoji: '🥚',
    calories: 156,
    protein: 12,
    carbs: 1,
    fat: 11,
    fiber: 0,
    note: 'Complete amino acid profile. Leucine-rich — triggers maximum muscle protein synthesis.',
    category: 'Breakfast',
    isCoachPick: false,
  },
  {
    id: 'chicken-150',
    food: 'Grilled Chicken 150g',
    emoji: '🍗',
    calories: 248,
    protein: 46,
    carbs: 0,
    fat: 5,
    fiber: 0,
    note: 'Leanest protein per gram. Go-to for hitting daily targets without the fat load.',
    category: 'Lunch/Dinner',
    isCoachPick: false,
  },
  {
    id: 'lentil-soup',
    food: 'Lentil Soup 250ml',
    emoji: '🍲',
    calories: 180,
    protein: 13,
    carbs: 28,
    fat: 2,
    fiber: 8,
    note: 'The only food combining high protein AND high fiber. High satiety, low glycemic index.',
    category: 'Lunch',
    isCoachPick: false,
  },
  {
    id: 'salmon-120',
    food: 'Salmon Fillet 120g',
    emoji: '🐟',
    calories: 248,
    protein: 34,
    carbs: 0,
    fat: 12,
    fiber: 0,
    note: 'Omega-3 EPA+DHA reduces inflammation by ~30%. Aim for 2× weekly minimum.',
    category: 'Dinner',
    isCoachPick: false,
  },
  {
    id: 'mixed-nuts',
    food: 'Mixed Nuts 30g',
    emoji: '🥜',
    calories: 186,
    protein: 5,
    carbs: 7,
    fat: 16,
    fiber: 2,
    note: 'Healthy monounsaturated fats. Keeps blood sugar stable between meals.',
    category: 'Snack',
    isCoachPick: false,
  },
];

// ─── Macro chip colors ────────────────────────────────────────
const MACRO_COLORS = {
  cal:     { bg: 'rgba(212,168,83,.12)',  border: 'rgba(212,168,83,.3)',  color: '#D4A853' },
  protein: { bg: 'rgba(232,122,110,.12)', border: 'rgba(232,122,110,.3)', color: '#E87A6E' },
  carbs:   { bg: 'rgba(125,163,217,.12)', border: 'rgba(125,163,217,.3)', color: '#7DA3D9' },
  fat:     { bg: 'rgba(184,157,217,.12)', border: 'rgba(184,157,217,.3)', color: '#B89DD9' },
  fiber:   { bg: 'rgba(101,211,135,.12)', border: 'rgba(101,211,135,.3)', color: '#65D387' },
};

// ─── MacroChip ────────────────────────────────────────────────
function MacroChip({ label, value, unit = 'g', colorKey }: {
  label: string;
  value: number;
  unit?: string;
  colorKey: keyof typeof MACRO_COLORS;
}) {
  const c = MACRO_COLORS[colorKey];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 6,
      background: c.bg, border: `1px solid ${c.border}`,
      fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
      color: c.color, flexShrink: 0,
    }}>
      <span style={{ fontSize: 7, fontWeight: 400, color: 'var(--t5)' }}>{label}</span>
      {value}{unit}
    </span>
  );
}

// ─── Category label helper ────────────────────────────────────
function useCategoryLabel(category: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    'Snack':       t('food.snack'),
    'Breakfast':   t('food.breakfast'),
    'Lunch':       t('food.lunch'),
    'Dinner':      t('food.dinner'),
    'Lunch/Dinner':t('recs.lunch_dinner'),
    'coach_pick':  t('recs.coach_pick'),
    'Coach Pick':  t('recs.coach_pick'),
  };
  return map[category] ?? category;
}

// ─── Food detail overlay ──────────────────────────────────────
function RecDetailSheet({ rec, onClose, onLog }: {
  rec: CoachRec;
  onClose: () => void;
  onLog?: (mealType: MealType) => void;
}) {
  const { t } = useI18n();
  const MEAL_OPTIONS: { type: MealType; label: string; icon: string }[] = [
    { type: 'breakfast',    label: t('food.breakfast'), icon: '☀️' },
    { type: 'snack',        label: t('food.snack'),     icon: '🍎' },
    { type: 'lunch',        label: t('food.lunch'),     icon: '🥗' },
    { type: 'dinner',       label: t('food.dinner'),    icon: '🌙' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 448,
          background: 'var(--bg-1,#111)',
          borderRadius: '20px 20px 0 0',
          border: '1px solid rgba(255,255,255,.08)',
          padding: '20px 20px 32px',
        }}
      >
        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,.15)',
          margin: '-8px auto 16px',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: 'rgba(212,168,83,.08)',
            border: '1px solid rgba(212,168,83,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>
            {rec.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.2, marginBottom: 4 }}>
              {rec.food}
            </div>
            <span style={{
              display: 'inline-block', fontSize: 9, padding: '2px 7px',
              borderRadius: 6, background: 'rgba(212,168,83,.1)',
              border: '1px solid rgba(212,168,83,.2)',
              color: 'var(--gold-300,#D4A853)', fontWeight: 600,
            }}>
              {useCategoryLabel(rec.isCoachPick ? 'coach_pick' : rec.category, t)}
            </span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--t5)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Macros grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6,
          padding: '10px 12px', borderRadius: 12,
          background: 'rgba(255,255,255,.03)',
          border: '1px solid rgba(255,255,255,.06)',
          marginBottom: 14,
        }}>
          {[
            { label: 'Cal', val: rec.calories, unit: 'kcal', c: MACRO_COLORS.cal },
            { label: 'P',   val: rec.protein,  unit: 'g',    c: MACRO_COLORS.protein },
            { label: 'C',   val: rec.carbs,    unit: 'g',    c: MACRO_COLORS.carbs },
            { label: 'F',   val: rec.fat,      unit: 'g',    c: MACRO_COLORS.fat },
            { label: 'Fib', val: rec.fiber,    unit: 'g',    c: MACRO_COLORS.fiber },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: m.c.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                {m.val}
              </div>
              <div style={{ fontSize: 7, color: 'var(--t4)', marginTop: 2 }}>{m.unit}</div>
              <div style={{ fontSize: 7, color: 'var(--t5)' }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Coach note */}
        <div style={{
          padding: '10px 12px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(212,168,83,.06)',
          border: '1px solid rgba(212,168,83,.15)',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="i-user" size={12} style={{ color: 'var(--gold-300,#D4A853)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, fontStyle: 'italic' }}>
              &ldquo;{rec.note}&rdquo;
            </p>
          </div>
        </div>

        {/* Log to meal */}
        {onLog && (
          <div>
            <p style={{ fontSize: 9, color: 'var(--t5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {t('recs.log_to_meal')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
              {MEAL_OPTIONS.map(m => (
                <motion.button
                  key={m.type}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onLog(m.type)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,.08)',
                    background: 'rgba(255,255,255,.04)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 7,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{m.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>{m.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Food rec card ────────────────────────────────────────────
function RecCard({ rec, index, onSelect }: {
  rec: CoachRec;
  index: number;
  onSelect: (rec: CoachRec) => void;
}) {
  const { t } = useI18n();
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06, duration: 0.28, ease: 'easeOut' }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(rec)}
      style={{
        background: 'rgba(255,255,255,.035)',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 14,
        padding: '11px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Coach pick accent */}
      {rec.isCoachPick && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: 0, height: 0,
          borderStyle: 'solid',
          borderWidth: '0 22px 22px 0',
          borderColor: 'transparent rgba(212,168,83,.45) transparent transparent',
        }} />
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Emoji avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: 'rgba(255,255,255,.05)',
          border: '1px solid rgba(255,255,255,.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          {rec.emoji}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
              {rec.food}
            </span>
            <span style={{
              fontSize: 8, padding: '2px 6px', borderRadius: 5,
              background: 'rgba(212,168,83,.1)',
              color: 'var(--gold-300,#D4A853)',
              border: '1px solid rgba(212,168,83,.2)',
              fontWeight: 600, flexShrink: 0,
            }}>
              {useCategoryLabel(rec.category, t)}
            </span>
          </div>

          {/* Macro chips row */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            <MacroChip label="Cal" value={rec.calories} unit="kcal" colorKey="cal" />
            <MacroChip label="P" value={rec.protein} colorKey="protein" />
            <MacroChip label="C" value={rec.carbs} colorKey="carbs" />
            <MacroChip label="F" value={rec.fat} colorKey="fat" />
            {rec.fiber > 0 && <MacroChip label="Fib" value={rec.fiber} colorKey="fiber" />}
          </div>

          {/* Coach note preview */}
          <p style={{
            fontSize: 9.5, color: 'var(--t4)', lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {rec.note}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Main component ───────────────────────────────────────────
export default function CoachFoodRecs({ userId, onLogFood }: CoachFoodRecsProps) {
  const { t } = useI18n();
  const [recs, setRecs] = useState<CoachRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [selectedRec, setSelectedRec] = useState<CoachRec | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const [isCoachData, setIsCoachData] = useState(false);

  useEffect(() => {
    async function loadRecs() {
      // Try to fetch coach-formatted food recommendations
      // Coach adds notes like: [Food Rec]: Chicken breast | Cal:248 P:46g C:0g F:5g | Great lean protein
      const { data } = await supabase
        .from('coach_notes')
        .select('id, note, created_at')
        .eq('client_id', userId)
        .like('note', '[Food Rec]:%')
        .order('created_at', { ascending: false })
        .limit(8);

      if (data && data.length > 0) {
        const parsed = data.map(n => {
          const content = n.note.replace('[Food Rec]:', '').trim();
          const parts = content.split('|').map((p: string) => p.trim());
          const food = parts[0] || 'Food';
          const macros = parts[1] || '';
          const note = parts[2] || 'Recommended by your coach.';

          const calories = parseInt(macros.match(/Cal:(\d+)/)?.[1] || '0');
          const protein  = parseInt(macros.match(/P:(\d+)/)?.[1]   || '0');
          const carbs    = parseInt(macros.match(/C:(\d+)/)?.[1]   || '0');
          const fat      = parseInt(macros.match(/F:(\d+)/)?.[1]   || '0');
          const fiber    = parseInt(macros.match(/Fib:(\d+)/)?.[1] || '0');

          return {
            id: n.id,
            food, calories, protein, carbs, fat, fiber, note,
            emoji: '⭐', category: 'coach_pick', isCoachPick: true,
          } as CoachRec;
        });
        setRecs(parsed);
        setIsCoachData(true);
      } else {
        setRecs(CURATED);
        setIsCoachData(false);
      }
      setLoading(false);
    }

    void loadRecs();
  }, [userId]);

  const handleLog = async (rec: CoachRec, mealType: MealType) => {
    if (!onLogFood || loggingId) return;
    setLoggingId(rec.id);
    try {
      await onLogFood(rec, mealType);
      setLoggedId(rec.id);
      setSelectedRec(null);
      setTimeout(() => setLoggedId(null), 2500);
    } finally {
      setLoggingId(null);
    }
  };

  if (loading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-3"
    >
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Icon name="i-user" size={13} style={{ color: 'var(--gold-300,#D4A853)' }} />
          <span className="text-stone-300 text-xs font-semibold">
            {isCoachData ? t('recs.coach_food_picks') : t('recs.recommended_foods')}
          </span>
          {isCoachData && (
            <span style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 5,
              background: 'rgba(212,168,83,.1)',
              color: 'var(--gold-300,#D4A853)',
              border: '1px solid rgba(212,168,83,.2)',
              fontWeight: 700,
            }}>
              COACH
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 9, color: 'var(--t5)' }}>{t('recs.foods_count', { n: recs.length })}</span>
          {expanded
            ? <ChevronUp size={13} className="text-stone-500" />
            : <ChevronDown size={13} className="text-stone-500" />
          }
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
            <div className="mt-3 space-y-2">
              {recs.slice(0, 6).map((rec, i) => (
                <div key={rec.id} style={{ position: 'relative' }}>
                  <RecCard rec={rec} index={i} onSelect={setSelectedRec} />
                  {/* Logged badge */}
                  <AnimatePresence>
                    {loggedId === rec.id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        style={{
                          position: 'absolute', inset: 0,
                          borderRadius: 14,
                          background: 'rgba(101,211,135,.12)',
                          border: '1px solid rgba(101,211,135,.35)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="i-check" size={14} style={{ color: 'var(--ok,#65D387)' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ok,#65D387)' }}>{t('recs.logged')}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div style={{
              marginTop: 10, padding: '7px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,.02)',
              border: '1px solid rgba(255,255,255,.05)',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <Zap size={10} style={{ color: 'var(--t5)', flexShrink: 0 }} />
              <p style={{ fontSize: 9, color: 'var(--t5)', lineHeight: 1.4 }}>
                {isCoachData ? t('recs.coach_footer') : t('recs.curated_footer')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail sheet */}
      <AnimatePresence>
        {selectedRec && (
          <RecDetailSheet
            rec={selectedRec}
            onClose={() => setSelectedRec(null)}
            onLog={onLogFood ? (mt) => handleLog(selectedRec, mt) : undefined}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
