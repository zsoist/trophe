'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
function InformationDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="atlas-information-dialog" aria-label={t('anatomy.info')} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><header><h2>{t('anatomy.info')}</h2><button onClick={onClose} aria-label={t('anatomy.close_info')}><X size={20} /></button></header>{children}</dialog>, document.body);
}
export function AtlasInformation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return <div className="atlas-information"><button className="atlas-information-trigger" aria-label={t('anatomy.info')} onClick={() => setOpen(true)}><Info size={19} aria-hidden="true" /></button>{open && <InformationDialog onClose={() => setOpen(false)}>{children}</InformationDialog>}</div>;
}
