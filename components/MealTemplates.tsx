'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';

interface TemplateItem {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

interface MealTemplate {
  id: string;
  name: string;
  emoji: string;
  items: TemplateItem[];
}

interface MealTemplatesProps {
  userId: string;
  mealType: MealType;
  date: string;
  onLogged: () => void;
}

const STORAGE_KEY = 'trophe_meal_templates';
const MAX_TEMPLATES = 10;

function loadTemplates(): MealTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: MealTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export default function MealTemplates({
  userId,
  mealType,
  date,
  onLogged,
}: MealTemplatesProps) {
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [logging, setLogging] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveEmoji, setSaveEmoji] = useState('🍽️');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  const logTemplate = useCallback(
    async (template: MealTemplate) => {
      setLogging(template.id);
      try {
        const rows = template.items.map((item) => ({
          user_id: userId,
          logged_date: date,
          meal_type: mealType,
          food_name: item.food_name,
          quantity: 1,
          unit: 'serving',
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          fiber_g: item.fiber_g,
          source: 'custom' as const,
        }));

        const { error } = await supabase.from('food_log').insert(rows);
        if (!error) {
          setFlash(template.id);
          setTimeout(() => setFlash(null), 1200);
          onLogged();
        }
      } finally {
        setLogging(null);
      }
    },
    [userId, date, mealType, onLogged]
  );

  const saveCurrentMeal = useCallback(async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const { data } = await supabase
        .from('food_log')
        .select('food_name, calories, protein_g, carbs_g, fat_g, fiber_g')
        .eq('user_id', userId)
        .eq('logged_date', date)
        .eq('meal_type', mealType);

      if (!data || data.length === 0) {
        setSaving(false);
        return;
      }

      const newTemplate: MealTemplate = {
        id: crypto.randomUUID(),
        name: saveName.trim(),
        emoji: saveEmoji,
        items: data.map((d) => ({
          food_name: d.food_name,
          calories: d.calories ?? 0,
          protein_g: d.protein_g ?? 0,
          carbs_g: d.carbs_g ?? 0,
          fat_g: d.fat_g ?? 0,
          fiber_g: d.fiber_g ?? 0,
        })),
      };

      const updated = [newTemplate, ...templates].slice(0, MAX_TEMPLATES);
      setTemplates(updated);
      saveTemplates(updated);
      setShowSave(false);
      setSaveName('');
    } finally {
      setSaving(false);
    }
  }, [saveName, saveEmoji, userId, date, mealType, templates]);

  const deleteTemplate = useCallback(
    (id: string) => {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated);
      saveTemplates(updated);
    },
    [templates]
  );

  if (templates.length === 0 && !showSave) {
    return (
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setShowSave(true)}
          className="text-stone-500 text-xs flex items-center gap-1 hover:text-[#D4A853] transition-colors"
        >
          <BookmarkPlus size={12} /> Save meal as template
        </button>
      </div>
    );
  }

  return (
    <div className="mb-2">
      {/* Template chips */}
      {templates.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ height: '40px' }}>
          {templates.map((template) => {
            const totalCal = template.items.reduce((s, i) => s + i.calories, 0);
            const isLogging = logging === template.id;
            const isFlash = flash === template.id;

            return (
              <motion.button
                key={template.id}
                onClick={() => logTemplate(template)}
                disabled={isLogging}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  isFlash
                    ? 'bg-[#D4A853]/20 border-[#D4A853]/40 text-[#D4A853]'
                    : 'glass-elevated border-white/5 text-stone-300 hover:border-[#D4A853]/30 hover:text-[#D4A853]'
                }`}
                whileTap={{ scale: 0.95 }}
                layout
              >
                {isLogging ? (
                  <span className="animate-spin text-[10px]">...</span>
                ) : (
                  <>
                    <span>{template.emoji}</span>
                    <span>{template.name}</span>
                    <span className="text-stone-500 text-[10px]">{totalCal}cal</span>
                  </>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTemplate(template.id);
                  }}
                  className="ml-0.5 text-stone-600 hover:text-red-400 transition-colors"
                >
                  <X size={10} />
                </button>
              </motion.button>
            );
          })}

          {/* Save button chip */}
          <button
            onClick={() => setShowSave(true)}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-stone-500 border border-dashed border-stone-700 hover:border-[#D4A853]/40 hover:text-[#D4A853] transition-colors"
          >
            <BookmarkPlus size={10} />
          </button>
        </div>
      )}

      {/* Save modal */}
      <AnimatePresence>
        {showSave && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => {
                  const emojis = ['🍽️', '🥗', '🍳', '🥩', '🍜', '🥤', '🍕', '🌮', '🥑', '🍱'];
                  const idx = emojis.indexOf(saveEmoji);
                  setSaveEmoji(emojis[(idx + 1) % emojis.length]);
                }}
                className="text-lg"
              >
                {saveEmoji}
              </button>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Template name..."
                maxLength={24}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-[#D4A853]/40"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveCurrentMeal()}
              />
              <button
                onClick={saveCurrentMeal}
                disabled={saving || !saveName.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#D4A853]/20 text-[#D4A853] text-xs font-medium disabled:opacity-40 hover:bg-[#D4A853]/30 transition-colors"
              >
                {saving ? '...' : 'Save'}
              </button>
              <button
                onClick={() => setShowSave(false)}
                className="text-stone-500 hover:text-stone-300"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
