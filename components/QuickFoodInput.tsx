'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Camera, Search, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';
import type { ParsedFoodItem } from '@/app/api/food/parse/route';
import ParsedFoodList from './ParsedFoodList';

interface QuickFoodInputProps {
  userId: string;
  mealType: MealType;
  date: string;
  onLogged: () => void;
  onSearchMode: () => void;
}

type InputMode = 'idle' | 'parsing' | 'confirming' | 'photo_analyzing';

export default function QuickFoodInput({ userId, mealType, date, onLogged, onSearchMode }: QuickFoodInputProps) {
  const { t, lang } = useI18n();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<InputMode>('idle');
  const [parsedItems, setParsedItems] = useState<ParsedFoodItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, []);

  const handleParseText = async () => {
    if (!text.trim() || mode !== 'idle') return;
    setError(null);
    setMode('parsing');

    try {
      const res = await fetch('/api/food/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), language: lang }),
      });

      const data = await res.json();

      if (!res.ok || !data.items || data.items.length === 0) {
        setError(data.error || t('food.no_items'));
        setMode('idle');
        return;
      }

      setParsedItems(data.items);
      setMode('confirming');
    } catch {
      setError('Failed to parse food');
      setMode('idle');
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setMode('photo_analyzing');

    try {
      // Resize image to max 1024px for speed and cost
      const base64 = await resizeAndEncode(file, 1024);
      const mediaType = file.type || 'image/jpeg';

      const res = await fetch('/api/ai/photo-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });

      const data = await res.json();

      if (!res.ok || !data.foods || data.foods.length === 0) {
        setError(data.error || t('food.no_items'));
        setMode('idle');
        return;
      }

      // Convert photo analysis format to ParsedFoodItem format
      const items: ParsedFoodItem[] = data.foods.map((f: {
        name: string;
        estimated_calories: number;
        estimated_protein_g: number;
        estimated_carbs_g: number;
        estimated_fat_g: number;
        confidence: number;
      }) => ({
        raw_text: f.name,
        food_name: f.name,
        name_localized: f.name,
        quantity: 1,
        unit: 'serving',
        grams: Math.round((f.estimated_calories / 1.5) || 100), // rough estimate
        calories: Math.round(f.estimated_calories),
        protein_g: Math.round(f.estimated_protein_g * 10) / 10,
        carbs_g: Math.round(f.estimated_carbs_g * 10) / 10,
        fat_g: Math.round(f.estimated_fat_g * 10) / 10,
        fiber_g: 0,
        confidence: f.confidence,
        source: 'ai_estimate' as const,
      }));

      setParsedItems(items);
      setMode('confirming');
    } catch {
      setError('Failed to analyze photo');
      setMode('idle');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirm = async (items: ParsedFoodItem[]) => {
    if (logging || items.length === 0) return;
    setLogging(true);

    try {
      const entries = items.map(item => ({
        user_id: userId,
        logged_date: date,
        meal_type: mealType,
        food_name: item.food_name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
        source: item.source === 'local_db' ? 'natural_language' : 'photo_ai',
      }));

      const { error: dbError } = await supabase.from('food_log').insert(entries);

      if (dbError) {
        console.error('Insert error:', dbError);
        setError('Failed to save entries');
        setLogging(false);
        return;
      }

      // Success — reset
      setText('');
      setParsedItems([]);
      setMode('idle');
      setLogging(false);
      onLogged();
    } catch {
      setError('Failed to save entries');
      setLogging(false);
    }
  };

  const handleCancel = () => {
    setParsedItems([]);
    setMode('idle');
    setError(null);
  };

  // Show confirmation list
  if (mode === 'confirming' && parsedItems.length > 0) {
    return (
      <ParsedFoodList
        items={parsedItems}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        logging={logging}
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* Quick text input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoResize();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleParseText();
              }
            }}
            placeholder={t('food.quick_placeholder')}
            className="input-dark w-full resize-none text-sm min-h-[44px] pr-10"
            rows={1}
            disabled={mode !== 'idle'}
          />
          {/* Camera button inside input */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={mode !== 'idle'}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:gold-text transition-colors"
            title={t('food.photo_take')}
          >
            <Camera size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoCapture}
            className="hidden"
          />
        </div>
        <button
          onClick={handleParseText}
          disabled={!text.trim() || mode !== 'idle'}
          className="btn-gold px-4 text-sm flex items-center gap-1"
        >
          {mode === 'parsing' || mode === 'photo_analyzing' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>

      {/* Loading state */}
      <AnimatePresence>
        {(mode === 'parsing' || mode === 'photo_analyzing') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass p-4 flex items-center justify-center gap-3"
          >
            <Loader2 size={16} className="animate-spin gold-text" />
            <span className="text-stone-400 text-sm">
              {mode === 'photo_analyzing' ? t('food.photo_analyzing') : t('food.parsing')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-red-400 text-xs text-center"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Search database fallback link */}
      <button
        onClick={onSearchMode}
        className="flex items-center gap-1.5 text-stone-500 hover:text-stone-300 text-xs transition-colors mx-auto"
      >
        <Search size={12} />
        {t('food.search_db')}
      </button>
    </div>
  );
}

// Resize image to max dimension and return base64 (without data: prefix)
async function resizeAndEncode(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        // Strip the data:image/jpeg;base64, prefix
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
