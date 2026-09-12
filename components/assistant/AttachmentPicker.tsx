'use client';
import { useRef, useState } from 'react';
import { Camera, ImagePlus, Plus, X } from 'lucide-react';
import { AttachmentController, type AttachmentState, type AttachmentTransport } from './attachment-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function AttachmentPicker({ controller, state, conversationId, transport, analysisEnabled = false, prepareConversation, disabled, compact = false, deferUpload = false }: {
  controller: AttachmentController; state: AttachmentState; conversationId: string; transport?: AttachmentTransport; analysisEnabled?: boolean; prepareConversation?: () => Promise<string | null>; disabled: boolean;
  compact?: boolean; deferUpload?: boolean;
}) {
  const { t } = useGlobalCoachI18n();
  const popover = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<{ key: string; operation: 'upload' | 'remove' } | null>(null);
  const selected = state.items.find(item => item.key === review?.key);
  const previews = <ul className={deferUpload ? styles.selectedPhotos : undefined}>
      {state.items.map(item => <li key={item.key}>
        {/* User-selected object URL, retained only for this subject and explicitly revoked on removal/reset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt="" width={48} height={48} />
        <div><p className={styles.fileName}>{item.file.name}</p><p>{t(`global_coach.photo_${item.state}`)}</p>
          <div className={styles.memoryActions}>
            {!deferUpload && transport && (item.state === 'selected' || item.state === 'retryable') && <button type="button" disabled={state.pending || disabled} onClick={() => setReview({ key: item.key, operation: 'upload' })}>{t('global_coach.photo_review_upload')}</button>}
            {transport && item.state === 'uncertain' && <button type="button" disabled={state.pending || disabled} onClick={() => void controller.check(item.key, conversationId, transport)}>{t('global_coach.photo_check')}</button>}
            <button type="button" disabled={state.pending || disabled} onClick={() => deferUpload ? void controller.remove(item.key, conversationId, transport) : setReview({ key: item.key, operation: 'remove' })} aria-label={compact ? `${t('global_coach.photo_remove')}: ${item.file.name}` : undefined}>{compact ? <X size={16} aria-hidden="true" /> : t('global_coach.photo_remove')}</button>
          </div>
        </div>
      </li>)}
    </ul>;
  return <>{deferUpload && state.items.length > 0 && previews}{deferUpload && state.error && <p role="status">{t(`global_coach.photo_error_${state.error}`)}</p>}<details ref={popover} data-coach-popover className={`${styles.attachments} ${compact ? styles.compactAttachments : ''}`}>
    <summary aria-label={t('global_coach.photos')}><span className={styles.compactOnly}><Plus size={20} aria-hidden="true" /></span><span className={styles.expandedOnly}><ImagePlus size={17} aria-hidden="true" />{t('global_coach.photos')}{state.items.length > 0 && ` · ${state.items.length}/3`}</span></summary>
    {!compact && <><p>{t(transport ? analysisEnabled ? 'global_coach.photos_analysis' : 'global_coach.photos_upload_only' : 'global_coach.photos_local')}</p><p>{t('global_coach.photos_limits')}</p></>}
    <input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label={t('global_coach.photos_select')} disabled={disabled || state.pending} onChange={event => { void controller.select(Array.from(event.target.files ?? [])); event.target.value = ''; if (compact && popover.current) popover.current.open = false; }} />
    <input hidden ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label={t('global_coach.camera')} disabled={disabled || state.pending} onChange={event => { void controller.select(Array.from(event.target.files ?? [])); event.target.value = ''; if (compact && popover.current) popover.current.open = false; }} />
    <div className={styles.attachmentPopover}>
    <div className={styles.attachmentChoices}>
      <button type="button" disabled={disabled || state.pending || state.items.length >= 3} onClick={() => input.current?.click()}><ImagePlus size={17} aria-hidden="true" />{t('global_coach.photos_select')}</button>
      <button type="button" disabled={disabled || state.pending || state.items.length >= 3} onClick={() => cameraInput.current?.click()}><Camera size={17} aria-hidden="true" />{t('global_coach.camera')}</button>
    </div>
    {!deferUpload && previews}
    {selected && review && <section className={styles.proposal} aria-label={t('global_coach.photo_review')}>
      <p>{t(review.operation === 'upload' ? 'global_coach.photo_upload_review' : 'global_coach.photo_remove_review')}</p>
      <p className={styles.fileName}>{selected.file.name}</p>
      <div className={styles.memoryActions}>
        <button type="button" onClick={() => setReview(null)} disabled={state.pending}>{t('general.cancel')}</button>
        <button type="button" disabled={state.pending || disabled} onClick={() => {
          if (review.operation === 'remove') void controller.remove(selected.key, conversationId, transport);
          else if (transport) void (async () => {
            const durableConversationId = prepareConversation ? await prepareConversation() : conversationId;
            if (durableConversationId) await controller.upload(selected.key, durableConversationId, transport);
          })();
          setReview(null);
        }}>{t('global_coach.confirm_change')}</button>
      </div>
    </section>}
    {state.pending && <button type="button" onClick={() => controller.cancel()}>{t('global_coach.cancel')}</button>}
    {!deferUpload && state.error && <p role="status">{t(`global_coach.photo_error_${state.error}`)}</p>}
    </div>
  </details></>;
}
