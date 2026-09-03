'use client';

import { useEffect, useState, useRef } from 'react';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

export interface ExerciseMotionProps {
  media: ExerciseMediaRecord;
  alt: string;
  autoplay?: boolean;
  className?: string;
}

function reducedMotionPreference(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function ExerciseMotion({ media, alt, autoplay = false, className = '' }: ExerciseMotionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasMotion = Boolean(media.motionSrc);
  const [reducedMotion, setReducedMotion] = useState(reducedMotionPreference);
  const [inViewport, setInViewport] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [isPlaying, setIsPlaying] = useState(autoplay && hasMotion);

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
    if (!video || !hasMotion || reducedMotion) return;
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
  }, [hasMotion, inViewport, isPlaying, pageVisible, reducedMotion]);

  useEffect(() => {
    if (!hasMotion || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry?.isIntersecting ?? false), { threshold: 0.15 });
    const target = videoRef.current;
    if (target) observer.observe(target);
    return () => observer.disconnect();
  }, [hasMotion, reducedMotion]);

  const pause = () => setIsPlaying(false);
  const play = () => setIsPlaying(true);

  if (reducedMotion) {
    return (
      <figure className={`exercise-motion exercise-motion--poster ${className}`}>
        {/* The poster is intentionally a plain image so it remains the complete reduced-motion experience. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.posterSrc} alt={alt} className="exercise-motion__poster" />
        <figcaption>Static poster shown because reduced motion is enabled.</figcaption>
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
        {media.motionSrc ? <source src={media.motionSrc} type={media.motionType} /> : null}
      </video>
      <figcaption className="exercise-motion__controls">
        {hasMotion ? (
          <button type="button" onClick={isPlaying ? pause : play} aria-label={isPlaying ? 'Pause demonstration' : 'Play demonstration'}>
            {isPlaying ? 'Pause demonstration' : 'Play demonstration'}
          </button>
        ) : <button type="button" disabled aria-label="Motion unavailable; poster shown">Motion unavailable</button>}
        <span aria-live="polite">{hasMotion ? (isPlaying ? 'Demonstration playing' : 'Demonstration paused') : 'No motion file available. Poster shown.'}</span>
      </figcaption>
    </figure>
  );
}

export default ExerciseMotion;
