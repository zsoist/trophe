'use client';

import type { ReactNode } from 'react';

/**
 * Pill-tab group used everywhere in the app (food log view modes, coach
 * habits library filters, workout stats time ranges, etc.).
 *
 * Generic over the tab id type so a screen can model its own enum:
 *   <Tabs<MealView> value={view} onChange={setView} options={[...]} />
 */

export interface TabOption<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional badge count rendered after the label. */
  badge?: number | string;
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (id: T) => void;
  options: TabOption<T>[];
  className?: string;
  /** Compact tabs are 8px font/4px padding (used in dense coach views). */
  size?: 'compact' | 'default';
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className = '',
  size = 'default',
}: TabsProps<T>) {
  const baseTab =
    size === 'compact'
      ? 'px-2 py-1 text-[8px]'
      : 'px-3 py-1.5 text-[9px]';
  return (
    <div
      className={`flex gap-[3px] p-[3px] rounded-[10px] bg-[rgba(26,26,26,0.7)] border border-white/[0.06] ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 rounded-[7px] uppercase tracking-[0.05em] whitespace-nowrap font-medium transition-colors',
              baseTab,
              active
                ? 'bg-[rgba(212,168,83,0.12)] text-[var(--color-gold)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            ].join(' ')}
          >
            {opt.label}
            {opt.badge !== undefined && (
              <span
                className={[
                  'min-w-[14px] h-[14px] px-1 inline-flex items-center justify-center rounded-full text-[7px]',
                  active
                    ? 'bg-[var(--color-gold)] text-[#0a0a0a]'
                    : 'bg-white/[0.06] text-[var(--text-muted)]',
                ].join(' ')}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
