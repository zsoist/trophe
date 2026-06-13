'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Barcode, Loader2, Camera, Keyboard, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';

/**
 * Barcode → log (Open Food Facts leverage). On open the user picks:
 *   • Photo  → live camera scanner with an animated barcode-reader overlay
 *              (native BarcodeDetector auto-detect where supported).
 *   • Input  → type the EAN/UPC (works everywhere, incl. iOS Safari).
 * Lookup hits /api/food/barcode (DB-first → OFF v2 fallback). Grams confirmed
 * before logging (crowdsourced data = estimate, not lab-verified).
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
type Step = 'choose' | 'scan' | 'input' | 'manual';

const MEAL_OPTIONS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function BarcodeLookupModal({ userId, selectedDate, defaultMealType = 'snack', isOpen, onClose, onLogged }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  // Manual add (per-100g) for barcodes Open Food Facts doesn't have (common for LatAm/Greek products).
  const [manual, setManual] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [loading, setLoading] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const stopScan = () => {
    try { controlsRef.current?.stop(); } catch { /* already stopped */ }
    controlsRef.current = null;
  };

  // Reset on open; always stop the camera on close/unmount.
  useEffect(() => {
    if (isOpen) { setStep('choose'); setCode(''); setProduct(null); setError(null); setGrams(100); }
    else stopScan();
    return () => stopScan();
  }, [isOpen]);

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
        stopScan();
        setProduct({ name: data.name!, brand: data.brand ?? null, barcode, per100g: data.per100g, source: data.source ?? 'off' });
        setGrams(100);
      } else {
        // Not in Open Food Facts (common for LatAm/Greek products) → let the
        // coach/client add it from the label rather than dead-ending.
        stopScan();
        setError(null);
        setStep('manual');
      }
    } catch {
      setError('Lookup failed — try again');
    } finally { setLoading(false); }
  }

  async function logManual() {
    if (logging) return;
    if (!manual.name.trim()) { setError('Add a product name'); return; }
    setError(null);
    setLogging(true);
    const f = grams / 100;
    const num = (s: string) => Math.max(0, Number(s) || 0);
    const { error: insErr } = await supabase.from('food_log').insert({
      user_id: userId, logged_date: selectedDate, meal_type: mealType,
      food_name: manual.name.trim(),
      quantity: grams, unit: 'g',
      calories: Math.round(num(manual.kcal) * f),
      protein_g: Math.round(num(manual.protein) * f * 10) / 10,
      carbs_g: Math.round(num(manual.carbs) * f * 10) / 10,
      fat_g: Math.round(num(manual.fat) * f * 10) / 10,
      fiber_g: 0,
      source: 'custom' as const,
    });
    setLogging(false);
    if (insErr) { setError(insErr.message); return; }
    onLogged();
    onClose();
  }

  // Live camera scan via ZXing (works on iOS Safari + Android — no native
  // BarcodeDetector needed). Lazy-loaded so the decoder only ships when scanning.
  useEffect(() => {
    if (!isOpen || step !== 'scan') { stopScan(); return; }
    let cancelled = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, zxing] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled || !videoRef.current) return;
        const hints = new Map();
        hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
          zxing.BarcodeFormat.EAN_13, zxing.BarcodeFormat.EAN_8,
          zxing.BarcodeFormat.UPC_A, zxing.BarcodeFormat.UPC_E,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            const v = result.getText().replace(/\D/g, '');
            if (/^\d{8,14}$/.test(v)) { stopScan(); setCode(v); lookup(v); }
          },
        );
        if (cancelled) controls.stop(); else controlsRef.current = controls;
      } catch {
        if (!cancelled) { setError('Camera unavailable — enter the barcode manually'); setStep('input'); }
      }
    })();
    return () => { cancelled = true; stopScan(); };
  }, [isOpen, step]);

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
    onClose();
  }

  if (!isOpen) return null;
  const f = grams / 100;
  const close = () => { stopScan(); onClose(); };

  const choiceCard = (icon: React.ReactNode, label: string, sub: string, onClick: () => void): React.ReactElement => (
    <button onClick={onClick} className="flex-1 flex flex-col items-center gap-2 rounded-2xl"
      style={{ padding: '22px 12px', background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.08))', cursor: 'pointer' }}>
      <div className="flex items-center justify-center rounded-full" style={{ width: 46, height: 46, background: 'rgba(212,168,83,.12)', color: 'var(--gold-300,#D4A853)' }}>{icon}</div>
      <span className="text-sm font-semibold" style={{ color: 'var(--t1,#f5f5f4)' }}>{label}</span>
      <span className="text-[10px] text-center" style={{ color: 'var(--t4,#78716c)' }}>{sub}</span>
    </button>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
        onClick={close}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-1,#1c1917)', border: '1px solid var(--line-2,rgba(255,255,255,0.08))', maxHeight: '90vh', overflowY: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              {(step !== 'choose' && !product) && (
                <button onClick={() => setStep('choose')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3,#a8a29e)', display: 'flex' }}><ChevronLeft size={18} /></button>
              )}
              <Barcode size={16} style={{ color: 'var(--gold-300,#D4A853)' }} />
              <h2 className="text-base font-bold" style={{ color: 'var(--t1,#f5f5f4)' }}>{product ? 'Add product' : 'Scan a barcode'}</h2>
            </div>
            <button onClick={close} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.06)' }}>
              <X size={14} style={{ color: 'var(--t3,#a8a29e)' }} />
            </button>
          </div>

          <div className="px-5 pb-5">
            {/* ── Result (shared by both paths) ── */}
            {product ? (
              <div className="rounded-2xl p-3" style={{ background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.07))' }}>
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
                  style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--gold-300,#D4A853)', color: '#0a0a0a', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: logging ? 'not-allowed' : 'pointer' }}>
                  {logging ? 'Logging…' : 'Add to log'}
                </button>
                <button onClick={() => { setProduct(null); setCode(''); setStep('choose'); }} className="w-full text-[11px] mt-2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4,#78716c)', fontFamily: 'var(--font-mono)' }}>↺ scan another</button>
              </div>
            ) : step === 'choose' ? (
              /* ── Choose: Photo or Input ── */
              <div className="flex gap-3 pt-1">
                {choiceCard(<Camera size={22} />, 'Photo', 'Point at the barcode', () => { setError(null); setStep('scan'); })}
                {choiceCard(<Keyboard size={22} />, 'Input', 'Type the number', () => { setError(null); setStep('input'); })}
              </div>
            ) : step === 'scan' ? (
              /* ── Animated barcode-reader ── */
              <div>
                <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
                  <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {/* reticle */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ position: 'relative', width: '78%', height: '38%', border: '2px solid rgba(212,168,83,.9)', borderRadius: 12, boxShadow: '0 0 0 2000px rgba(0,0,0,.35)' }}>
                      <motion.div
                        initial={{ top: '6%' }}
                        animate={{ top: ['6%', '94%', '6%'] }}
                        transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
                        style={{ position: 'absolute', left: '4%', right: '4%', height: 2, background: 'var(--gold-300,#D4A853)', boxShadow: '0 0 8px 1px rgba(212,168,83,.8)' }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-center mt-3" style={{ color: 'var(--t3,#a8a29e)' }}>
                  {loading ? 'Looking up…' : 'Hold the barcode inside the frame'}
                </p>
                <button onClick={() => setStep('input')} className="w-full text-[11px] mt-2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-300,#D4A853)', fontFamily: 'var(--font-mono)' }}>
                  Enter the number manually instead
                </button>
              </div>
            ) : step === 'input' ? (
              /* ── Manual input ── */
              <div>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') lookup(code); }}
                  placeholder="Barcode number (EAN/UPC)"
                  inputMode="numeric" autoFocus
                  style={{ width: '100%', background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.08))', borderRadius: 10, padding: '11px 12px', color: 'var(--t1,#f5f5f4)', fontSize: 15, fontFamily: 'var(--font-mono)', marginBottom: 10 }}
                />
                <button onClick={() => lookup(code)} disabled={loading || !code}
                  style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'var(--gold-300,#D4A853)', color: '#0a0a0a', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: loading || !code ? 'not-allowed' : 'pointer', opacity: code ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {loading ? <><Loader2 size={14} className="animate-spin" /> Looking up…</> : 'Look up'}
                </button>
              </div>
            ) : (
              /* ── Manual add (barcode not in Open Food Facts) ── */
              <div>
                <p className="text-[11px] mb-3" style={{ color: 'var(--t3,#a8a29e)' }}>
                  Not in the database{code ? ` (#${code})` : ''} — add it from the label (values per 100 g/ml).
                </p>
                <input
                  value={manual.name}
                  onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                  placeholder="Product name"
                  style={{ width: '100%', background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.08))', borderRadius: 10, padding: '10px 12px', color: 'var(--t1,#f5f5f4)', fontSize: 14, marginBottom: 8 }}
                />
                <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
                  {([['kcal', 'kcal /100'], ['protein', 'Protein g'], ['carbs', 'Carbs g'], ['fat', 'Fat g']] as const).map(([k, ph]) => (
                    <input key={k} value={manual[k]} inputMode="decimal"
                      onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value.replace(/[^\d.]/g, '') }))}
                      placeholder={ph}
                      style={{ background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.08))', borderRadius: 10, padding: '9px 11px', color: 'var(--t1,#f5f5f4)', fontSize: 13, fontFamily: 'var(--font-mono)' }} />
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px]" style={{ color: 'var(--t3,#a8a29e)' }}>Amount</span>
                  <input type="number" min={1} value={grams} onChange={(e) => setGrams(Math.max(1, Number(e.target.value) || 0))}
                    style={{ width: 80, background: 'var(--bg-1,#1c1917)', border: '1px solid var(--line,rgba(255,255,255,.1))', borderRadius: 8, padding: '5px 8px', color: 'var(--t1,#f5f5f4)', fontSize: 13, fontFamily: 'var(--font-mono)' }} />
                  <span className="text-[11px]" style={{ color: 'var(--t4,#78716c)' }}>g/ml</span>
                </div>
                <div className="flex gap-1 mb-3">
                  {MEAL_OPTIONS.map((m) => (
                    <button key={m} onClick={() => setMealType(m)} className="flex-1 text-[10px]" style={{ padding: '6px 0', borderRadius: 8, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid', borderColor: mealType === m ? 'var(--gold-300,#D4A853)' : 'var(--line,rgba(255,255,255,.1))', background: mealType === m ? 'rgba(212,168,83,.12)' : 'transparent', color: mealType === m ? 'var(--gold-300,#D4A853)' : 'var(--t3,#a8a29e)', fontFamily: 'var(--font-mono)' }}>{m}</button>
                  ))}
                </div>
                <button onClick={logManual} disabled={logging || !manual.name.trim()}
                  style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'var(--gold-300,#D4A853)', color: '#0a0a0a', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: logging || !manual.name.trim() ? 'not-allowed' : 'pointer', opacity: manual.name.trim() ? 1 : 0.5 }}>
                  {logging ? 'Logging…' : 'Add to log'}
                </button>
              </div>
            )}

            {error && <p className="text-xs mt-3 text-center" style={{ color: '#f87171' }}>{error}</p>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
