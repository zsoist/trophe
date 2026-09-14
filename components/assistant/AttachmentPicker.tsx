'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Camera } from 'lucide-react';
import { AskTropheIcon } from './ask-trophe-icons';
import { AttachmentController, type AttachmentState, type AttachmentTransport } from './attachment-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function AttachmentPicker({ controller, state, conversationId, transport, analysisEnabled = false, prepareConversation, disabled, compact = false, deferUpload = false, maxPhotos = 3 }: {
  controller: AttachmentController; state: AttachmentState; conversationId: string; transport?: AttachmentTransport; analysisEnabled?: boolean; prepareConversation?: () => Promise<string | null>; disabled: boolean;
  compact?: boolean; deferUpload?: boolean; maxPhotos?: number;
}) {
  const { t } = useGlobalCoachI18n();
  const popover = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  // Focus trigger for each enlarged preview, so dismissing the overlay returns focus to the thumbnail.
  const zoomTriggers = useRef<Record<string, HTMLElement | null>>({});
  const [review, setReview] = useState<{ key: string; operation: 'upload' | 'remove' } | null>(null);
  const selected = state.items.find(item => item.key === review?.key);
  /** Local dismissal: close only this zoom, never the surrounding chat, and restore the trigger. */
  const closeZoom = (key: string) => {
    const trigger = zoomTriggers.current[key];
    const details = trigger?.closest('details');
    if (details) details.open = false;
    trigger?.focus();
  };
  const onZoomKeyDown = (event: KeyboardEvent<HTMLDetailsElement>, key: string) => {
    if (event.key !== 'Escape') return;
    // Only a currently enlarged preview owns Escape. A closed thumbnail must let the surrounding
    // chat dialog's own Escape handler close the conversation instead of swallowing the key.
    if (!event.currentTarget.open) return;
    event.preventDefault();
    event.stopPropagation();
    closeZoom(key);
  };
  const previews = <ul className={deferUpload ? styles.selectedPhotos : undefined}>
      {state.items.map(item => <li key={item.key}>
        {/* User-selected object URL, retained only for this subject and explicitly revoked on removal/reset. */}
        <details className={styles.attachmentZoom} onKeyDown={event => onZoomKeyDown(event, item.key)}>
          <summary ref={node => { zoomTriggers.current[item.key] = node; }} aria-label={`${t('global_coach.photo_expand')}: ${item.file.name}`} onClick={event => {
            const details = event.currentTarget.closest('details');
            // Opening is done explicitly so focus can move to the close control; a second click keeps
            // the native close and leaves focus on this thumbnail trigger.
            if (!details || details.open) return;
            event.preventDefault();
            details.open = true;
            details.querySelector<HTMLButtonElement>('[data-zoom-close]')?.focus();
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="" width={56} height={56} />
          </summary>
          <div className={styles.attachmentExpanded}>
            {/* Backdrop dismissal: a real button so touch/pointer users can leave without a visible target. */}
            <button type="button" className={styles.attachmentBackdrop} tabIndex={-1} aria-hidden="true" onClick={() => closeZoom(item.key)} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={item.file.name} />
            <button type="button" data-zoom-close="true" className={styles.attachmentClose} onClick={() => closeZoom(item.key)} aria-label={`${t('global_coach.photo_close')}: ${item.file.name}`}><AskTropheIcon name="close" size={20} /></button>
          </div>
        </details>
        <div><p className={styles.fileName}>{item.file.name}</p><p>{t(deferUpload && item.state === 'available' ? 'global_coach.photo_uploaded' : `global_coach.photo_${item.state}`)}</p>
          <div className={styles.memoryActions}>
            {!deferUpload && transport && (item.state === 'selected' || item.state === 'retryable') && <button type="button" disabled={state.pending || disabled} onClick={() => setReview({ key: item.key, operation: 'upload' })}>{t('global_coach.photo_review_upload')}</button>}
            {transport && item.state === 'uncertain' && <button type="button" disabled={state.pending || disabled} onClick={() => void controller.check(item.key, conversationId, transport)}>{t('global_coach.photo_check')}</button>}
            <button type="button" disabled={state.pending || disabled} onClick={() => deferUpload ? void controller.remove(item.key, conversationId, transport) : setReview({ key: item.key, operation: 'remove' })} aria-label={compact ? `${t('global_coach.photo_remove')}: ${item.file.name}` : undefined}>{compact ? <AskTropheIcon name="close" size={16} /> : t('global_coach.photo_remove')}</button>
          </div>
        </div>
      </li>)}
    </ul>;
  return <>{deferUpload && state.items.length > 0 && previews}{deferUpload && state.error && <p role="status">{t(`global_coach.photo_error_${state.error}`)}</p>}<details ref={popover} data-coach-popover className={`${styles.attachments} ${compact ? styles.compactAttachments : ''}`}>
    <summary aria-label={t('global_coach.photos')}><span className={styles.compactOnly}><AskTropheIcon name="plus" size={20} /></span><span className={styles.expandedOnly}><AskTropheIcon name="image" size={17} />{t('global_coach.photos')}{state.items.length > 0 && ` · ${state.items.length}/${maxPhotos}`}</span></summary>
    {!compact && <><p>{t(transport ? analysisEnabled ? 'global_coach.photos_analysis' : 'global_coach.photos_upload_only' : 'global_coach.photos_local')}</p><p>{t('global_coach.photos_limits')}</p></>}
    <input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={maxPhotos > 1} aria-label={t('global_coach.photos_select')} disabled={disabled || state.pending} onChange={event => { void controller.select(Array.from(event.target.files ?? [])); event.target.value = ''; if (compact && popover.current) popover.current.open = false; }} />
    <input hidden ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label={t('global_coach.camera')} disabled={disabled || state.pending} onChange={event => { void controller.select(Array.from(event.target.files ?? [])); event.target.value = ''; if (compact && popover.current) popover.current.open = false; }} />
    <div className={styles.attachmentPopover}>
    {deferUpload && state.items.length === 0 && <p className={styles.context}>{t('global_coach.photo_one_per_turn')}</p>}
    <div className={styles.attachmentChoices}>
      <button type="button" disabled={disabled || state.pending || state.items.length >= maxPhotos} onClick={() => input.current?.click()}><AskTropheIcon name="image" size={17} />{t('global_coach.photos_select')}</button>
      <button type="button" disabled={disabled || state.pending || state.items.length >= maxPhotos} onClick={() => cameraInput.current?.click()}><Camera size={17} aria-hidden="true" />{t('global_coach.camera')}</button>
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
