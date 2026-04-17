'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Clock, Flame, Beef } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';

interface SearchResult {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  unit: string;
  source: 'usda' | 'openfoodfacts' | 'custom' | 'local';
  source_id?: string;
  category?: string;
}

interface FoodSearchModalProps {
  userId: string;
  mealType: MealType;
  date: string;
  onLogged: () => void;
  onClose: () => void;
}

const RECENT_KEY = 'trophe_recent_foods';
const MAX_RECENT = 15;

type CategoryFilter = 'all' | 'protein' | 'carbs' | 'vegetable' | 'fruit' | 'dairy';

const CATEGORY_CHIPS: { key: CategoryFilter; label: string; emoji: string }[] = [
  { key: 'all', label: 'All', emoji: '' },
  { key: 'protein', label: 'Protein', emoji: '🥩' },
  { key: 'carbs', label: 'Carbs', emoji: '🍞' },
  { key: 'vegetable', label: 'Veggie', emoji: '🥦' },
  { key: 'fruit', label: 'Fruit', emoji: '🍎' },
  { key: 'dairy', label: 'Dairy', emoji: '🧀' },
];

function loadRecent(): SearchResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: SearchResult) {
  const recent = loadRecent().filter((r) => r.name !== item.name);
  const updated = [item, ...recent].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}

export default function FoodSearchModal({
  userId,
  mealType,
  date,
  onLogged,
  onClose,
}: FoodSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [logging, setLogging] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [localRes, apiRes] = await Promise.allSettled([
          fetch(`/api/food/local-search?q=${encodeURIComponent(query)}`).then((r) => r.json()),
          fetch(`/api/food/search?q=${encodeURIComponent(query)}`).then((r) => r.json()),
        ]);

        const localData: SearchResult[] =
          localRes.status === 'fulfilled' && Array.isArray(localRes.value?.foods)
            ? localRes.value.foods.map((f: Record<string, unknown>) => ({
                name: f.name as string,
                calories: (f.calories as number) ?? 0,
                protein_g: (f.protein_g as number) ?? 0,
                carbs_g: (f.carbs_g as number) ?? 0,
                fat_g: (f.fat_g as number) ?? 0,
                fiber_g: (f.fiber_g as number) ?? 0,
                unit: (f.unit as string) ?? 'serving',
                source: 'local' as const,
                category: (f.category as string) ?? '',
              }))
            : [];

        const apiData: SearchResult[] =
          apiRes.status === 'fulfilled' && Array.isArray(apiRes.value?.foods)
            ? apiRes.value.foods.map((f: Record<string, unknown>) => ({
                name: f.description as string ?? f.name as string,
                calories: (f.calories as number) ?? 0,
                protein_g: (f.protein_g as number) ?? 0,
                carbs_g: (f.carbs_g as number) ?? 0,
                fat_g: (f.fat_g as number) ?? 0,
                fiber_g: (f.fiber_g as number) ?? 0,
                unit: (f.unit as string) ?? 'serving',
                source: 'usda' as const,
                source_id: String(f.fdcId ?? ''),
                category: (f.category as string) ?? '',
              }))
            : [];

        // Deduplicate by name, prefer local
        const seen = new Set<string>();
        const combined: SearchResult[] = [];
        for (const item of [...localData, ...apiData]) {
          const key = item.name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(item);
          }
        }

        setResults(combined);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const filteredResults = category === 'all'
    ? results
    : results.filter((r) => r.category?.toLowerCase().includes(category));

  const logFood = useCallback(
    async (item: SearchResult) => {
      setLogging(item.name);
      try {
        const { error } = await supabase.from('food_log').insert({
          user_id: userId,
          logged_date: date,
          meal_type: mealType,
          food_name: item.name,
          quantity: 1,
          unit: item.unit,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          fiber_g: item.fiber_g,
          source: item.source === 'local' ? 'custom' : item.source,
          source_id: item.source_id ?? null,
        });

        if (!error) {
          saveRecent(item);
          setSuccess(true);
          setTimeout(() => {
            onLogged();
            onClose();
          }, 600);
        }
      } finally {
        setLogging(null);
      }
    },
    [userId, date, mealType, onLogged, onClose]
  );

  const displayResults = query.trim() ? filteredResults : recent;
  const showingRecent = !query.trim() && recent.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-stone-950/95 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute inset-x-0 bottom-0 top-12 bg-stone-950 rounded-t-2xl border-t border-white/10 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-stone-200 text-sm font-semibold">Search Foods</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-[#D4A853]/40"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {CATEGORY_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => setCategory(chip.key)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                category === chip.key
                  ? 'bg-[#D4A853]/20 border-[#D4A853]/40 text-[#D4A853]'
                  : 'border-white/5 text-stone-400 hover:border-white/10'
              }`}
            >
              {chip.emoji && <span className="mr-1">{chip.emoji}</span>}
              {chip.label}
            </button>
          ))}
        </div>

        {/* Section label */}
        {showingRecent && (
          <div className="px-4 pb-2">
            <p className="text-stone-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
              <Clock size={10} /> Recently Used
            </p>
          </div>
        )}

        {/* Results list */}
        <div className="flex-1 overflow-y-auto px-4 pb-24">
          {loading && (
            <div className="text-stone-500 text-sm text-center py-8 animate-pulse">Searching...</div>
          )}

          {!loading && query.trim() && displayResults.length === 0 && (
            <div className="text-stone-500 text-sm text-center py-8">No foods found</div>
          )}

          <AnimatePresence>
            {!loading &&
              displayResults.map((item, i) => (
                <motion.button
                  key={`${item.name}-${item.source}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => logFood(item)}
                  disabled={logging === item.name}
                  className="w-full flex items-center justify-between py-3 border-b border-white/[0.03] hover:bg-white/[0.02] rounded-lg px-2 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-stone-200 text-sm truncate">{item.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-stone-500 text-[10px] flex items-center gap-0.5">
                        <Flame size={8} className="text-orange-400" /> {Math.round(item.calories)} cal
                      </span>
                      <span className="text-stone-500 text-[10px] flex items-center gap-0.5">
                        <Beef size={8} className="text-red-400" /> {Math.round(item.protein_g)}g protein
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-stone-600 uppercase">{item.source}</div>
                </motion.button>
              ))}
          </AnimatePresence>
        </div>

        {/* Success overlay */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="text-4xl mb-2"
                >
                  ✓
                </motion.div>
                <p className="text-[#D4A853] font-medium">Food logged!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
