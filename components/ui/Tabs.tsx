'use client';

import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface TabOption<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional badge count rendered after the label. */
  badge?: number | string;
  /** Id of the tabpanel this option controls, when the panel is rendered elsewhere. */
  panelId?: string;
}

interface TabsProps<T extends string> {
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
  const generatedId = useId();
  const idPrefix = `tabs-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const baseTab = size === 'compact' ? 'px-2 text-[12px]' : 'px-3 text-[12px]';

  function tabId(option: TabOption<T>) {
    return `${idPrefix}-tab-${option.id}`;
  }

  function selectAndFocus(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    document.getElementById(tabId(option))?.focus();
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
    <div className={`relative ${className}`}>
      <div
        className="scrollbar-hide flex gap-[3px] overflow-x-auto rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-[3px]"
        role="tablist"
        aria-orientation="horizontal"
      >
        {options.map((opt, index) => {
          const active = opt.id === value;
          const id = tabId(opt);
          return (
            <button
              key={opt.id}
              id={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={opt.panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(opt.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
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
                    'min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center rounded-full text-[10px]',
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
  );
}
