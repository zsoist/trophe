// @vitest-environment jsdom
import React, { useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttachmentController } from '@/components/assistant/attachment-state';
import { AttachmentPicker } from '@/components/assistant/AttachmentPicker';
import { I18nProvider } from '@/lib/i18n';

const conversation = '00000000-0000-4000-8000-000000000001';
const png = () => Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7n8AAAAASUVORK5CYII='), character => character.charCodeAt(0));
const file = () => new File([png()], 'food.png', { type: 'image/png' });
beforeEach(() => { URL.createObjectURL = vi.fn(() => 'blob:local-photo'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { cleanup(); });

/** The enlarged attachment preview is dismissed locally: close control, Escape and backdrop only. */
async function mountPreview() {
  const controller = new AttachmentController();
  await controller.select([file()]);
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const parentEscape = vi.fn();
  function View() {
    const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
    // Mirrors the surrounding Ask dialog, whose own Escape handler closes the whole conversation.
    return <div onKeyDown={event => { if (event.key === 'Escape') parentEscape(); }}>
      <form onSubmit={onSubmit}><AttachmentPicker controller={controller} state={state} conversationId={conversation} compact deferUpload maxPhotos={1} disabled={false} /></form>
    </div>;
  }
  const view = render(<I18nProvider defaultLang="en"><View /></I18nProvider>);
  const summary = screen.getByLabelText('Enlarge photo: food.png');
  const details = summary.closest('details')!;
  return { view, controller, onSubmit, parentEscape, summary, details };
}

it('closes an enlarged attachment with its own control and restores focus to the thumbnail', async () => {
  const { controller, onSubmit, summary, details } = await mountPreview();
  fireEvent.click(summary);
  expect(details.hasAttribute('open')).toBe(true);
  const close = screen.getByRole('button', { name: 'Close photo: food.png' });
  expect(document.activeElement).toBe(close);
  fireEvent.click(close);
  expect(details.hasAttribute('open')).toBe(false);
  expect(document.activeElement).toBe(summary);
  // The dismissal must not submit the composer or drop the selected attachment.
  expect(onSubmit).not.toHaveBeenCalled();
  expect(controller.snapshot().items).toHaveLength(1);
});

it('dismisses the enlarged attachment with Escape without closing the surrounding dialog', async () => {
  const { onSubmit, parentEscape, summary, details } = await mountPreview();
  fireEvent.click(summary);
  const close = screen.getByRole('button', { name: 'Close photo: food.png' });
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(details.hasAttribute('open')).toBe(false);
  expect(document.activeElement).toBe(summary);
  expect(onSubmit).not.toHaveBeenCalled();
  // The local dismissal consumes Escape: the surrounding dialog keeps the conversation open.
  expect(parentEscape).not.toHaveBeenCalled();
  // Keyboard users can reopen the same preview afterwards.
  fireEvent.click(summary);
  expect(details.hasAttribute('open')).toBe(true);
});

it('dismisses the enlarged attachment from the backdrop for touch and pointer users', async () => {
  const { summary, details } = await mountPreview();
  fireEvent.click(summary);
  const backdrop = details.querySelector('button[aria-hidden="true"]') as HTMLButtonElement;
  expect(backdrop).not.toBeNull();
  fireEvent.click(backdrop);
  expect(details.hasAttribute('open')).toBe(false);
  expect(document.activeElement).toBe(summary);
});
