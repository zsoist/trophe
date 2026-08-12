'use client';

/**
 * Progress-page customizer — bottom sheet with per-panel visibility toggles
 * and up/down reordering. Shared by the progress header gear and the settings
 * appearance section. Writes through useAppearance() so changes apply live
 * and persist (localStorage + profiles.display_prefs.appearance).
 *
 * Coach-gated panels show a lock note instead of a toggle when the gate is
 * closed: user customization never overrides coach permission.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, ChevronUp, ChevronDown, Lock, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAppearance } from '@/components/shared/AppearanceProvider';
import { DEFAULT_APPEARANCE, isProgressPanelOn, orderedPanels } from '@/lib/appearance';

interface Props {
  open: boolean;
  onClose: () => void;
  /** coach gates currently open for this client (e.g. { showCalories: false }) */
  coachGates: Record<string, boolean>;
}

export default function CustomizeSheet({ open, onClose, coachGates }: Props) {
  const { t } = useI18n();
  const { prefs, setPrefs } = useAppearance();
  const reducedMotion = useReducedMotion();

  const panels = orderedPanels(prefs);

  const toggle = (id: string) => {
    setPrefs({ ...prefs, panels: { ...prefs.panels, [id]: !isProgressPanelOn(prefs, id) } });
  };

  const move = (id: string, dir: -1 | 1) => {
    const order = [...prefs.panelOrder];
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setPrefs({ ...prefs, panelOrder: order });
  };

  const reset = () => {
    setPrefs({ ...prefs, panels: {}, panelOrder: DEFAULT_APPEARANCE.panelOrder.slice() });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label={t('progress.customize_title')}
            className="fixed left-0 right-0 bottom-0 z-50 mx-auto max-w-md"
            style={{
              background: 'var(--surface-1)', borderRadius: '18px 18px 0 0',
              border: '1px solid var(--border-default)', borderBottom: 'none',
              padding: '14px 16px calc(16px + env(safe-area-inset-bottom))',
              maxHeight: '78vh', overflowY: 'auto',
            }}
            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--line-2,rgba(255,255,255,.12))', margin: '0 auto 12px' }} />
            <div className="row-b" style={{ marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{t('progress.customize_title')}</div>
                <div className="ds-sub" style={{ fontSize: 11 }}>{t('progress.customize_sub')}</div>
              </div>
              <button
                onClick={reset}
                className="btn-ghost min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                style={{ fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <RotateCcw size={11} />
                {t('progress.customize_reset')}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {panels.map((p, idx) => {
                const gateClosed = p.coachGate ? !coachGates[p.coachGate] : false;
                const on = !gateClosed && isProgressPanelOn(prefs, p.id);
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                      borderRadius: 12, background: 'var(--surface-2)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
                      opacity: gateClosed ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        aria-label={t('progress.customize_move_up')}
                        disabled={idx === 0}
                        onClick={() => move(p.id, -1)}
                        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--content-muted)' : 'var(--content-secondary)', padding: 1, lineHeight: 0 }}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        aria-label={t('progress.customize_move_down')}
                        disabled={idx === panels.length - 1}
                        onClick={() => move(p.id, 1)}
                        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        style={{ background: 'none', border: 'none', cursor: idx === panels.length - 1 ? 'default' : 'pointer', color: idx === panels.length - 1 ? 'var(--content-muted)' : 'var(--content-secondary)', padding: 1, lineHeight: 0 }}
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: on ? 'var(--t1)' : 'var(--t4)' }}>
                      {t(p.labelKey)}
                    </span>
                    {gateClosed ? (
                      <span className="ds-sub" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Lock size={11} />
                        {t('progress.customize_coach_locked')}
                      </span>
                    ) : (
                      <button
                        aria-label={t(p.labelKey)}
                        aria-pressed={on}
                        onClick={() => toggle(p.id)}
                        style={{
                          background: on ? 'var(--accent-soft)' : 'var(--surface-2)',
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
                          borderRadius: 9, minWidth: 44, minHeight: 44, padding: '6px 9px', cursor: 'pointer', lineHeight: 0,
                          color: on ? 'var(--accent)' : 'var(--content-muted)',
                          transition: 'all .15s',
                        }}
                      >
                        {on ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
