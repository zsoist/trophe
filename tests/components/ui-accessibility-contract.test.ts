// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Tabs } from '@/components/ui/Tabs';
import type { TabOption } from '@/components/ui/Tabs';

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

type LegacyView = 'overview' | 'activity';

// This fixture intentionally uses the original public option shape. `npm run
// typecheck` guards its source compatibility while the DOM test below guards
// the corresponding runtime semantics.
const legacyOptions: TabOption<LegacyView>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity', badge: 2 },
];

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

  it('links every explicit tab to one external panel and activates it with roving keyboard focus', () => {
    const options = [
      { id: 'overview', label: 'Overview', panelId: 'overview-panel' },
      { id: 'activity', label: 'Activity', panelId: 'activity-panel' },
      { id: 'notes', label: 'Notes', panelId: 'notes-panel' },
    ] as const;

    function LinkedTabs() {
      const [value, setValue] = React.useState<(typeof options)[number]['id']>('overview');

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(Tabs, {
          value,
          onChange: (nextValue) => setValue(nextValue as (typeof options)[number]['id']),
          options: [...options],
        }),
        ...options.map(({ label, panelId }) => React.createElement(
          'div',
          { key: panelId, id: panelId, role: 'tabpanel', 'aria-labelledby': `${panelId}-tab` },
          `${label} content`,
        )),
      );
    }

    render(React.createElement(LinkedTabs));

    const tabs = screen.getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(tabs).toHaveLength(3);
    expect(panels).toHaveLength(3);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(new Set(panels.map((panel) => panel.id)).size).toBe(3);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    tabs.forEach((tab) => {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    });
    const documentIds = Array.from(document.querySelectorAll<HTMLElement>('[id]'), (element) => element.id);
    expect(new Set(documentIds).size).toBe(documentIds.length);

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);

    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
  });

  it('keeps legacy options as pressed buttons without false tab or panel claims', () => {
    const onChange = vi.fn();
    render(React.createElement(Tabs, {
      value: 'overview',
      onChange,
      options: legacyOptions,
    }));

    const buttons = screen.getAllByRole('button');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('group')).toBeTruthy();
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(buttons.every((button) => !button.hasAttribute('aria-controls'))).toBe(true);
    expect(buttons.every((button) => !button.hasAttribute('aria-selected'))).toBe(true);
    expect(buttons.every((button) => !button.hasAttribute('id'))).toBe(true);
    expect(screen.queryAllByRole('tabpanel', { hidden: true })).toHaveLength(0);

    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith('activity');
  });

  it('uses segmented-control semantics for the whole set when any option lacks a panel target', () => {
    render(React.createElement(Tabs, {
      value: 'overview',
      onChange: vi.fn(),
      options: [
        { id: 'overview', label: 'Overview', panelId: 'overview-panel' },
        { id: 'activity', label: 'Activity' },
      ],
    }));

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(document.querySelectorAll('[aria-controls]')).toHaveLength(0);
    expect(document.querySelectorAll('[id]')).toHaveLength(0);
    expect(screen.queryAllByRole('tabpanel', { hidden: true })).toHaveLength(0);
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

  it('submits an async confirmation once per settlement and permits retry after rejection', async () => {
    let rejectFirst!: (reason: Error) => void;
    const onConfirm = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce(undefined);
    render(React.createElement(ConfirmSheet, {
      open: true,
      title: 'Remove Bench Press',
      onConfirm,
      onCancel: vi.fn(),
    }));

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm.hasAttribute('disabled')).toBe(true);

    rejectFirst(new Error('offline'));
    await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });
});
