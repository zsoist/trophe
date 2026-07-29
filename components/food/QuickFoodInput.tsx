'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Send, Camera, Barcode, Loader2, Mic, MicOff, Plus, CheckCircle2, RotateCcw, X, HelpCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { trpcClient } from '@/lib/trpc/client';
import type { MealType } from '@/lib/types';
import type { ParsedFoodItem } from '@/app/api/food/parse/route';
import { isParsedFoodItem } from '@/agents/schemas/food-parse';
import { validateManualNutrition } from '@/lib/food/manual-entry';
import { photoAnalysisToParsedItems } from '@/lib/food/photo-analysis';
import ParsedFoodList from '@/components/food/ParsedFoodList';
import PhotoScanCard from '@/components/food/PhotoScanCard';
import BarcodeLookupModal from '@/components/food/BarcodeLookupModal';

interface QuickFoodInputProps {
  userId: string;
  mealType: MealType;
  date: string;
  /** Batch-logged row ids (from `.select('id')`) ride along so the page can offer batch undo. */
  onLogged: (ids?: string[]) => void;
  onSearchMode: () => void;
  /** kcal strings in the review UI render only when enabled (threaded by MealSlotCard). */
  showCalories?: boolean;
}

type InputMode = 'idle' | 'parsing' | 'confirming' | 'photo_analyzing' | 'success' | 'manual_entry' | 'listening' | 'question';
type InputSource = 'text' | 'photo';

/** Server-side parse limit — mirrored on the textarea (maxLength + counter). */
const MAX_PARSE_INPUT = 500;

/** Stable error codes from /api/food/parse → i18n keys for friendly copy. Raw internals stay server-side. */
const PARSE_ERROR_KEYS: Record<string, string> = {
  ai_busy: 'food.err_ai_busy',
  try_rephrase: 'food.err_try_rephrase',
  too_long: 'food.err_too_long',
  rate_limited: 'food.err_rate_limited',
  timeout: 'food.err_timeout',
};

/** Languages the parse API accepts as a hint; anything else falls back to 'en'. */
const PARSE_LANGUAGES = new Set(['en', 'es', 'el', 'fr', 'de', 'it', 'pt', 'nl']);

/**
 * W1 "kitchen pass" narration — the stage line crossfades through these on
 * 1.2s timers. Stage 3 replaces the old standalone "still working" line and
 * is driven by the 8s slowParse timer instead of the stage clock.
 */
const PARSE_STAGE_KEYS = [
  'food.parse_stage_reading',
  'food.parse_stage_matching',
  'food.parse_stage_weighing',
  'food.parse_stage_still',
] as const;

/** Estimated item count from raw input — drives how many skeleton cards render. */
function estimateItemCount(text: string): number {
  const n = text.split(/,| and | y | και | με |\n/).map(s => s.trim()).filter(Boolean).length;
  return Math.min(4, Math.max(1, n));
}

/** BCP-47 tags for the Web Speech API — STT always listens in the UI language. */
const STT_LANG_TAGS: Record<string, string> = {
  en: 'en-US', es: 'es-ES', el: 'el-GR', fr: 'fr-FR',
  de: 'de-DE', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL',
};

export default function QuickFoodInput({ userId, mealType, date, onLogged, showCalories = false }: QuickFoodInputProps) {
  const { t, lang } = useI18n();
  const reducedMotion = useReducedMotion();
  const [text, setText] = useState('');
  const [showBarcode, setShowBarcode] = useState(false);
  const [mode, setMode] = useState<InputMode>('idle');
  // W1: parse narration — skeleton count estimated from the input, stage line on 1.2s timers.
  const [estimatedItems, setEstimatedItems] = useState(1);
  const [parseStage, setParseStage] = useState(0);
  const [parsedItems, setParsedItems] = useState<ParsedFoodItem[]>([]);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [inputSource, setInputSource] = useState<InputSource>('text');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryAfterS, setRetryAfterS] = useState(0);
  const [slowParse, setSlowParse] = useState(false);
  const [logging, setLogging] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  // Clarification loop (empty-items + question): the AI's actual question + the user's answer.
  const [questionText, setQuestionText] = useState<string | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTextRef = useRef('');
  const lastFileRef = useRef<File | null>(null);
  const questionOriginalTextRef = useRef('');
  /** Snapshot of the parse result at confirm-entry — flywheel diffs confirmed values against it. */
  const originalItemsRef = useRef<ParsedFoodItem[]>([]);
  const parseBusyRef = useRef(false);

  // 429 Retry-After countdown — Retry stays disabled until it reaches 0.
  useEffect(() => {
    if (retryAfterS <= 0) return;
    const timer = setTimeout(() => setRetryAfterS(v => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryAfterS]);

  // W1: advance the narration stage while parsing (holds on the last stage;
  // the 8s slowParse timer promotes it to the "still working" text).
  useEffect(() => {
    if (mode !== 'parsing') return;
    setParseStage(0);
    const t1 = setTimeout(() => setParseStage(1), 1200);
    const t2 = setTimeout(() => setParseStage(2), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [mode]);

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

  /**
   * Parse free text into food items. `textArg` lets callers (voice transcript,
   * clarification answers) pass the value directly — the old version closed
   * over stale `text` state and silently no-op'd on voice input.
   */
  const handleParseText = async (textArg?: string) => {
    const value = (textArg ?? text).trim();
    if (!value || parseBusyRef.current || logging) return;
    if (value.length > MAX_PARSE_INPUT) {
      setError(t('food.err_too_long', { max: MAX_PARSE_INPUT }));
      return;
    }
    parseBusyRef.current = true;
    setError(null);
    setSlowParse(false);
    setEstimatedItems(estimateItemCount(value));
    setMode('parsing');
    lastTextRef.current = value;
    const slowTimer = setTimeout(() => setSlowParse(true), 8000);
    let requestTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), 45000); // 45s — composites need more time

      const res = await fetch('/api/food/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, language: PARSE_LANGUAGES.has(lang) ? lang : 'en' }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
          setRetryAfterS(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 600) : 60);
          setError(t('food.err_rate_limited'));
        } else {
          const errorKey = data?.code ? PARSE_ERROR_KEYS[data.code] : undefined;
          setError(errorKey ? t(errorKey, { max: MAX_PARSE_INPUT }) : data?.message || data?.error || t('food.no_items'));
        }
        setRetryCount(prev => prev + 1);
        setMode('idle');
        return;
      }

      const items: ParsedFoodItem[] = Array.isArray(data?.items)
        ? data.items.filter(isParsedFoodItem)
        : [];

      if (items.length === 0) {
        // A real question came back with no items — surface it and let the
        // user answer instead of dead-ending on "No food items detected".
        if (data && data.needs_clarification && data.clarification_question) {
          setQuestionText(String(data.clarification_question));
          setQuestionAnswer('');
          questionOriginalTextRef.current = value;
          setRetryCount(0);
          setMode('question');
          return;
        }
        setError(t('food.no_items'));
        setRetryCount(prev => prev + 1);
        setMode('idle');
        return;
      }

      setRetryCount(0);
      setParsedItems(items);
      // Snapshot the parse's original values — handleConfirm diffs against
      // these to capture user corrections for the flywheel.
      originalItemsRef.current = items.map(item => ({ ...item }));
      setParseWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setClarificationQuestion(data.needs_clarification ? data.clarification_question : null);
      setQuestionText(null);
      setInputSource('text');
      setMode('confirming');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError(t('food.err_timeout'));
      } else {
        setError('Failed to parse food — check your connection');
      }
      setRetryCount(prev => prev + 1);
      setMode('idle');
    } finally {
      if (requestTimeout) clearTimeout(requestTimeout);
      clearTimeout(slowTimer);
      setSlowParse(false);
      parseBusyRef.current = false;
    }
  };

  /** Re-parse combined "original — answer" text from the review banner's inline answer field. */
  const handleReparse = (combinedText: string) => {
    setParsedItems([]);
    setClarificationQuestion(null);
    setParseWarnings([]);
    originalItemsRef.current = [];
    handleParseText(combinedText);
  };

  const handleRetry = () => {
    if (retryAfterS > 0) return;
    setError(null);
    if (lastFileRef.current) {
      processImageFile(lastFileRef.current);
    } else if (lastTextRef.current) {
      setText(lastTextRef.current);
      setMode('idle');
      const retryText = lastTextRef.current;
      setTimeout(() => handleParseText(retryText), 100);
    }
  };

  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (parseBusyRef.current || logging) return;
    parseBusyRef.current = true;
    setError(null);
    setMode('photo_analyzing');
    lastFileRef.current = file;
    let requestTimeout: ReturnType<typeof setTimeout> | null = null;

    // Create preview thumbnail
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);

    try {
      // Modern iPhone photos commonly exceed 5MB. Resize and transcode before
      // upload so the API receives a bounded JPEG regardless of source format.
      const base64 = await resizeAndEncode(file, 1600);
      const mediaType = 'image/jpeg';

      const controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), 20000); // 20s for photo

      const res = await fetch('/api/ai/photo-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok || !Array.isArray(data.foods) || data.foods.length === 0) {
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
          setRetryAfterS(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 600) : 60);
          setError(t('food.err_rate_limited'));
        } else {
          setError(data.error || t('food.no_items'));
        }
        setRetryCount(prev => prev + 1);
        setMode('idle');
        return;
      }

      const items = photoAnalysisToParsedItems(data.foods);

      if (items.length === 0) {
        setError(t('food.no_items'));
        setRetryCount(prev => prev + 1);
        setMode('idle');
        return;
      }

      setRetryCount(0);
      // Success — clear the retry file so a later TEXT failure can't re-submit
      // this (now stale) photo via the Retry button.
      lastFileRef.current = null;
      setParsedItems(items);
      originalItemsRef.current = items.map(item => ({ ...item }));
      setParseWarnings([]);
      setClarificationQuestion(t('food.photo_estimates_note'));
      setInputSource('photo');
      setMode('confirming');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Photo analysis timed out — try again');
      } else {
        setError('Failed to analyze photo — check your connection');
      }
      setRetryCount(prev => prev + 1);
      setMode('idle');
    } finally {
      if (requestTimeout) clearTimeout(requestTimeout);
      parseBusyRef.current = false;
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

  // Mic permission denied at OS level — show helpful guidance
  const [micDeniedHelp, setMicDeniedHelp] = useState(false);

  // Voice recognition lives in refs: the old local-variable instance could
  // never be .stop()ped from the Stop button (hot mic kept overwriting later
  // typing) and the onend guard read stale `mode` state.
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const listeningRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      listeningRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    };
  }, []);

  /** Stop button: actually stop the mic. onend then parses any final transcript. */
  const stopVoiceInput = () => {
    listeningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    setMode('idle');
  };

  // F15: Voice input via Web Speech API — with explicit mic permission request
  const startVoiceInput = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(t('food.voice_unsupported'));
      return;
    }

    // Check/request mic permission explicitly before starting recognition.
    // This shows a clear browser permission prompt with context, instead of
    // the browser silently asking mid-action (which feels unexpected).
    if (navigator.permissions) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'denied') {
          // OS-level denial — JS cannot re-trigger the system prompt.
          // Show step-by-step guidance to the user instead.
          setMicDeniedHelp(true);
          return;
        }
      } catch {
        // permissions API not available on all browsers — continue anyway
      }
    }

    // Warm up the mic permission dialog before starting recognition.
    // getUserMedia fires the "Allow mic?" prompt with our app context visible.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately release the stream — we only needed the permission grant
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          // Could be OS-level or browser-level denial
          setMicDeniedHelp(true);
          return;
        }
        // Other errors (NotFoundError, etc.) — try recognition anyway
      }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = STT_LANG_TAGS[lang] ?? 'en-US';
    // Live transcript while speaking — the previous dead screen made users
    // assume voice was broken and start typing over a hot mic.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    listeningRef.current = true;
    finalTranscriptRef.current = '';
    setError(null);
    setMode('listening');
    recognition.start();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      if (unmountedRef.current) return;
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      finalTranscriptRef.current = finalText.trim();
      const live = `${finalText} ${interimText}`.replace(/\s+/g, ' ').trim();
      if (live) setText(live);
    };

    recognition.onerror = (event: { error: string }) => {
      listeningRef.current = false;
      recognitionRef.current = null;
      finalTranscriptRef.current = '';
      if (unmountedRef.current) return;
      setMode('idle');
      if (event.error === 'not-allowed') {
        setError('Microphone access denied — enable it in browser settings');
      } else if (event.error !== 'aborted') {
        setError('Could not recognize speech — try again');
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      const wasListening = listeningRef.current;
      listeningRef.current = false;
      const transcript = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = '';
      if (unmountedRef.current) return;
      // Ref-based guard — the old `mode === 'listening'` check closed over
      // stale state and left the UI stuck in listening mode.
      if (wasListening) setMode('idle');
      if (transcript) {
        setText(transcript);
        // Pass the transcript directly — parsing must not depend on setText
        // having flushed (the old setTimeout+stale-closure no-op bug).
        handleParseText(transcript);
      }
    };
  };

  // F21: Manual entry (quick add)
  const handleManualEntry = async () => {
    const validated = validateManualNutrition({
      name: manualName,
      calories: manualCal,
      protein: manualProtein,
      carbs: manualCarbs,
      fat: manualFat,
    });
    if (!validated.ok) {
      const messages = {
        calories_out_of_range: 'Enter calories between 1 and 10,000.',
        macro_out_of_range: 'Protein, carbs, and fat must each be between 0 and 1,000 g.',
        name_too_long: 'Keep the food name under 200 characters.',
      } as const;
      setError(messages[validated.code]);
      return;
    }

    setLogging(true);
    setError(null);
    const { value } = validated;
    const entry = {
      user_id: userId,
      logged_date: date,
      meal_type: mealType,
      food_name: value.name || `Quick add — ${value.calories} kcal`,
      quantity: 1,
      unit: 'serving',
      calories: value.calories,
      protein_g: value.protein,
      carbs_g: value.carbs,
      fat_g: value.fat,
      fiber_g: 0,
      source: 'custom' as const,
    };

    try {
      const { data: manualInsert, error: dbError } = await supabase
        .from('food_log')
        .insert(entry)
        .select('id')
        .maybeSingle();

      if (dbError || !manualInsert) {
        setError(t('food.save_failed'));
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
        onLogged([manualInsert.id]);
      }, 1500);
    } catch {
      setError(t('food.save_failed'));
    } finally {
      setLogging(false);
    }
  };

  const handleConfirm = async (items: ParsedFoodItem[]) => {
    if (logging || items.length === 0) return;
    if (!items.every(isParsedFoodItem)) {
      setError('One or more items has an invalid amount. Adjust the portion and try again.');
      return;
    }
    setLogging(true);

    try {
      // 'natural_language' for the text path (CHECK constraint allows it) —
      // collapsing everything to 'custom' erased the AI provenance the
      // flywheel and coach views depend on.
      const dbSource = inputSource === 'photo' ? 'photo_ai' : 'natural_language';
      const entries = items.map(item => ({
        user_id: userId,
        logged_date: date,
        meal_type: mealType,
        // What the user SAW (localized name / raw input), not the verbose
        // English DB name — the coach reads the same string back in meal views.
        food_name: item.name_localized || item.raw_text || item.food_name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
        sugar_g: item.sugar_g ?? null,
        parse_confidence: item.confidence ?? null,
        qty_input: item.quantity,
        qty_input_unit: item.unit,
        // Persist resolved grams — without this, MealSlotCard's grams editor
        // never renders and food.log.edit's deterministic per-100g recompute
        // path is unreachable (existing.qtyG always null). B2B: a coach must be
        // able to correct a client's portion by grams.
        qty_g: Number.isFinite(item.grams) ? item.grams : null,
        food_id: item.db_food_id ?? null,
        llm_recognized: item.source !== 'ai_estimate',
        source: dbSource,
      }));

      const { data: inserted, error: dbError } = await supabase
        .from('food_log')
        .insert(entries)
        .select('id');

      if (dbError || !inserted || inserted.length !== entries.length) {
        // RLS violation or auth issue — session likely expired
        if (dbError?.code === '42501' || dbError?.message?.includes('policy') || dbError?.code === 'PGRST301') {
          setError(t('food.session_expired'));
        } else if (dbError?.code === '23514') {
          // CHECK constraint violation (e.g. invalid source value)
          setError(t('food.invalid_entry'));
        } else {
          setError(t('food.save_failed'));
        }
        setLogging(false);
        return;
      }

      // Correction-capture flywheel: when the user adjusted a portion during
      // review, record (parse → confirmed) as a gold label. Fire-and-forget —
      // logging must NEVER block or fail on telemetry.
      try {
        const clampG = (v: number) => Math.min(Math.max(v, 0), 10_000);
        const clampMacro = (v: number) => Math.min(Math.max(v, 0), 1_000);
        const remaining: Array<ParsedFoodItem | null> = originalItemsRef.current.map(o => ({ ...o }));
        items.forEach((item, index) => {
          const originalIndex = remaining.findIndex(
            o => o !== null && o.raw_text === item.raw_text && o.food_name === item.food_name,
          );
          if (originalIndex === -1) return;
          const original = remaining[originalIndex]!;
          remaining[originalIndex] = null; // consume — duplicate items map 1:1
          const adjusted = item.grams !== original.grams ||
            (original.portion_explicit === false && item.portion_explicit === true);
          if (!adjusted) return;
          void trpcClient.food.corrections.captureAdjustment.mutate({
            rawText: (original.raw_text || item.food_name || 'unknown').slice(0, 500),
            foodName: String(entries[index].food_name ?? item.food_name).slice(0, 200),
            aiSource: item.source,
            parseConfidence: original.confidence ?? null,
            foodLogId: inserted[index]?.id ?? null,
            before: {
              grams: clampG(original.grams),
              calories: clampG(original.calories),
              protein_g: clampMacro(original.protein_g),
              carbs_g: clampMacro(original.carbs_g),
              fat_g: clampMacro(original.fat_g),
            },
            after: {
              grams: clampG(item.grams),
              calories: clampG(item.calories),
              protein_g: clampMacro(item.protein_g),
              carbs_g: clampMacro(item.carbs_g),
              fat_g: clampMacro(item.fat_g),
            },
          }).catch(() => { /* telemetry only */ });
        });
      } catch {
        // never block the logging UX on flywheel capture
      }

      // F2: Success celebration
      setSuccessCount(items.length);
      setMode('success');
      setLogging(false);
      setText('');
      setParsedItems([]);
      setClarificationQuestion(null);
      setParseWarnings([]);
      setPhotoPreview(null);
      originalItemsRef.current = [];

      // Batch undo: hand the inserted row ids to the page so the toast can
      // offer "Logged N items — Undo".
      const insertedIds = inserted.map(r => r.id);
      setTimeout(() => {
        setMode('idle');
        setSuccessCount(0);
        onLogged(insertedIds);
      }, 1500);
    } catch {
      setError(t('food.save_failed'));
      setLogging(false);
    }
  };

  const handleCancel = () => {
    setParsedItems([]);
    setClarificationQuestion(null);
    setParseWarnings([]);
    setPhotoPreview(null);
    setQuestionText(null);
    setQuestionAnswer('');
    originalItemsRef.current = [];
    setMode('idle');
    setError(null);
    setRetryCount(0);
  };

  /** Submit an answer to the empty-items clarification question — re-parses "original — answer". */
  const submitQuestionAnswer = () => {
    const answer = questionAnswer.trim();
    if (!answer) return;
    const combined = `${questionOriginalTextRef.current} — ${answer}`;
    setQuestionText(null);
    setQuestionAnswer('');
    handleParseText(combined);
  };

  /** Leave the question card — the original text is restored, nothing is lost. */
  const cancelQuestion = () => {
    setText(questionOriginalTextRef.current);
    setQuestionText(null);
    setQuestionAnswer('');
    setMode('idle');
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
          {/* Gold, not green — success joins the celebration grammar (W1) */}
          <CheckCircle2 size={48} style={{ color: 'var(--gold-300, #D4A853)' }} />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-medium text-sm"
          style={{ color: 'var(--gold-300, #D4A853)' }}
        >
          {t('food.logged_toast', { n: String(successCount) })}
        </motion.p>
      </motion.div>
    );
  }

  // Clarification question card — the parse returned a real question and no
  // items. Show the actual question with an answer box (was: dead-ended on a
  // generic "No food items detected" error).
  if (mode === 'question' && questionText) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-stone-300 text-sm font-medium">{t('food.quick_question')}</p>
              <p className="text-stone-400 text-xs mt-1 leading-relaxed">{questionText}</p>
            </div>
          </div>
          <button
            onClick={cancelQuestion}
            className="text-stone-600 hover:text-stone-300 text-xs flex-shrink-0"
          >
            {t('general.cancel')}
          </button>
        </div>
        <p className="text-stone-600 text-[11px] italic truncate">“{questionOriginalTextRef.current}”</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={questionAnswer}
            onChange={(e) => setQuestionAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitQuestionAnswer();
              }
            }}
            placeholder={t('food.answer_placeholder')}
            className="input-dark flex-1 text-sm py-2"
            aria-label="Answer the clarification question"
            autoFocus
          />
          <button
            onClick={submitQuestionAnswer}
            disabled={!questionAnswer.trim()}
            className="btn-gold px-4 text-sm flex items-center gap-1"
            aria-label="Submit answer"
          >
            <Send size={14} />
          </button>
        </div>
      </motion.div>
    );
  }

  // Show confirmation list
  if (mode === 'confirming' && parsedItems.length > 0) {
    return (
      <div>
        {/* Save error — visible in confirm mode so users aren't stuck */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <p className="text-red-400 text-xs text-center">{error}</p>
          </motion.div>
        )}
        {/* F14 + W11: photo settles with a final beam pass when results land */}
        {photoPreview && <PhotoScanCard src={photoPreview} state="done" />}
        <ParsedFoodList
          items={parsedItems}
          clarificationQuestion={clarificationQuestion}
          warnings={parseWarnings}
          rawInputText={inputSource === 'text' ? lastTextRef.current : undefined}
          onReparse={inputSource === 'text' ? handleReparse : undefined}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          logging={logging}
          showCalories={showCalories}
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
          maxLength={200}
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
              min={1}
              max={10000}
              step={1}
              inputMode="numeric"
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
              min={0}
              max={1000}
              step={0.1}
              inputMode="decimal"
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
              min={0}
              max={1000}
              step={0.1}
              inputMode="decimal"
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
              min={0}
              max={1000}
              step={0.1}
              inputMode="decimal"
            />
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="text-red-400 text-xs text-center"
          >
            {error}
          </p>
        )}
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
            maxLength={MAX_PARSE_INPUT}
            onChange={(e) => {
              setText(e.target.value);
              // Typing starts a new text entry — a failed photo must not be
              // re-submitted by the Retry button anymore.
              lastFileRef.current = null;
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
            className="input-dark w-full resize-none text-sm min-h-[52px] py-3"
            rows={2}
            disabled={mode !== 'idle'}
          />
          {/* Live character counter — the server refuses (not truncates) >500 chars */}
          {text.length >= 350 && (
            <span
              className={`absolute bottom-1.5 right-2 text-[10px] tabular-nums pointer-events-none ${
                text.length >= MAX_PARSE_INPUT ? 'text-amber-400' : 'text-stone-600'
              }`}
            >
              {text.length}/{MAX_PARSE_INPUT}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoCapture}
            className="hidden"
          />
        </div>
        <button
          onClick={() => handleParseText()}
          disabled={!text.trim() || mode !== 'idle'}
          className="btn-gold px-4 text-sm flex items-center gap-1 self-end"
        >
          {mode === 'parsing' || mode === 'photo_analyzing' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>

      {/* Action buttons row — separate from text input for better touch targets */}
      <div className="flex items-center gap-3 px-1">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={mode !== 'idle'}
          className="flex items-center gap-1.5 text-stone-500 hover:gold-text text-xs transition-colors py-1"
          aria-label="Take or upload a food photo"
        >
          <Camera size={14} />
          Photo
        </button>
        <button
          onClick={mode === 'listening' ? stopVoiceInput : startVoiceInput}
          disabled={mode !== 'idle' && mode !== 'listening'}
          className={`flex items-center gap-1.5 text-xs transition-colors py-1 ${mode === 'listening' ? 'text-red-400 animate-pulse' : 'text-stone-500 hover:gold-text'}`}
          aria-label={mode === 'listening' ? 'Stop voice recording' : 'Start voice input'}
          aria-pressed={mode === 'listening'}
        >
          {mode === 'listening' ? <MicOff size={14} /> : <Mic size={14} />}
          {mode === 'listening' ? 'Stop' : 'Voice'}
        </button>
        <button
          onClick={() => setMode('manual_entry')}
          className="flex items-center gap-1.5 text-stone-500 hover:gold-text text-xs transition-colors py-1"
        >
          <Plus size={14} />
          Custom
        </button>
        <button
          onClick={() => setShowBarcode(true)}
          className="flex items-center gap-1.5 text-stone-500 hover:gold-text text-xs transition-colors py-1 ml-auto"
          aria-label="Scan a barcode"
        >
          <Barcode size={14} />
          Barcode
        </button>
      </div>

      {showBarcode && (
        <BarcodeLookupModal
          userId={userId}
          selectedDate={date}
          defaultMealType={mealType}
          isOpen={showBarcode}
          onClose={() => setShowBarcode(false)}
          onLogged={onLogged}
        />
      )}

      {/* F14 + W11: scan-reveal while the vision model reads the plate */}
      <AnimatePresence>
        {mode === 'photo_analyzing' && photoPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass p-3"
          >
            <PhotoScanCard src={photoPreview} state="scanning" />
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent, #D4A853)' }} />
              <span className="text-stone-400 text-sm">{t('food.photo_analyzing')}</span>
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
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="space-y-2"
          >
            {/* W1: kitchen-pass narration — one mono line crossfading through stages.
                slowParse (8s) promotes the line to the "still working" stage. */}
            <div className="flex items-center gap-2 px-1" aria-live="polite">
              <Loader2 size={13} className="animate-spin gold-text flex-shrink-0" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={slowParse ? 3 : parseStage}
                  initial={reducedMotion ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -3 }}
                  transition={{ duration: reducedMotion ? 0 : 0.22, ease: 'easeOut' }}
                  className="text-stone-400 text-[11px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t(PARSE_STAGE_KEYS[slowParse ? 3 : parseStage])}
                </motion.span>
              </AnimatePresence>
            </div>
            {/* Skeleton preview: as many cards as the input suggests, branded
                transform-only sheen (no opacity loops on the glass layer) */}
            {Array.from({ length: estimatedItems }).map((_, i) => (
              <motion.div
                key={i}
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.09, type: 'spring', stiffness: 380, damping: 30 }}
                className="glass p-3 flex items-center justify-between"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="skeleton h-3 rounded" style={{ width: `${62 - i * 9}%` }} />
                  <div className="skeleton h-2 w-24 rounded" />
                </div>
                <div className="skeleton h-5 w-12 rounded" style={{ background: 'rgba(212,168,83,0.12)' }} />
              </motion.div>
            ))}
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

      {/* Mic permission denied — step-by-step help card */}
      <AnimatePresence>
        {micDeniedHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass p-4 space-y-2 border border-amber-500/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-amber-400 text-xs font-semibold">Microphone Access Needed</p>
              <button
                onClick={() => setMicDeniedHelp(false)}
                className="text-stone-600 hover:text-stone-300 p-1"
                aria-label="Dismiss microphone help"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-stone-400 text-xs leading-relaxed">
              {/iPhone|iPad/.test(navigator.userAgent)
                ? 'Open Settings → Safari → Microphone → Allow. Then come back and tap Voice again.'
                : /Android/.test(navigator.userAgent)
                  ? 'Open Settings → Apps → Browser → Permissions → Microphone → Allow. Then tap Voice again.'
                  : 'Click the lock/site icon in your browser address bar → Site Settings → Microphone → Allow. Then tap Voice again.'}
            </p>
            <button
              onClick={() => { setMicDeniedHelp(false); startVoiceInput(); }}
              className="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors"
            >
              Try again →
            </button>
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
                disabled={retryAfterS > 0}
                className="text-stone-400 hover:gold-text text-xs flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw size={12} />
                {retryAfterS > 0 ? t('food.retry_in', { n: retryAfterS }) : t('food.retry')}
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

      {/* Bottom actions moved to action row above */}
    </div>
  );
}

const MAX_UPLOAD_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024) / 3) * 4;

// Resize image and return a JPEG base64 payload guaranteed to fit the API cap.
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

        const encode = (quality: number) => {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Image compression is unavailable in this browser');
          ctx.drawImage(img, 0, 0, width, height);
          return canvas.toDataURL('image/jpeg', quality).split(',')[1];
        };

        try {
          for (const quality of [0.85, 0.72, 0.6, 0.48]) {
            const base64 = encode(quality);
            if (base64.length <= MAX_UPLOAD_BASE64_LENGTH) {
              resolve(base64);
              return;
            }
          }

          while (Math.max(width, height) > 640) {
            width = Math.round(width * 0.75);
            height = Math.round(height * 0.75);
            const base64 = encode(0.48);
            if (base64.length <= MAX_UPLOAD_BASE64_LENGTH) {
              resolve(base64);
              return;
            }
          }
          reject(new Error('Image could not be compressed below 5MB'));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
