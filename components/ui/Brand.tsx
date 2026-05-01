import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Trophē v0.3 — Brand primitives.
 *
 * Brand Master v1.0 rules (Apr 18 2026):
 *   - Wordmark: "trophē" · Instrument Serif · italic · 400 · gold-300
 *   - No bold, no roman in wordmark or display
 *   - Gold-300 (#D4A853) is the only accent — never two golds at once
 *   - No drop-shadows on text
 *   - Mono chrome (JetBrains Mono) for labels, eyebrows, section titles
 */

interface BrandEyeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

/** Gold mono eyebrow — uppercase, 8px, .2em letter-spacing. */
export function BrandEye({ className = '', children, ...rest }: BrandEyeProps) {
  return (
    <span className={`brand-eye ${className}`} {...rest}>
      {children}
    </span>
  );
}

/** Muted mono label — uppercase, 9px, .18em letter-spacing. */
export function MonoLabel({ className = '', children, ...rest }: BrandEyeProps) {
  return (
    <span className={`mono-label ${className}`} {...rest}>
      {children}
    </span>
  );
}

/** Gold mono section heading with bottom border. */
export function SectionTitle({ className = '', children, ...rest }: BrandEyeProps) {
  return (
    <h3
      className={`section-title border-b border-[rgba(212,168,83,0.15)] pb-2 mb-5 ${className}`}
      {...rest}
    >
      {children}
    </h3>
  );
}

/**
 * The canonical wordmark — "trophē" in Instrument Serif italic.
 *
 * Size guide (from Brand Master responsive scale):
 *   display  · 96px — splash / hero
 *   default  · 48px — nav bar / header
 *   nav      · 24px — mobile nav
 *   min      · 14px — minimum legal size
 *
 * Clearspace: 1× cap-height on all sides (do not crowd with other elements).
 */
export function BrandWordmark({
  size = 'default',
  className = '',
}: {
  size?: 'display' | 'default' | 'nav' | 'min';
  className?: string;
}) {
  const sizeMap = {
    display: 'text-[96px]',
    default: 'text-[48px]',
    nav:     'text-[24px]',
    min:     'text-[14px]',
  };
  return (
    <span
      className={`font-serif italic text-[var(--gold-300)] tracking-[-0.025em] leading-[0.92] select-none ${sizeMap[size]} ${className}`}
      aria-label="trophē"
    >
      trophē
    </span>
  );
}

/**
 * The laurel + T brand mark symbol (from /public/sprite.svg #brand-mark).
 * Use when horizontal space is limited or alongside the wordmark.
 *
 * Brand Master construction: 64×64 viewBox, twin laurels + serif T.
 * Min size: 16px (favicon) — swap to #brand-mono below that.
 */
export function BrandMark({
  size = 32,
  className = '',
  color = 'currentColor',
}: {
  size?: number;
  className?: string;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      style={{ color }}
      className={className}
      aria-label="Trophē mark"
      role="img"
    >
      <use href="/sprite.svg#brand-mark" />
    </svg>
  );
}

/**
 * Compact monogram — use below 16px or in favicon-context.
 */
export function BrandMono({
  size = 20,
  className = '',
  color = 'currentColor',
}: {
  size?: number;
  className?: string;
  color?: string;
}) {
  return (
    <svg width={size} height={size} style={{ color }} className={className} aria-hidden>
      <use href="/sprite.svg#brand-mono" />
    </svg>
  );
}

/**
 * Full horizontal lockup: BrandMark + separator + BrandWordmark.
 * Matches Brand Master lockup 04a.
 */
export function BrandLockup({
  size = 'default',
  className = '',
}: {
  size?: 'display' | 'default' | 'nav' | 'min';
  className?: string;
}) {
  const markSizes = { display: 64, default: 52, nav: 28, min: 16 };
  const sepHeights = { display: '54px', default: '42px', nav: '22px', min: '14px' };
  return (
    <div className={`flex items-center gap-[18px] ${className}`}>
      <BrandMark size={markSizes[size]} color="var(--gold-300)" />
      <div style={{ height: sepHeights[size], width: '1px', background: 'var(--line-2)' }} />
      <BrandWordmark size={size} />
    </div>
  );
}

/**
 * Legacy: Greek wordmark τροφή in JetBrains Mono.
 * @deprecated — use BrandWordmark or BrandLockup per Brand Master v1.0.
 * Kept for backward compat until Phase 8 UI sweep.
 */
export function Wordmark({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-2xl' };
  return (
    <span
      className={`font-mono font-bold text-[var(--color-gold)] tracking-[0.18em] ${sizes[size]} ${className}`}
      aria-label="Trophē"
    >
      τροφή
    </span>
  );
}
