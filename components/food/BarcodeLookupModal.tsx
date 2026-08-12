'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Barcode, Loader2, Camera, Keyboard, ChevronLeft, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
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
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export default function BarcodeLookupModal({ userId, selectedDate, defaultMealType = 'snack', isOpen, onClose, onLogged }: Props) {
  const { t } = useI18n();
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
  // W12 snap-lock: on a ZXing hit the laser freezes where it is, the reticle
  // snaps gold→ok and morphs into the product card (shared layoutId).
  const reducedMotion = useReducedMotion();
  const [locked, setLocked] = useState(false);
  const [laserTop, setLaserTop] = useState<string | null>(null);
  const laserRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const stopScan = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* already stopped */ }
    controlsRef.current = null;
  }, []);

  // Reset on open; always stop the camera on close/unmount.
  useEffect(() => {
    if (isOpen) { setStep('choose'); setCode(''); setProduct(null); setError(null); setGrams(100); setLocked(false); setLaserTop(null); }
    else stopScan();
    return () => stopScan();
  }, [isOpen, stopScan]);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [isOpen, onClose]);

  const lookup = useCallback(async (barcode: string) => {
    if (!/^\d{8,14}$/.test(barcode)) { setError(t('barcode.err_invalid')); return; }
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
      // W12: release the snap-lock so the reticle doesn't sit green on failure
      setLocked(false); setLaserTop(null);
      setError(t('barcode.err_lookup'));
    } finally { setLoading(false); }
  }, [stopScan, t]);

  async function logManual() {
    if (logging) return;
    if (!manual.name.trim()) { setError(t('barcode.err_add_name')); return; }
    setError(null);
    setLogging(true);
    try {
      const f = grams / 100;
      const num = (s: string) => Math.max(0, Number(s) || 0);
      const { data: inserted, error: insErr } = await supabase.from('food_log').insert({
        user_id: userId, logged_date: selectedDate, meal_type: mealType,
        food_name: manual.name.trim(),
        quantity: grams, unit: 'g',
        calories: Math.round(num(manual.kcal) * f),
        protein_g: Math.round(num(manual.protein) * f * 10) / 10,
        carbs_g: Math.round(num(manual.carbs) * f * 10) / 10,
        fat_g: Math.round(num(manual.fat) * f * 10) / 10,
        fiber_g: 0,
        source: 'custom' as const,
      }).select('id').maybeSingle();
      if (insErr || !inserted) { setError(t('food.save_failed')); return; }
      onLogged();
      onClose();
    } catch {
      setError(t('food.save_failed'));
    } finally {
      setLogging(false);
    }
  }

  // Live camera scan via ZXing (works on iOS Safari + Android — no native
  // BarcodeDetector needed). Lazy-loaded so the decoder only ships when scanning.
  useEffect(() => {
    if (!isOpen || step !== 'scan') { stopScan(); return; }
    // W12: every (re)entry into the scan step starts unlocked
    setLocked(false); setLaserTop(null);
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
            if (/^\d{8,14}$/.test(v)) {
              stopScan();
              // W12 snap-lock: freeze the laser at its current sweep position
              // (framer writes style.top each frame), lock the reticle, haptic.
              setLaserTop(laserRef.current?.style.top || '50%');
              setLocked(true);
              if (typeof navigator !== 'undefined') navigator.vibrate?.([15, 30, 15]);
              setCode(v);
              lookup(v);
            }
          },
        );
        if (cancelled) controls.stop(); else controlsRef.current = controls;
      } catch {
        if (!cancelled) { setError(t('barcode.err_camera')); setStep('input'); }
      }
    })();
    return () => { cancelled = true; stopScan(); };
  }, [isOpen, lookup, step, stopScan, t]);

  async function logIt() {
    if (!product || logging) return;
    setError(null);
    setLogging(true);
    try {
      const f = grams / 100;
      const { data: inserted, error: insErr } = await supabase.from('food_log').insert({
        user_id: userId, logged_date: selectedDate, meal_type: mealType,
        food_name: product.brand ? `${product.name} — ${product.brand}` : product.name,
        quantity: grams, unit: 'g',
        calories: Math.round(product.per100g.kcal * f),
        protein_g: Math.round(product.per100g.protein * f * 10) / 10,
        carbs_g: Math.round(product.per100g.carbs * f * 10) / 10,
        fat_g: Math.round(product.per100g.fat * f * 10) / 10,
        fiber_g: product.per100g.fiber != null ? Math.round(product.per100g.fiber * f * 10) / 10 : 0,
        sugar_g: product.per100g.sugar != null ? Math.round(product.per100g.sugar * f * 10) / 10 : null,
        // Barcode lookups are Open Food Facts provenance (CHECK allows it);
        // 'custom' stays reserved for the manual-label path below.
        source: 'openfoodfacts' as const,
      }).select('id').maybeSingle();
      if (insErr || !inserted) { setError(t('food.save_failed')); return; }
      onLogged();
      onClose();
    } catch {
      setError(t('food.save_failed'));
    } finally {
      setLogging(false);
    }
  }

  if (!isOpen) return null;
  const f = grams / 100;
  const close = () => { stopScan(); onClose(); };

  const choiceCard = (icon: React.ReactNode, label: string, sub: string, onClick: () => void): React.ReactElement => (
    <button onClick={onClick} className="flex-1 flex flex-col items-center gap-2 rounded-2xl min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      style={{ padding: '22px 12px', background: 'var(--surface-1)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>
      <div className="flex items-center justify-center rounded-full" style={{ width: 46, height: 46, background: 'var(--action-secondary)', color: 'var(--action-primary)' }}>{icon}</div>
      <span className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>{label}</span>
      <span className="text-xs text-center" style={{ color: 'var(--content-muted)' }}>{sub}</span>
    </button>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reducedMotion ? undefined : { opacity: 0 }}
        className="fixed inset-0 z-[var(--z-modal,60)] flex items-end sm:items-center justify-center"
        style={{ background: 'var(--surface-overlay)', backdropFilter: 'blur(8px)' }}
        onClick={close}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={product ? t('barcode.add_product') : t('barcode.scan_title')}
          tabIndex={-1}
          onKeyDown={(event) => trapFocus(event, dialogRef.current)}
          initial={reducedMotion ? false : { y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reducedMotion ? undefined : { y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="safe-bottom w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', maxHeight: '90vh', overflowY: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              {(step !== 'choose' && !product) && (
                <button onClick={() => setStep('choose')} aria-label={t('barcode.back')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-secondary)', display: 'flex' }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronLeft size={18} /></button>
              )}
              <Barcode size={16} style={{ color: 'var(--action-primary)' }} />
              <h2 className="text-base font-bold" style={{ color: 'var(--content-primary)' }}>{product ? t('barcode.add_product') : t('barcode.scan_title')}</h2>
            </div>
            <button onClick={close} aria-label={t('barcode.close')} className="w-8 h-8 rounded-full flex items-center justify-center min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
              <X size={14} style={{ color: 'var(--content-secondary)' }} />
            </button>
          </div>

          <div className="px-5 pb-5">
            {/* ── Result (shared by both paths) ── */}
            {product ? (
              /* W12: the locked reticle morphs into this card (shared layoutId);
                 reduced-motion gets a plain fade instead. */
              <motion.div
                layoutId={reducedMotion ? undefined : 'barcode-target'}
                initial={reducedMotion ? { opacity: 0 } : undefined}
                animate={reducedMotion ? { opacity: 1 } : undefined}
                className="p-3"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderRadius: 16 }}
              >
                <div className="flex items-center justify-between mb-1">
                  {/* W12: product name types in (~30ms/char, capped) after the morph */}
                  {reducedMotion ? (
                    <span className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>{product.name}</span>
                  ) : (
                    <span key={product.barcode} className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }} aria-label={product.name}>
                      {product.name.split('').map((ch, i) => (
                        <motion.span
                          key={i}
                          aria-hidden
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.15 + Math.min(i * 0.03, 1.2), duration: 0.12 }}
                        >
                          {ch}
                        </motion.span>
                      ))}
                    </span>
                  )}
                  <span className="text-xs uppercase" style={{ color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>{product.source === 'db' ? t('barcode.in_db') : 'OFF'}</span>
                </div>
                {product.brand && <p className="text-xs mb-2" style={{ color: 'var(--content-secondary)' }}>{product.brand}</p>}
                <p className="text-xs mb-3" style={{ color: 'var(--content-muted)' }}>
                  {t('barcode.per_100g_line', { kcal: product.per100g.kcal, p: product.per100g.protein, c: product.per100g.carbs, f: product.per100g.fat })}
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs" style={{ color: 'var(--content-secondary)' }}>{t('barcode.amount')}</span>
                  <input type="number" min={1} value={grams} onChange={(e) => setGrams(Math.max(1, Number(e.target.value) || 0))}
                    style={{ width: 80, background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 8px', color: 'var(--content-primary)', fontSize: 16, fontFamily: 'var(--font-mono)' }} className="text-base" />
                  <span className="text-xs" style={{ color: 'var(--content-muted)' }}>g →</span>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--action-primary)' }}>{Math.round(product.per100g.kcal * f)} kcal</span>
                </div>
                <div className="flex gap-1 mb-3">
                  {MEAL_OPTIONS.map((m) => (
                    <button key={m} onClick={() => setMealType(m)} className="flex-1 text-xs min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ padding: '6px 0', borderRadius: 8, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid', borderColor: mealType === m ? 'var(--action-primary)' : 'var(--border-default)', background: mealType === m ? 'var(--action-secondary)' : 'transparent', color: mealType === m ? 'var(--action-primary)' : 'var(--content-secondary)', fontFamily: 'var(--font-mono)' }}>{m}</button>
                  ))}
                </div>
                <button onClick={logIt} disabled={logging}
                  style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--action-primary)', color: 'var(--action-on-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: logging ? 'not-allowed' : 'pointer' }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  {logging ? t('barcode.logging') : t('barcode.add_to_log')}
                </button>
                <button onClick={() => { setProduct(null); setCode(''); setLocked(false); setLaserTop(null); setStep('choose'); }} className="w-full text-xs mt-2 inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-muted)', fontFamily: 'var(--font-mono)', minHeight: 32 }}><RotateCcw size={11} aria-hidden /> {t('barcode.scan_another')}</button>
              </motion.div>
            ) : step === 'choose' ? (
              /* ── Choose: Photo or Input ── */
              <div className="flex gap-3 pt-1">
                {choiceCard(<Camera size={22} />, t('barcode.photo'), t('barcode.point_at'), () => { setError(null); setStep('scan'); })}
                {choiceCard(<Keyboard size={22} />, t('barcode.input'), t('barcode.type_number'), () => { setError(null); setStep('input'); })}
              </div>
            ) : step === 'scan' ? (
              /* ── Animated barcode-reader ── */
              <div>
                <div data-theme-exempt="media-canvas" style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
                  {/* W12: camera fades beneath once the code locks */}
                  <motion.div
                    animate={{ opacity: locked ? 0.25 : 1 }}
                    transition={{ duration: reducedMotion ? 0 : 0.4 }}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </motion.div>
                  {/* reticle — W12: snaps gold→ok with a scale pulse on lock, pulses
                      liveGlow through lookup() latency, then morphs into the product
                      card via the shared layoutId */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <motion.div
                      layoutId={reducedMotion ? undefined : 'barcode-target'}
                      className={locked && loading && !reducedMotion ? 'live-glow' : undefined}
                      animate={locked && !reducedMotion ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      style={{
                        position: 'relative', width: '78%', height: '38%',
                        border: `2px solid ${locked ? 'var(--status-success-fg)' : 'var(--action-secondary)'}`,
                        borderRadius: 12, boxShadow: '0 0 0 2000px var(--surface-overlay)',
                      }}
                    >
                      {!locked ? (
                        <motion.div
                          ref={laserRef}
                          initial={{ top: '6%' }}
                          animate={{ top: ['6%', '94%', '6%'] }}
                          transition={{ duration: 2.2, ease: 'easeInOut', repeat: reducedMotion ? 0 : Infinity }}
                          style={{ position: 'absolute', left: '4%', right: '4%', height: 2, background: 'var(--action-primary)', boxShadow: '0 0 8px 1px var(--action-secondary)' }}
                        />
                      ) : (
                        /* laser stopped dead at its sweep position — white-gold flash */
                        <motion.div
                          animate={reducedMotion ? { opacity: 1 } : { opacity: [0.5, 1, 0.4, 1] }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          style={{
                            position: 'absolute', left: '4%', right: '4%', height: 2, top: laserTop ?? '50%',
                            background: 'linear-gradient(90deg, #FFF6E0, var(--action-primary), #FFF6E0)',
                            boxShadow: '0 0 12px 2px rgba(255,246,224,.85)',
                          }}
                        />
                      )}
                    </motion.div>
                  </div>
                </div>
                <p className="text-xs text-center mt-3" style={{ color: 'var(--content-secondary)' }}>
                  {loading ? t('barcode.looking_up') : t('barcode.hold_in_frame')}
                </p>
                <button onClick={() => setStep('input')} className="w-full text-xs mt-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--action-primary)', fontFamily: 'var(--font-mono)' }}>
                  {t('barcode.enter_manually')}
                </button>
              </div>
            ) : step === 'input' ? (
              /* ── Manual input ── */
              <div>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') lookup(code); }}
                  placeholder={t('barcode.number_placeholder')}
                  inputMode="numeric" autoFocus
                  style={{ width: '100%', background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '11px 12px', color: 'var(--content-primary)', fontSize: 16, fontFamily: 'var(--font-mono)', marginBottom: 10 }} className="text-base"
                />
                <button onClick={() => lookup(code)} disabled={loading || !code}
                  style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'var(--action-primary)', color: 'var(--action-on-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: loading || !code ? 'not-allowed' : 'pointer', opacity: code ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  {loading ? <><Loader2 size={14} className="animate-spin" /> {t('barcode.looking_up')}</> : t('barcode.look_up')}
                </button>
              </div>
            ) : (
              /* ── Manual add (barcode not in Open Food Facts) ── */
              <div>
                <p className="text-xs mb-3" style={{ color: 'var(--content-secondary)' }}>
                  {t('barcode.not_in_db', { code: code ? ` (#${code})` : '' })}
                </p>
                <input
                  value={manual.name}
                  onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                  placeholder={t('barcode.product_name')}
                  style={{ width: '100%', background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 12px', color: 'var(--content-primary)', fontSize: 16, marginBottom: 8 }} className="text-base"
                />
                <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
                  {([['kcal', 'barcode.ph_kcal'], ['protein', 'barcode.ph_protein'], ['carbs', 'barcode.ph_carbs'], ['fat', 'barcode.ph_fat']] as const).map(([k, ph]) => (
                    <input key={k} value={manual[k]} inputMode="decimal"
                      onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value.replace(/[^\d.]/g, '') }))}
                      placeholder={t(ph)}
                      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '9px 11px', color: 'var(--content-primary)', fontSize: 16, fontFamily: 'var(--font-mono)' }} className="text-base" />
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs" style={{ color: 'var(--content-secondary)' }}>{t('barcode.amount')}</span>
                  <input type="number" min={1} value={grams} onChange={(e) => setGrams(Math.max(1, Number(e.target.value) || 0))}
                    style={{ width: 80, background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 8px', color: 'var(--content-primary)', fontSize: 16, fontFamily: 'var(--font-mono)' }} className="text-base" />
                  <span className="text-xs" style={{ color: 'var(--content-muted)' }}>g/ml</span>
                </div>
                <div className="flex gap-1 mb-3">
                  {MEAL_OPTIONS.map((m) => (
                    <button key={m} onClick={() => setMealType(m)} className="flex-1 text-xs min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ padding: '6px 0', borderRadius: 8, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid', borderColor: mealType === m ? 'var(--action-primary)' : 'var(--border-default)', background: mealType === m ? 'var(--action-secondary)' : 'transparent', color: mealType === m ? 'var(--action-primary)' : 'var(--content-secondary)', fontFamily: 'var(--font-mono)' }}>{m}</button>
                  ))}
                </div>
                <button onClick={logManual} disabled={logging || !manual.name.trim()}
                  style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'var(--action-primary)', color: 'var(--action-on-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: logging || !manual.name.trim() ? 'not-allowed' : 'pointer', opacity: manual.name.trim() ? 1 : 0.5 }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  {logging ? t('barcode.logging') : t('barcode.add_to_log')}
                </button>
              </div>
            )}

            {error && <p className="text-xs mt-3 text-center" style={{ color: 'var(--status-danger-fg)' }}>{error}</p>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
