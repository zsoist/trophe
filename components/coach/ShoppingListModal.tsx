'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Loader2, Copy, Check } from 'lucide-react';
import type { AggregatedItem } from '@/lib/food/shopping-list';

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
  produce: '🥬 Produce',
  protein: '🍗 Protein',
  dairy: '🧀 Dairy',
  grains: '🌾 Grains',
  pantry: '🫙 Pantry',
  frozen: '🧊 Frozen',
  bakery: '🥖 Bakery',
  other: '🛒 Other',
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
  useEffect(() => {
    if (!isOpen) return;
    generate();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
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
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-1,#1c1917)', border: '1px solid var(--line-2,rgba(255,255,255,0.08))', maxHeight: '88vh', overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} style={{ color: 'var(--gold-300,#D4A853)' }} />
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--t1,#f5f5f4)' }}>Shopping list</h2>
                {clientName && <p className="text-[11px]" style={{ color: 'var(--t3,#a8a29e)' }}>{clientName}{data ? ` · ${data.mealCount} meals` : ''}</p>}
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.06)' }}>
              <X size={14} style={{ color: 'var(--t3,#a8a29e)' }} />
            </button>
          </div>

          <div className="px-5 pb-5">
            {loading && (
              <div className="py-12 flex flex-col items-center gap-3">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--gold-300,#D4A853)' }} />
                <p className="text-xs" style={{ color: 'var(--t3,#a8a29e)' }}>Reading the week&apos;s plan…</p>
              </div>
            )}

            {error && !loading && <p className="text-xs py-6 text-center" style={{ color: '#f87171' }}>{error}</p>}

            {data && !loading && data.items.length === 0 && (
              <p className="text-sm py-10 text-center" style={{ color: 'var(--t3,#a8a29e)' }}>
                No meals in the plan yet — add some, then generate the list.
              </p>
            )}

            {data && !loading && data.items.length > 0 && (
              <>
                <div className="flex flex-col gap-4">
                  {orderedCats.map((cat) => (
                    <div key={cat}>
                      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--t4,#78716c)', fontFamily: 'var(--font-mono)' }}>
                        {CATEGORY_LABEL[cat] ?? cat}
                      </div>
                      <div className="flex flex-col gap-1">
                        {data.byCategory[cat].map((it, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--surface,#141414)' }}>
                            <span className="text-[13px]" style={{ color: 'var(--t1,#f5f5f4)' }}>{it.name}</span>
                            <span className="text-[11px]" style={{ color: 'var(--t3,#a8a29e)', fontFamily: 'var(--font-mono)' }}>
                              {it.quantity > 0 ? `${it.quantity}${it.unit ? ' ' + it.unit : ''}` : '—'}{it.occurrences > 1 ? ` ×${it.occurrences}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-5">
                  <button
                    onClick={copyAll}
                    style={{
                      flex: 1, padding: 11, borderRadius: 12, border: '1px solid rgba(212,168,83,.3)',
                      background: 'rgba(212,168,83,.12)', color: 'var(--gold-300,#D4A853)', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}
                  >
                    {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy list</>}
                  </button>
                  <button
                    onClick={generate}
                    style={{
                      padding: '11px 16px', borderRadius: 12, border: '1px solid var(--line,rgba(255,255,255,.1))',
                      background: 'transparent', color: 'var(--t3,#a8a29e)', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
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
