'use client';

import { useEffect, useState, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

export interface ExerciseMotionProps {
  media: ExerciseMediaRecord;
  alt: string;
  autoplay?: boolean;
  className?: string;
  playbackDisabled?: boolean;
}

export function ExerciseMotion({ media, alt, autoplay = false, className = '', playbackDisabled = false }: ExerciseMotionProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const isExactTechnique = media.tier === 'verified-technique' && Boolean(media.motionSrc);
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
    const video = videoRef.current;
    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!video || !isExactTechnique || reducedMotion !== false || prefersReducedMotion) return;
    if (playbackDisabled) {
      video.pause();
      return;
    }
    if (isPlaying && inViewport && pageVisible) {
      try {
        const attempt = video.play();
        void attempt?.catch(() => setIsPlaying(false));
      } catch {
        queueMicrotask(() => setIsPlaying(false));
      }
      return;
    }
    video.pause();
  }, [inViewport, isExactTechnique, isPlaying, pageVisible, playbackDisabled, reducedMotion]);

  useEffect(() => {
    if (!isExactTechnique || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry?.isIntersecting ?? false), { threshold: 0.15 });
    const target = videoRef.current;
    if (target) observer.observe(target);
    return () => observer.disconnect();
  }, [isExactTechnique, reducedMotion]);

  const pause = () => setIsPlaying(false);
  const play = () => setIsPlaying(true);

  if (reducedMotion !== false || !isExactTechnique) {
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
        {reducedMotion === null && isExactTechnique ? null : <figcaption>{t(statusKey)}</figcaption>}
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
        preload="metadata"
        aria-label={alt}
        data-testid="exercise-motion-video"
        className="exercise-motion__video"
      >
        <source src={media.motionSrc} type={media.motionType} />
      </video>
      <figcaption className="exercise-motion__controls">
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
