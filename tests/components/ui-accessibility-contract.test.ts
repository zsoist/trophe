import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

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
});
