/**
 * Approved Ask Trophē icon family (translated from the AG2 final package `icons.js`).
 *
 * One deterministic 24px stroke set so the assistant surface stops mixing decorative glyph styles.
 * Geometry is local, stroke-only and inherits `currentColor`; every icon is decorative
 * (`aria-hidden`), so callers must keep a real text label or `aria-label` on the control.
 */
import type { ReactNode, SVGProps } from 'react';

export type AskTropheIconName =
  | 'mic' | 'micOff' | 'pause' | 'play' | 'output' | 'end' | 'plus'
  | 'send' | 'close' | 'history' | 'edit' | 'check' | 'more' | 'image';

const GEOMETRY: Record<AskTropheIconName, ReactNode> = {
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
  micOff: <><path d="M9 9V6a3 3 0 0 1 6 0v6M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M9 22h6M3 3l18 18" /></>,
  pause: <path d="M8 5v14M16 5v14" strokeWidth={3} />,
  play: <path d="m9 5 11 7-11 7Z" />,
  output: <path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />,
  end: <path d="M3 13c4-5 14-5 18 0v5h-5v-4a14 14 0 0 0-8 0v4H3Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M12 20V4M5 11l7-7 7 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  history: <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" />,
  edit: <path d="m4 16 12-12 4 4L8 20H4ZM13 7l4 4" />,
  check: <path d="m5 12 4 4L19 6" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-5 4 3 4-5 4 7" /></>,
};

export function AskTropheIcon({ name, size = 20, ...rest }: { name: AskTropheIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'>) {
  return <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >{GEOMETRY[name]}</svg>;
}
