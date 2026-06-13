'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Barcode, Loader2, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';

/**
 * Barcode → log (Open Food Facts leverage). Manual entry works everywhere
 * (incl. iOS); camera scan is a progressive enhancement gated on the native
 * BarcodeDetector API. Lookup hits /api/food/barcode (DB-first, OFF fallback);
 * the client confirms grams before logging (crowdsourced data = estimate).
 */

interface Props {
  userId: string;
  selectedDate: string;
  defaultMealType?: MealType;
  isOpen: boolean;
  onClose: () => void;
  onLogged: () => void;
}

interface Per100g { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null; sugar: number | null; }
interface Product { name: string; brand: string | null; barcode: string; per100g: Per100g; source: string; }

// BarcodeDetector is not in TS DOM libs yet.
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
const hasDetector = (): boolean => typeof window !== 'undefined' && 'BarcodeDetector' in window;

const MEAL_OPTIONS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function BarcodeLookupModal({ userId, selectedDate, defaultMealType = 'snack', isOpen, onClose, onLogged }: Props) {
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [loading, setLoading] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const stopScan = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Clean up camera on close/unmount.
  useEffect(() => { if (!isOpen) { stopScan(); } return () => stopScan(); }, [isOpen]);

  async function lookup(barcode: string) {
    if (!/^\d{8,14}$/.test(barcode)) { setError('Enter a valid 8–14 digit barcode'); return; }
    setLoading(true); setError(null); setProduct(null);
    try {
      const res = await fetch('/api/food/barcode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Product> & { found?: boolean; error?: string };
      if (data.found && data.per100g) {
        setProduct({ name: data.name!, brand: data.brand ?? null, barcode, per100g: data.per100g, source: data.source ?? 'off' });
        setGrams(100);
      } else {
        setError(data.error || 'Product not found');
      }
    } catch {
      setError('Lookup failed — try again');
    } finally { setLoading(false); }
  }

  async function startScan() {
    if (!hasDetector()) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) { stopScan(); return; }
      video.srcObject = stream;
      await video.play();
      // @ts-expect-error BarcodeDetector not in lib.dom yet
      const detector: BarcodeDetectorLike = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) { const v = codes[0].rawValue; stopScan(); setCode(v); lookup(v); return; }
        } catch { /* keep scanning */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError('Camera unavailable — enter the barcode manually');
      stopScan();
    }
  }

  async function logIt() {
    if (!product || logging) return;
    setLogging(true);
    const f = grams / 100;
    const { error: insErr } = await supabase.from('food_log').insert({
      user_id: userId, logged_date: selectedDate, meal_type: mealType,
      food_name: product.brand ? `${product.name} — ${product.brand}` : product.name,
      quantity: grams, unit: 'g',
      calories: Math.round(product.per100g.kcal * f),
      protein_g: Math.round(product.per100g.protein * f * 10) / 10,
      carbs_g: Math.round(product.per100g.carbs * f * 10) / 10,
      fat_g: Math.round(product.per100g.fat * f * 10) / 10,
      fiber_g: product.per100g.fiber != null ? Math.round(product.per100g.fiber * f * 10) / 10 : 0,
      source: 'custom' as const,
    });
    setLogging(false);
    if (insErr) { setError(insErr.message); return; }
    onLogged();
    setProduct(null); setCode('');
    onClose();
  }

  if (!isOpen) return null;
  const f = grams / 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={() => { stopScan(); onClose(); }}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-1,#1c1917)', border: '1px solid var(--line-2,rgba(255,255,255,0.08))', maxHeight: '90vh', overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <Barcode size={16} style={{ color: 'var(--gold-300,#D4A853)' }} />
              <h2 className="text-base font-bold" style={{ color: 'var(--t1,#f5f5f4)' }}>Scan a barcode</h2>
            </div>
            <button onClick={() => { stopScan(); onClose(); }} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.06)' }}>
              <X size={14} style={{ color: 'var(--t3,#a8a29e)' }} />
            </button>
          </div>

          <div className="px-5 pb-5">
            {scanning && (
              <div style={{ position: 'relative', marginBottom: 12, borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                <video ref={videoRef} playsInline muted style={{ width: '100%', maxHeight: 240, objectFit: 'cover' }} />
                <button onClick={stopScan} className="text-[11px]" style={{ position: 'absolute', bottom: 8, right: 8, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', cursor: 'pointer' }}>Stop</button>
              </div>
            )}

            <div className="flex gap-2" style={{ marginBottom: 12 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') lookup(code); }}
                placeholder="Barcode number (EAN/UPC)"
                inputMode="numeric"
                style={{ flex: 1, background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.08))', borderRadius: 10, padding: '9px 11px', color: 'var(--t1,#f5f5f4)', fontSize: 14, fontFamily: 'var(--font-mono)' }}
              />
              {hasDetector() && !scanning && (
                <button onClick={startScan} title="Scan with camera" style={{ padding: '0 12px', borderRadius: 10, border: '1px solid var(--line,rgba(255,255,255,.1))', background: 'transparent', color: 'var(--gold-300,#D4A853)', cursor: 'pointer' }}>
                  <Camera size={16} />
                </button>
              )}
            </div>

            <button
              onClick={() => lookup(code)} disabled={loading || !code}
              style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'var(--gold-300,#D4A853)', color: '#0a0a0a', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: loading || !code ? 'not-allowed' : 'pointer', opacity: code ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Looking up…</> : 'Look up'}
            </button>

            {error && <p className="text-xs mt-3 text-center" style={{ color: '#f87171' }}>{error}</p>}

            {product && (
              <div className="rounded-2xl p-3 mt-4" style={{ background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.07))' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold" style={{ color: 'var(--t1,#f5f5f4)' }}>{product.name}</span>
                  <span className="text-[9px] uppercase" style={{ color: 'var(--t4,#78716c)', fontFamily: 'var(--font-mono)' }}>{product.source === 'db' ? 'in DB' : 'OFF'}</span>
                </div>
                {product.brand && <p className="text-[11px] mb-2" style={{ color: 'var(--t3,#a8a29e)' }}>{product.brand}</p>}
                <p className="text-[10px] mb-3" style={{ color: 'var(--t4,#78716c)' }}>
                  per 100g · {product.per100g.kcal} kcal · {product.per100g.protein}P / {product.per100g.carbs}C / {product.per100g.fat}F
                </p>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px]" style={{ color: 'var(--t3,#a8a29e)' }}>Amount</span>
                  <input type="number" min={1} value={grams} onChange={(e) => setGrams(Math.max(1, Number(e.target.value) || 0))}
                    style={{ width: 80, background: 'var(--bg-1,#1c1917)', border: '1px solid var(--line,rgba(255,255,255,.1))', borderRadius: 8, padding: '5px 8px', color: 'var(--t1,#f5f5f4)', fontSize: 13, fontFamily: 'var(--font-mono)' }} />
                  <span className="text-[11px]" style={{ color: 'var(--t4,#78716c)' }}>g →</span>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--gold-300,#D4A853)' }}>{Math.round(product.per100g.kcal * f)} kcal</span>
                </div>

                <div className="flex gap-1 mb-3">
                  {MEAL_OPTIONS.map((m) => (
                    <button key={m} onClick={() => setMealType(m)} className="flex-1 text-[10px]" style={{ padding: '6px 0', borderRadius: 8, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid', borderColor: mealType === m ? 'var(--gold-300,#D4A853)' : 'var(--line,rgba(255,255,255,.1))', background: mealType === m ? 'rgba(212,168,83,.12)' : 'transparent', color: mealType === m ? 'var(--gold-300,#D4A853)' : 'var(--t3,#a8a29e)', fontFamily: 'var(--font-mono)' }}>{m}</button>
                  ))}
                </div>

                <button onClick={logIt} disabled={logging}
                  style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid rgba(212,168,83,.3)', background: 'rgba(212,168,83,.12)', color: 'var(--gold-300,#D4A853)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: logging ? 'not-allowed' : 'pointer' }}>
                  {logging ? 'Logging…' : 'Add to log'}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
