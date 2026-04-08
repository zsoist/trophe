'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Camera, Search, Loader2, Mic, MicOff, Plus, CheckCircle2, RotateCcw } from 'lucide-react';
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

type InputMode = 'idle' | 'parsing' | 'confirming' | 'photo_analyzing' | 'success' | 'manual_entry' | 'listening';
type InputSource = 'text' | 'photo';

export default function QuickFoodInput({ userId, mealType, date, onLogged, onSearchMode }: QuickFoodInputProps) {
  const { t, lang } = useI18n();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<InputMode>('idle');
  const [parsedItems, setParsedItems] = useState<ParsedFoodItem[]>([]);
  const [inputSource, setInputSource] = useState<InputSource>('text');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [logging, setLogging] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTextRef = useRef('');
  const lastFileRef = useRef<File | null>(null);

  // Manual entry state
  const [manualCal, setManualCal] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualName, setManualName] = useState('');

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
    lastTextRef.current = text.trim();

    try {
      const res = await fetch('/api/food/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), language: lang }),
      });

      const data = await res.json();

      if (!res.ok || !data.items || data.items.length === 0) {
        setError(data.error || t('food.no_items'));
        setRetryCount(prev => prev + 1);
        setMode('idle');
        return;
      }

      setRetryCount(0);
      setParsedItems(data.items);
      setInputSource('text');
      setMode('confirming');
    } catch {
      setError('Failed to parse food');
      setRetryCount(prev => prev + 1);
      setMode('idle');
    }
  };

  const handleRetry = () => {
    setError(null);
    if (lastFileRef.current) {
      processImageFile(lastFileRef.current);
    } else if (lastTextRef.current) {
      setText(lastTextRef.current);
      setMode('idle');
      setTimeout(() => handleParseText(), 100);
    }
  };

  const processImageFile = async (file: File) => {
    setError(null);
    setMode('photo_analyzing');
    lastFileRef.current = file;

    // Create preview thumbnail
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);

    try {
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
        setRetryCount(prev => prev + 1);
        setMode('idle');
        return;
      }

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
        grams: Math.round((f.estimated_calories / 1.5) || 100),
        calories: Math.round(f.estimated_calories),
        protein_g: Math.round(f.estimated_protein_g * 10) / 10,
        carbs_g: Math.round(f.estimated_carbs_g * 10) / 10,
        fat_g: Math.round(f.estimated_fat_g * 10) / 10,
        fiber_g: 0,
        confidence: f.confidence,
        source: 'ai_estimate' as const,
      }));

      setRetryCount(0);
      setParsedItems(items);
      setInputSource('photo');
      setMode('confirming');
    } catch {
      setError('Failed to analyze photo');
      setRetryCount(prev => prev + 1);
      setMode('idle');
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle paste — supports pasting images from clipboard
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await processImageFile(file);
          return;
        }
      }
    }
  };

  // F15: Voice input via Web Speech API
  const startVoiceInput = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Voice input not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'el' ? 'el-GR' : lang === 'es' ? 'es-ES' : 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setMode('listening');
    recognition.start();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setText(transcript);
      setMode('idle');
      setTimeout(() => {
        if (transcript.trim()) {
          lastTextRef.current = transcript.trim();
          handleParseText();
        }
      }, 300);
    };

    recognition.onerror = () => {
      setMode('idle');
      setError('Could not recognize speech');
    };

    recognition.onend = () => {
      if (mode === 'listening') setMode('idle');
    };
  };

  // F21: Manual entry (quick add)
  const handleManualEntry = async () => {
    const calories = parseInt(manualCal) || 0;
    if (calories === 0) return;

    setLogging(true);
    const entry = {
      user_id: userId,
      logged_date: date,
      meal_type: mealType,
      food_name: manualName.trim() || `Quick add — ${calories} kcal`,
      quantity: 1,
      unit: 'serving',
      calories,
      protein_g: parseFloat(manualProtein) || 0,
      carbs_g: parseFloat(manualCarbs) || 0,
      fat_g: parseFloat(manualFat) || 0,
      fiber_g: 0,
      source: 'custom' as const,
    };

    const { error: dbError } = await supabase.from('food_log').insert(entry);
    setLogging(false);

    if (dbError) {
      console.error('Manual entry error:', dbError);
      setError('Failed to save');
      return;
    }

    setSuccessCount(1);
    setMode('success');
    setManualCal('');
    setManualProtein('');
    setManualCarbs('');
    setManualFat('');
    setManualName('');
    setTimeout(() => {
      setMode('idle');
      setSuccessCount(0);
      onLogged();
    }, 1500);
  };

  const handleConfirm = async (items: ParsedFoodItem[]) => {
    if (logging || items.length === 0) return;
    setLogging(true);

    try {
      const dbSource = inputSource === 'photo' ? 'photo_ai' : 'custom';
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
        source: dbSource,
      }));

      const { error: dbError } = await supabase.from('food_log').insert(entries);

      if (dbError) {
        console.error('Insert error:', dbError);
        setError('Failed to save entries');
        setLogging(false);
        return;
      }

      // F2: Success celebration
      setSuccessCount(items.length);
      setMode('success');
      setLogging(false);
      setText('');
      setParsedItems([]);
      setPhotoPreview(null);

      setTimeout(() => {
        setMode('idle');
        setSuccessCount(0);
        onLogged();
      }, 1500);
    } catch {
      setError('Failed to save entries');
      setLogging(false);
    }
  };

  const handleCancel = () => {
    setParsedItems([]);
    setPhotoPreview(null);
    setMode('idle');
    setError(null);
    setRetryCount(0);
  };

  // F2: Success celebration animation
  if (mode === 'success') {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass p-6 flex flex-col items-center justify-center gap-2"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.1 }}
        >
          <CheckCircle2 size={48} className="text-green-400" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-green-400 font-medium text-sm"
        >
          {t('food.logged_toast', { n: String(successCount) })}
        </motion.p>
      </motion.div>
    );
  }

  // Show confirmation list
  if (mode === 'confirming' && parsedItems.length > 0) {
    return (
      <div>
        {/* F14: Photo preview */}
        {photoPreview && (
          <div className="mb-2 flex justify-center">
            <motion.img
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              src={photoPreview}
              alt="Food photo"
              className="w-20 h-20 rounded-xl object-cover border border-white/10"
            />
          </div>
        )}
        <ParsedFoodList
          items={parsedItems}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          logging={logging}
        />
      </div>
    );
  }

  // F21: Manual entry mode
  if (mode === 'manual_entry') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-stone-300 text-sm font-medium">{t('food.quick_add')}</span>
          <button onClick={() => setMode('idle')} className="text-stone-600 hover:text-stone-300 text-xs">
            {t('general.cancel')}
          </button>
        </div>
        <input
          type="text"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="Food name (optional)"
          className="input-dark w-full text-sm py-2"
        />
        <div className="grid grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-stone-500 mb-0.5 block">kcal *</label>
            <input
              type="number"
              value={manualCal}
              onChange={(e) => setManualCal(e.target.value)}
              className="input-dark w-full text-sm py-2 text-center"
              placeholder="300"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] text-stone-500 mb-0.5 block">Protein</label>
            <input
              type="number"
              value={manualProtein}
              onChange={(e) => setManualProtein(e.target.value)}
              className="input-dark w-full text-sm py-2 text-center"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-[10px] text-stone-500 mb-0.5 block">Carbs</label>
            <input
              type="number"
              value={manualCarbs}
              onChange={(e) => setManualCarbs(e.target.value)}
              className="input-dark w-full text-sm py-2 text-center"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-[10px] text-stone-500 mb-0.5 block">Fat</label>
            <input
              type="number"
              value={manualFat}
              onChange={(e) => setManualFat(e.target.value)}
              className="input-dark w-full text-sm py-2 text-center"
              placeholder="0"
            />
          </div>
        </div>
        <motion.button
          onClick={handleManualEntry}
          disabled={logging || !manualCal}
          whileTap={{ scale: 0.97 }}
          className="btn-gold w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          {logging ? '...' : t('food.quick_add')}
        </motion.button>
      </motion.div>
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
            onPaste={handlePaste}
            placeholder={mode === 'listening' ? t('food.speak_meal') : t('food.quick_placeholder')}
            className="input-dark w-full resize-none text-sm min-h-[44px] pr-20"
            rows={1}
            disabled={mode !== 'idle'}
          />
          {/* Action buttons inside input */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {/* Voice input */}
            <button
              onClick={mode === 'listening' ? () => setMode('idle') : startVoiceInput}
              disabled={mode !== 'idle' && mode !== 'listening'}
              className={`p-1.5 transition-colors ${mode === 'listening' ? 'text-red-400 animate-pulse' : 'text-stone-500 hover:gold-text'}`}
              title={t('food.speak_meal')}
            >
              {mode === 'listening' ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            {/* Camera */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={mode !== 'idle'}
              className="p-1.5 text-stone-500 hover:gold-text transition-colors"
              title={t('food.photo_take')}
            >
              <Camera size={14} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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

      {/* F14: Photo preview while analyzing */}
      <AnimatePresence>
        {mode === 'photo_analyzing' && photoPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 glass p-3"
          >
            <img src={photoPreview} alt="Analyzing" className="w-12 h-12 rounded-lg object-cover" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin gold-text" />
                <span className="text-stone-400 text-sm">{t('food.photo_analyzing')}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state (text parsing) */}
      <AnimatePresence>
        {mode === 'parsing' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass p-4 flex items-center justify-center gap-3"
          >
            <Loader2 size={16} className="animate-spin gold-text" />
            <span className="text-stone-400 text-sm">{t('food.parsing')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Listening state */}
      <AnimatePresence>
        {mode === 'listening' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass p-4 flex items-center justify-center gap-3"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Mic size={20} className="text-red-400" />
            </motion.div>
            <span className="text-stone-400 text-sm">{t('food.listening')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* F9: Error with smart retry */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <p className="text-red-400 text-xs text-center">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleRetry}
                className="text-stone-400 hover:gold-text text-xs flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} />
                {t('food.retry')}
              </button>
              {retryCount >= 2 && (
                <button
                  onClick={() => { setError(null); setMode('manual_entry'); }}
                  className="text-stone-400 hover:gold-text text-xs flex items-center gap-1 transition-colors"
                >
                  <Plus size={12} />
                  {t('food.manual_entry')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom actions */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={onSearchMode}
          className="flex items-center gap-1.5 text-stone-500 hover:text-stone-300 text-xs transition-colors"
        >
          <Search size={12} />
          {t('food.search_db')}
        </button>
        <button
          onClick={() => setMode('manual_entry')}
          className="flex items-center gap-1.5 text-stone-500 hover:text-stone-300 text-xs transition-colors"
        >
          <Plus size={12} />
          {t('food.quick_add')}
        </button>
      </div>
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
