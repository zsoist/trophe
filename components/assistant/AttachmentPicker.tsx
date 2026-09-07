'use client';
import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { AttachmentController, type AttachmentState, type AttachmentTransport } from './attachment-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function AttachmentPicker({ controller, state, conversationId, transport, disabled }: {
  controller: AttachmentController; state: AttachmentState; conversationId: string; transport?: AttachmentTransport; disabled: boolean;
}) {
  const { t } = useGlobalCoachI18n();
  const input = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<{ key: string; operation: 'upload' | 'remove' } | null>(null);
  const selected = state.items.find(item => item.key === review?.key);
  return <details className={styles.attachments}>
    <summary><ImagePlus size={17} aria-hidden="true" />{t('global_coach.photos')}{state.items.length > 0 && ` · ${state.items.length}/3`}</summary>
    <p>{t(transport ? 'global_coach.photos_upload_only' : 'global_coach.photos_local')}</p>
    <p>{t('global_coach.photos_limits')}</p>
    <input className="sr-only" ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label={t('global_coach.photos_select')} disabled={disabled || state.pending} onChange={event => { void controller.select(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    <button type="button" disabled={disabled || state.pending || state.items.length >= 3} onClick={() => input.current?.click()}>{t('global_coach.photos_select')}</button>
    <ul>
      {state.items.map(item => <li key={item.key}>
        {/* User-selected object URL, retained only for this subject and explicitly revoked on removal/reset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt="" width={48} height={48} />
        <div><p className={styles.fileName}>{item.file.name}</p><p>{t(`global_coach.photo_${item.state}`)}</p>
          <div className={styles.memoryActions}>
            {transport && (item.state === 'selected' || item.state === 'retryable') && <button type="button" disabled={state.pending || disabled} onClick={() => setReview({ key: item.key, operation: 'upload' })}>{t('global_coach.photo_review_upload')}</button>}
            {transport && item.state === 'uncertain' && <button type="button" disabled={state.pending || disabled} onClick={() => void controller.check(item.key, conversationId, transport)}>{t('global_coach.photo_check')}</button>}
            <button type="button" disabled={state.pending || disabled} onClick={() => setReview({ key: item.key, operation: 'remove' })}>{t('global_coach.photo_remove')}</button>
          </div>
        </div>
      </li>)}
    </ul>
    {selected && review && <section className={styles.proposal} aria-label={t('global_coach.photo_review')}>
      <p>{t(review.operation === 'upload' ? 'global_coach.photo_upload_review' : 'global_coach.photo_remove_review')}</p>
      <p className={styles.fileName}>{selected.file.name}</p>
      <div className={styles.memoryActions}>
        <button type="button" onClick={() => setReview(null)} disabled={state.pending}>{t('general.cancel')}</button>
        <button type="button" disabled={state.pending || disabled} onClick={() => {
          if (review.operation === 'remove') void controller.remove(selected.key, conversationId, transport);
          else if (transport) void controller.upload(selected.key, conversationId, transport);
          setReview(null);
        }}>{t('global_coach.confirm_change')}</button>
      </div>
    </section>}
    {state.pending && <button type="button" onClick={() => controller.cancel()}>{t('global_coach.cancel')}</button>}
    {state.error && <p role="status">{t(`global_coach.photo_error_${state.error}`)}</p>}
  </details>;
}
