'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { PainFlag } from '@/lib/types';

const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const severityOptions = [1, 2, 3, 4, 5] as const;

function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export default function PainFlagModal({ exerciseId, exerciseName = exerciseId, suggestedBodyPart = '', onSave, onClose }: {
  exerciseId: string;
  exerciseName?: string;
  suggestedBodyPart?: string;
  onSave: (flag: PainFlag, mutationId: string) => boolean | void | Promise<boolean | void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const regionKey = ({
    chest: 'painflag.region_chest', back: 'painflag.region_back', shoulders: 'painflag.region_shoulders', arms: 'painflag.region_arms', legs: 'painflag.region_legs', core: 'painflag.region_core',
    biceps: 'painflag.region_biceps', triceps: 'painflag.region_triceps', forearms: 'painflag.region_forearms', quads: 'painflag.region_quads', hamstrings: 'painflag.region_hamstrings', glutes: 'painflag.region_glutes', calves: 'painflag.region_calves',
  } as Record<string, string>)[suggestedBodyPart.toLowerCase()];
  const suggestedRegion = regionKey ? t(regionKey) : ['full_body', 'cardio'].includes(suggestedBodyPart.toLowerCase()) ? t('painflag.region_prompt') : suggestedBodyPart;
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const mutationIdRef = useRef(globalThis.crypto.randomUUID());
  const titleId = useId();
  const [bodyPart, setBodyPart] = useState(suggestedRegion);
  const [severity, setSeverity] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; savingRef.current = saving; });

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && !savingRef.current && onCloseRef.current();
    document.addEventListener('keydown', closeOnEscape);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', closeOnEscape); previousFocus?.focus(); };
  }, []);

  const save = async () => {
    if (!bodyPart.trim() || saving) return;
    setSaving(true); setSaveError(false);
    try {
      const result = await onSave({ exercise_id: exerciseId, body_part: bodyPart.trim(), severity, notes: notes.trim() || undefined }, mutationIdRef.current);
      if (result === false) { setSaveError(true); return; }
      onCloseRef.current();
    } catch { setSaveError(true); } finally { setSaving(false); }
  };

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reducedMotion ? undefined : { opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'var(--surface-overlay)' }} onClick={() => { if (!saving) onCloseRef.current(); }}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={(event) => trapFocus(event, dialogRef.current)} initial={reducedMotion ? false : { scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={reducedMotion ? undefined : { scale: 0.98, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }} className="workout-workspace glass-elevated safe-bottom w-full max-w-sm p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2"><AlertTriangle size={20} className="text-[var(--status-danger-fg)]" /><h3 id={titleId} className="text-lg font-semibold text-[var(--content-primary)]">{t('painflag.title')}</h3></div>
        <p className="mt-1 text-sm text-[var(--content-secondary)]"><span className="font-medium">{t('painflag.exercise')}:</span> {exerciseName}</p>
        <label className="mt-4 block text-sm font-medium text-[var(--content-secondary)]">{t('painflag.body_part_label')}<input type="text" aria-label={t('painflag.body_part_label')} placeholder={t('painflag.body_part_placeholder')} value={bodyPart} onChange={(event) => setBodyPart(event.target.value)} className="input-dark mt-1 min-h-11 text-base" /></label>
        <fieldset className="mt-4"><legend className="text-sm font-medium text-[var(--content-secondary)]">{t('painflag.severity_prefix')}: {severity}/5</legend><div className="flex gap-2">
          {severityOptions.map((value) => { const label = value === 1 ? `1 ${t('painflag.severity_mild')}` : value === 3 ? `3 ${t('painflag.severity_moderate')}` : value === 5 ? `5 ${t('painflag.severity_stop')}` : String(value); return <label key={value} className="flex-1"><input type="radio" name="pain-severity" value={value} checked={severity === value} onChange={() => setSeverity(value)} className="sr-only text-base" /><span className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-1 text-center text-xs font-semibold focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--focus-ring)]" style={{ background: severity === value ? 'var(--status-danger-bg)' : 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: severity === value ? 'var(--status-danger-fg)' : 'var(--content-secondary)', borderColor: severity === value ? 'var(--status-danger-border)' : 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>{label}</span></label>; })}
        </div></fieldset>
        <label className="mt-4 block text-sm font-medium text-[var(--content-secondary)]">{t('painflag.notes_label')}<textarea aria-label={t('painflag.notes_label')} placeholder={t('painflag.notes_placeholder')} value={notes} onChange={(event) => setNotes(event.target.value)} className="input-dark mt-1 h-20 resize-none text-base" /></label>
        <p className="mt-2 text-xs text-[var(--content-secondary)]">{t('painflag.coach_disclosure')}</p>
        <div className="mt-4 flex gap-2"><button type="button" disabled={saving} onClick={() => onCloseRef.current()} className="btn-ghost min-h-11 min-w-11 flex-1 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{t('painflag.cancel')}</button><button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 min-w-11 flex-1 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] py-2 text-sm font-semibold text-[var(--status-danger-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{saving ? t('painflag.saving') : t('painflag.save')}</button></div>
        {saveError ? <p role="alert" className="mt-3 text-sm text-[var(--status-danger-fg)]">{t('painflag.save_failed')}</p> : null}
      </motion.div>
    </motion.div>
  );
}
