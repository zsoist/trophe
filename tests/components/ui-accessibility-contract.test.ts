// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Tabs } from '@/components/ui/Tabs';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const motionProps = new Set(['animate', 'exit', 'initial', 'transition']);
  const MotionDiv = ReactModule.forwardRef<HTMLDivElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(
      'div',
      { ...Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key))), ref },
      children as React.ReactNode,
    ),
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: MotionDiv },
    useReducedMotion: () => true,
  };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({ 'confirm.cancel': 'Cancel', 'confirm.confirm': 'Confirm' })[key] ?? key,
  }),
}));

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('accessible UI primitive contract', () => {
  it('exposes semantic button variants and touch-safe button primitives', () => {
    const buttonSource = source('components/ui/Button.tsx');

    expect(buttonSource).toContain("variant?: 'primary' | 'secondary' | 'ghost' | 'danger'");
    expect(buttonSource).toContain('min-h-11');
    expect(buttonSource).toContain('min-w-11');
    expect(buttonSource).toContain('type IconButtonProps');
  });

  it('uses semantic card surfaces', () => {
    const cardSource = source('components/ui/Card.tsx');

    expect(cardSource).toContain('var(--surface-1)');
  });

  it('provides keyboard-operable tabs with touch-safe targets', () => {
    const tabsSource = source('components/ui/Tabs.tsx');

    expect(tabsSource).toContain('aria-controls');
    expect(tabsSource).toContain('onKeyDown');
    expect(tabsSource).toContain('min-h-11');
  });

  it('keeps confirmations labelled, dismissible by Escape, and focus-safe', () => {
    const sheetSource = source('components/ui/ConfirmSheet.tsx');

    expect(sheetSource).toContain('aria-labelledby');
    expect(sheetSource).toContain('aria-describedby');
    expect(sheetSource).toContain("event.key === 'Escape'");
    expect(sheetSource).toContain('dialogRef.current?.focus()');
    expect(sheetSource).toContain('activeElement?.focus()');
  });

  it('makes the new primitives available from the public UI barrel', () => {
    const indexSource = source('components/ui/index.ts');

    expect(indexSource).toContain('Button');
    expect(indexSource).toContain('IconButton');
  });

  it('links every tab to a panel and moves selection and focus with keyboard navigation', () => {
    const onChange = vi.fn();
    render(React.createElement(Tabs, {
      value: 'overview',
      onChange,
      options: [
        { id: 'overview', label: 'Overview', panel: 'Overview content' },
        { id: 'activity', label: 'Activity', panel: 'Activity content' },
        { id: 'notes', label: 'Notes', panel: 'Notes content' },
      ],
    }));

    const tabs = screen.getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(tabs).toHaveLength(3);
    expect(panels).toHaveLength(3);
    expect(tabs[0].getAttribute('aria-controls')).toBe(panels[0].id);

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('activity');
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('notes');
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('overview');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('keeps focus in an open confirmation sheet and returns it after Escape', () => {
    const onCancel = vi.fn();
    const opener = document.createElement('button');
    opener.textContent = 'Open confirmation';
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(React.createElement(
      React.Fragment,
      null,
      React.createElement('button', { type: 'button' }, 'Background action'),
      React.createElement(ConfirmSheet, {
        open: true,
        title: 'Delete item',
        message: 'This cannot be undone.',
        onConfirm: vi.fn(),
        onCancel,
      }),
    ));

    const dialog = screen.getByRole('alertdialog');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(React.createElement(ConfirmSheet, {
      open: false,
      title: 'Delete item',
      onConfirm: vi.fn(),
      onCancel,
    }));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
