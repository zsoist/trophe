'use client';

import { useEffect, useState, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

export interface ExerciseMotionProps {
  media: ExerciseMediaRecord | (Omit<ExerciseMediaRecord, 'tier'> & { tier: 'candidate-preview' });
  alt: string;
  autoplay?: boolean;
  className?: string;
  playbackDisabled?: boolean;
  /** Only for the loopback candidate reviewer; never enabled by catalogue consumers. */
  previewOnly?: boolean;
}

export function ExerciseMotion(props: ExerciseMotionProps) {
  return <ExerciseMotionPlayer key={`${props.media.slug}:${props.media.motionSrc ?? ''}:${props.media.mobileMotionSrc ?? ''}`} {...props} />;
}

function ExerciseMotionPlayer({ media, alt, autoplay = false, className = '', playbackDisabled = false, previewOnly = false }: ExerciseMotionProps) {
  const { t } = useI18n();
  const [phaseKey, setPhaseKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isExactTechnique = (media.tier === 'verified-technique' || (previewOnly && media.tier === 'candidate-preview')) && Boolean(media.motionSrc);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [inViewport, setInViewport] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [isPlaying, setIsPlaying] = useState(autoplay && isExactTechnique);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    const blur = () => setFocused(false);
    const focus = () => setFocused(true);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    return () => { video?.pause(); };
  }, [reducedMotion, failed]);

  useEffect(() => {
    const video = videoRef.current;
    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!video || !isExactTechnique || reducedMotion !== false || prefersReducedMotion) return;
    if (playbackDisabled) {
      video.pause();
      return;
    }
    if (isPlaying && inViewport && pageVisible && focused) {
      try {
        const attempt = video.play();
        void attempt?.catch(() => setIsPlaying(false));
      } catch {
        queueMicrotask(() => setIsPlaying(false));
      }
      return;
    }
    video.pause();
  }, [inViewport, isExactTechnique, isPlaying, pageVisible, playbackDisabled, reducedMotion, focused, failed]);

  useEffect(() => {
    if (!isExactTechnique || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry?.isIntersecting ?? false), { threshold: 0.15 });
    const target = videoRef.current;
    if (target) observer.observe(target);
    return () => observer.disconnect();
  }, [isExactTechnique, reducedMotion, failed]);

  const pause = () => setIsPlaying(false);
  const play = () => setIsPlaying(true);

  if (reducedMotion !== false || !isExactTechnique || failed) {
    const statusKey = reducedMotion === true
      ? 'workout.motion_reduced'
      : media.tier === 'verified-anatomy'
        ? 'workout.motion_anatomy_only'
        : media.tier === 'group-estimate'
          ? 'workout.motion_group_estimate'
          : 'workout.motion_no_exact';
    return (
      <figure className={`exercise-motion exercise-motion--poster ${className}`}>
        {/* The poster is intentionally a plain image so it remains the complete reduced-motion experience. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.posterSrc} alt={alt} className="exercise-motion__poster" />
        {failed ? <figcaption><button type="button" disabled={playbackDisabled} onClick={() => { setFailed(false); setIsPlaying(true); }}>{t('workout.motion_play')}</button></figcaption>
          : reducedMotion === null && isExactTechnique ? null : <figcaption>{t(statusKey)}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className={`exercise-motion ${className}`}>
      <video
        ref={videoRef}
        poster={media.posterSrc}
        muted
        loop
        playsInline
        preload="none"
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setPhaseKey(media.timedPhases?.find(phase => time >= phase.startSeconds && time < phase.endSeconds)?.labelKey ?? null);
        }}
        onError={(event) => { if (event.target === event.currentTarget) { setFailed(true); setIsPlaying(false); } }}
        aria-label={alt}
        data-testid="exercise-motion-video"
        className="exercise-motion__video"
      >
        {media.mobileMotionSrc ? <source src={media.mobileMotionSrc} type={media.mobileMotionType} media="(max-width: 720px)" /> : null}
        <source src={media.motionSrc} type={media.motionType} onError={() => { setFailed(true); setIsPlaying(false); }} />
      </video>
      <figcaption className="exercise-motion__controls">
        {phaseKey ? <span>{t(phaseKey)}</span> : null}
        <button type="button" disabled={playbackDisabled} onClick={isPlaying ? pause : play} aria-label={t(playbackDisabled ? 'workout.motion_session_paused_action' : isPlaying ? 'workout.motion_pause' : 'workout.motion_play')}>
          {playbackDisabled || !isPlaying ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          {t(playbackDisabled ? 'workout.motion_session_paused_action' : isPlaying ? 'workout.motion_pause' : 'workout.motion_play')}
        </button>
        <span aria-live="polite">{t(playbackDisabled ? 'workout.motion_session_paused' : isPlaying ? 'workout.motion_playing' : 'workout.motion_paused')}</span>
      </figcaption>
    </figure>
  );
}

export default ExerciseMotion;
