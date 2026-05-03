/**
 * Trophē v0.3 — SVG sprite icon component.
 *
 * Brand Master v1.0 rules:
 *   - All icons from /public/sprite.svg (56 icons + brand mark)
 *   - 24×24 viewBox · 1.6px stroke · round caps + joins
 *   - Always currentColor — color via className or parent CSS
 *   - Render sizes: 14, 16, 18, 22, 26 (no scaling artifacts)
 *   - No emoji substitutions in product UI
 *
 * Usage:
 *   <Icon name="i-flame" size={18} className="text-[var(--gold-300)]" />
 *   <Icon name="brand-mark" size={32} className="text-[var(--gold-300)]" />
 */

import type { SVGAttributes } from 'react';

export type IconName =
  // Brand
  | 'brand-mark'
  | 'brand-mono'
  // Navigation
  | 'i-home'
  | 'i-book'
  | 'i-chart'
  | 'i-user'
  | 'i-users'
  | 'i-grid'
  | 'i-list'
  | 'i-folder'
  // Actions
  | 'i-plus'
  | 'i-check'
  | 'i-x'
  | 'i-arrow-r'
  | 'i-arrow-up'
  | 'i-arrow-down'
  | 'i-chev-r'
  | 'i-chev-l'
  | 'i-chev-d'
  | 'i-search'
  | 'i-filter'
  | 'i-edit'
  | 'i-trash'
  | 'i-more'
  | 'i-settings'
  | 'i-share'
  | 'i-copy'
  | 'i-download'
  | 'i-upload'
  | 'i-refresh'
  // Communication
  | 'i-bell'
  | 'i-message'
  | 'i-send'
  | 'i-mail'
  | 'i-phone'
  | 'i-camera'
  | 'i-mic'
  | 'i-image'
  | 'i-paperclip'
  // Domain
  | 'i-flame'
  | 'i-drop'
  | 'i-leaf'
  | 'i-bowl'
  | 'i-apple'
  | 'i-fish'
  | 'i-coffee'
  | 'i-egg'
  | 'i-dumbbell'
  | 'i-shoe'
  | 'i-heart'
  | 'i-pulse'
  | 'i-meditate'
  | 'i-bed'
  | 'i-moon'
  | 'i-sun'
  | 'i-target'
  | 'i-trophy'
  | 'i-zap'
  | 'i-sparkle'
  | 'i-clock'
  | 'i-calendar'
  | 'i-graph-up'
  | 'i-graph-down'
  | 'i-bars'
  | 'i-tag'
  | 'i-temp'
  // Devices
  | 'i-watch'
  | 'i-mobile'
  | 'i-link'
  | 'i-wifi'
  | 'i-database'
  | 'i-shield'
  | 'i-globe'
  | 'i-warning'
  // Social
  | 'i-google'
  | 'i-apple-logo';

interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size — use Brand Master sizes: 14, 16, 18, 22, 26 */
  size?: 14 | 16 | 18 | 22 | 26 | 32 | number;
  /** Accessible label — provide when icon conveys meaning without surrounding text */
  label?: string;
}

/**
 * Renders a single icon from the Trophē sprite.
 *
 * The SVG sprite must be inlined or served from /public/sprite.svg.
 * In Next.js App Router the sprite is served as a static file — no import needed.
 */
export function Icon({ name, size = 18, label, className = '', ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-label={label}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      {...rest}
    >
      <use href={`/sprite.svg#${name}`} />
    </svg>
  );
}

export default Icon;
