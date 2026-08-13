'use client';

import type { KeyboardEvent, ReactNode } from 'react';

export interface TabOption<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional badge count rendered after the label. */
  badge?: number | string;
  /** Recommended id of the externally rendered tabpanel controlled by this tab. */
  panelId?: string;
}

export interface TabsProps<T extends string> {
  value: T;
  onChange: (id: T) => void;
  options: TabOption<T>[];
  className?: string;
  /** Compact only adjusts horizontal padding; every target remains 44px tall. */
  size?: 'compact' | 'default';
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className = '',
  size = 'default',
}: TabsProps<T>) {
  const baseTab = size === 'compact' ? 'px-2 text-[12px]' : 'px-3 text-[12px]';
  const usesTabSemantics = options.length > 0 && options.every((option) => option.panelId);

  function selectAndFocus(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    document.getElementById(`${option.panelId}-tab`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % options.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + options.length) % options.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = options.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectAndFocus(nextIndex);
  }

  return (
    <div className={className}>
      <div className="relative">
        <div
          className="scrollbar-hide flex gap-[3px] overflow-x-auto rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-[3px]"
          role={usesTabSemantics ? 'tablist' : 'group'}
          aria-orientation={usesTabSemantics ? 'horizontal' : undefined}
        >
          {options.map((opt, index) => {
            const active = opt.id === value;
            return (
              <button
                key={opt.id}
                id={usesTabSemantics ? `${opt.panelId}-tab` : undefined}
                type="button"
                role={usesTabSemantics ? 'tab' : undefined}
                aria-selected={usesTabSemantics ? active : undefined}
                aria-controls={usesTabSemantics ? opt.panelId : undefined}
                aria-pressed={usesTabSemantics ? undefined : active}
                tabIndex={usesTabSemantics ? (active ? 0 : -1) : undefined}
                onClick={() => onChange(opt.id)}
                onKeyDown={usesTabSemantics ? (event) => onKeyDown(event, index) : undefined}
                className={[
                  'min-h-11 flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-[7px] uppercase tracking-[0.05em] whitespace-nowrap font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  baseTab,
                  active
                    ? 'bg-[var(--action-secondary)] text-[var(--content-primary)]'
                    : 'text-[var(--content-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-secondary)]',
                ].join(' ')}
              >
                {opt.label}
                {opt.badge !== undefined && (
                  <span
                    className={[
                      'min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center rounded-full text-xs',
                      active
                        ? 'bg-[var(--action-primary)] text-[var(--action-on-primary)]'
                        : 'bg-[var(--surface-3)] text-[var(--content-muted)]',
                    ].join(' ')}
                  >
                    {opt.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--surface-2)] to-transparent"
        />
      </div>
    </div>
  );
}
