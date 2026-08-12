'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { X, ShoppingCart, Loader2, Copy, Check, Carrot, Beef, Milk, Wheat, Archive, Snowflake, Croissant, ShoppingBasket } from 'lucide-react';
import type { AggregatedItem } from '@/lib/food/shopping-list';
import { useCoachDialogFocus } from '@/components/coach/useCoachDialogFocus';

/**
 * Coach shopping-list modal (Daily Nutrafit "Shopping Lists"). Calls
 * /api/coach/shopping-list which reads the client's weekly meal plan, runs the
 * DeepSeek extraction, and returns a consolidated, category-grouped list.
 */

interface Props {
  isOpen: boolean;
  clientId: string;
  clientName?: string | null;
  onClose: () => void;
}

interface ApiResponse {
  items: AggregatedItem[];
  byCategory: Record<string, AggregatedItem[]>;
  mealCount: number;
  error?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  produce: 'Produce',
  protein: 'Protein',
  dairy: 'Dairy',
  grains: 'Grains',
  pantry: 'Pantry',
  frozen: 'Frozen',
  bakery: 'Bakery',
  other: 'Other',
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
  produce: Carrot,
  protein: Beef,
  dairy: Milk,
  grains: Wheat,
  pantry: Archive,
  frozen: Snowflake,
  bakery: Croissant,
  other: ShoppingBasket,
};

const CATEGORY_ORDER = ['produce', 'protein', 'dairy', 'grains', 'bakery', 'frozen', 'pantry', 'other'];

function lineText(it: AggregatedItem): string {
  const qty = it.quantity > 0 ? `${it.quantity}${it.unit ? ' ' + it.unit : ''} ` : '';
  const extras = it.extras?.length ? ` (+ ${it.extras.join(', ')})` : '';
  const times = it.occurrences > 1 ? ` ×${it.occurrences}` : '';
  return `${qty}${it.name}${extras}${times}`;
}

export default function ShoppingListModal({ isOpen, clientId, clientName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/coach/shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const body = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate list.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Generate on open; lock scroll.
  useCoachDialogFocus(isOpen, onClose, dialogRef);
  useEffect(() => {
    if (!isOpen) return;
    generate();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, generate]);

  function copyAll() {
    if (!data) return;
    const lines: string[] = [];
    for (const cat of CATEGORY_ORDER) {
      const group = data.byCategory[cat];
      if (!group?.length) continue;
      lines.push(CATEGORY_LABEL[cat] ?? cat);
      for (const it of group) lines.push(`- ${lineText(it)}`);
      lines.push('');
    }
    navigator.clipboard?.writeText(lines.join('\n').trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!isOpen) return null;

  const orderedCats = CATEGORY_ORDER.filter((c) => data?.byCategory[c]?.length);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }} animate={reduceMotion ? undefined : { opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }}
        className="fixed inset-0 z-[var(--z-modal,60)] flex items-end sm:items-center justify-center"
        style={{ background: 'color-mix(in srgb, var(--canvas) 80%, transparent)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shopping-list-title"
          tabIndex={-1}
          initial={reduceMotion ? false : { y: '100%', opacity: 0 }} animate={reduceMotion ? undefined : { y: 0, opacity: 1 }} exit={reduceMotion ? undefined : { y: '100%', opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="safe-bottom w-full overflow-hidden rounded-t-3xl pb-[env(safe-area-inset-bottom)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:max-w-md sm:rounded-3xl"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', maxHeight: '88vh', overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} style={{ color: 'var(--action-primary)' }} />
              <div>
                <h2 id="shopping-list-title" className="text-base font-bold" style={{ color: 'var(--content-primary)' }}>Shopping list</h2>
                {clientName && <p className="text-xs" style={{ color: 'var(--content-muted)' }}>{clientName}{data ? ` · ${data.mealCount} meals` : ''}</p>}
              </div>
            </div>
            <button aria-label="Close shopping list" onClick={onClose} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--border-subtle)' }}>
              <X aria-hidden="true" size={14} style={{ color: 'var(--content-muted)' }} />
            </button>
          </div>

          <div className="px-5 pb-5">
            {loading && (
              <div className="py-12 flex flex-col items-center gap-3">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--action-primary)' }} />
                <p className="text-xs" style={{ color: 'var(--content-muted)' }}>Reading the week&apos;s plan…</p>
              </div>
            )}

            {error && !loading && <p className="text-xs py-6 text-center" style={{ color: 'var(--status-danger-fg)' }}>{error}</p>}

            {data && !loading && data.items.length === 0 && (
              <p className="text-sm py-10 text-center" style={{ color: 'var(--content-muted)' }}>
                No meals in the plan yet — add some, then generate the list.
              </p>
            )}

            {data && !loading && data.items.length > 0 && (
              <>
                <div className="flex flex-col gap-4">
                  {orderedCats.map((cat) => {
                    const CatIcon = CATEGORY_ICON[cat] ?? ShoppingBasket;
                    return (
                    <div key={cat}>
                      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider mb-1.5" style={{ color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>
                        <CatIcon size={12} style={{ color: 'var(--action-primary)', flexShrink: 0 }} aria-hidden />
                        {CATEGORY_LABEL[cat] ?? cat}
                      </div>
                      <div className="flex flex-col gap-1">
                        {data.byCategory[cat].map((it, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--surface-1)' }}>
                            <span className="text-[13px]" style={{ color: 'var(--content-primary)' }}>{it.name}</span>
                            <span className="text-xs" style={{ color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>
                              {it.quantity > 0 ? `${it.quantity}${it.unit ? ' ' + it.unit : ''}` : '—'}{it.occurrences > 1 ? ` ×${it.occurrences}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 mt-5">
                  <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    onClick={copyAll}
                    style={{
                      flex: 1, padding: 11, borderRadius: 12, border: '1px solid var(--status-warning-border)',
                      background: 'var(--status-warning-bg)', color: 'var(--action-primary)', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}
                  >
                    {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy list</>}
                  </button>
                  <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    aria-label="Regenerate shopping list"
                    onClick={generate}
                    style={{
                      padding: '11px 16px', borderRadius: 12, border: '1px solid var(--border-subtle)',
                      background: 'transparent', color: 'var(--content-muted)', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    ↻
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
