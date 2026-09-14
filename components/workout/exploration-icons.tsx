/**
 * Named light-weight SVG icons for the Workout V2 exploration surfaces.
 *
 * These are the same Phosphor-Light-style 1.5px stroke glyphs shipped in the
 * V2 reference package (`VISUAL-REFERENCE-V2/assets/icons/*.svg`), inlined here
 * so the exploration namespace needs no extra dependency install. They are
 * decorative (`aria-hidden`) — the consumer owns the accessible label.
 */

import type { SVGProps } from 'react';

type LightIconProps = SVGProps<SVGSVGElement> & { size?: number };

function LightIcon({ size = 22, children, ...props }: LightIconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={12}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconMagnifier(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <circle cx="116" cy="116" r="74" />
      <line x1="170" y1="170" x2="222" y2="222" />
    </LightIcon>
  );
}

export function IconArrowLeft(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <line x1="216" y1="128" x2="40" y2="128" />
      <polyline points="112,56 40,128 112,200" />
    </LightIcon>
  );
}

export function IconPlus(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <line x1="128" y1="40" x2="128" y2="216" />
      <line x1="40" y1="128" x2="216" y2="128" />
    </LightIcon>
  );
}

export function IconMinus(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <line x1="40" y1="128" x2="216" y2="128" />
    </LightIcon>
  );
}

export function IconReset(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <polyline points="64,96 64,40 120,40" />
      <path d="M68,180a84,84,0,1,0,6.7-95.3L64,96" />
    </LightIcon>
  );
}

export function IconCheck(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <polyline points="40,136 96,192 216,72" />
    </LightIcon>
  );
}

export function IconPlay(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <polygon points="76,40 208,128 76,216" />
    </LightIcon>
  );
}

export function IconPause(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <line x1="96" y1="48" x2="96" y2="208" />
      <line x1="160" y1="48" x2="160" y2="208" />
    </LightIcon>
  );
}

export function IconClose(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <line x1="56" y1="56" x2="200" y2="200" />
      <line x1="200" y1="56" x2="56" y2="200" />
    </LightIcon>
  );
}

export function IconCaretDown(props: LightIconProps) {
  return (
    <LightIcon {...props}>
      <polyline points="48,96 128,176 208,96" />
    </LightIcon>
  );
}
