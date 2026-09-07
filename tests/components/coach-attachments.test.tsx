// @vitest-environment jsdom
import React, { useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttachmentController, type AttachmentTransport } from '@/components/assistant/attachment-state';
import { AttachmentPicker } from '@/components/assistant/AttachmentPicker';
import { ConversationController } from '@/components/assistant/conversation-state';
import { I18nProvider } from '@/lib/i18n';
import type { CoachAttachmentResult, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
const conversation = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const base = { version: 'coach-assistant.v2', ok: true, storage: 'isolated_ephemeral', analysis: 'not_connected' } as const;
const ready: CoachAttachmentResult = { ...base, state: 'available', attachment: { id, kind: 'image', status: 'available' } };
function transport(): AttachmentTransport {
  return { operation: vi.fn(async input => input.operation === 'attachment.prepare' ? { ...base, state: 'prepared', attachment: { id, kind: 'image', status: 'pending' }, uploadToken: 'a'.repeat(64) } : input.operation === 'attachment.remove' ? { ...base, state: 'removed' } : ready), upload: vi.fn(async () => ready) };
}
const png = () => Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7n8AAAAASUVORK5CYII='), character => character.charCodeAt(0));
const file = () => new File([png()], 'food.png', { type: 'image/png' });
beforeEach(() => { URL.createObjectURL = vi.fn(() => 'blob:local-photo'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('requires review before upload and removal, and labels upload separately from analysis', async () => {
  const controller = new AttachmentController(), port = transport();
  function View() { const state = useSyncExternalStore(controller.subscribe, controller.snapshot); return <AttachmentPicker controller={controller} state={state} conversationId={conversation} transport={port} disabled={false} />; }
  render(<I18nProvider defaultLang="en"><View /></I18nProvider>);
  fireEvent.click(screen.getByText('Photos'));
  fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files: [file()] } });
  expect(port.operation).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Review upload' }));
  expect(port.operation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Uploaded · not analyzed');
  expect(controller.references()).toEqual([ready.attachment]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  expect(controller.snapshot().items).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await vi.waitFor(() => expect(controller.snapshot().items).toHaveLength(0));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-photo');
  expect(port.operation).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'attachment.remove', attachmentId: id, reviewed: true }), expect.any(AbortSignal));
});

it('queries an uncertain upload using its original reservation without preparing or uploading twice', async () => {
  const controller = new AttachmentController(), port = transport();
  port.upload = vi.fn(async () => { throw new Error('Lost after upload'); });
  await controller.select([file()]); const key = controller.snapshot().items[0].key;
  await controller.upload(key, conversation, port);
  expect(controller.references()).toEqual([]);
  expect(controller.snapshot().items[0].state).toBe('uncertain');
  await controller.upload(key, conversation, port);
  expect(port.upload).toHaveBeenCalledTimes(1);
  await controller.check(key, conversation, port);
  expect(port.operation).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'attachment.status', attachmentId: id, conversationId: conversation }), expect.any(AbortSignal));
  expect(controller.references()).toEqual([ready.attachment]);
  controller.reconcile([{ id, kind: 'image', status: 'unauthorized' }]);
  expect(controller.references()).toEqual([]);
});

it('drops late uploads and object URLs on identity reset', async () => {
  const controller = new AttachmentController(), port = transport(); let resolve!: (result: CoachAttachmentResult) => void;
  port.upload = vi.fn(() => new Promise(done => { resolve = done; }));
  await controller.select([file()]); const key = controller.snapshot().items[0].key;
  const pending = controller.upload(key, conversation, port);
  await vi.waitFor(() => expect(port.upload).toHaveBeenCalledTimes(1));
  controller.reset(); resolve(ready); await pending;
  expect(controller.snapshot()).toEqual({ items: [], pending: false, error: null });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-photo');
});

it('rejects wrong types and oversized batches before retaining URLs or sending any bytes', async () => {
  const controller = new AttachmentController();
  await controller.select([new File(['text'], 'script.svg', { type: 'image/svg+xml' })]);
  expect(controller.snapshot().error).toBe('type');
  await controller.select([file(), file(), file(), file()]);
  expect(controller.snapshot().error).toBe('limit');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(controller.snapshot().items).toEqual([]);
});

it('freezes opaque image references on each submitted turn', async () => {
  const controller = new ConversationController(); controller.identify('owner'); controller.setDraft('My food');
  const references = [{ id, kind: 'image' as const, status: 'available' as const }];
  await controller.send({ surface: 'food', includeScreen: true }, async request => ({ version: 'coach-assistant.v2', ok: true, conversationId: request.conversationId, turnId: request.turnId } as CoachConversationResponse), references);
  references[0].id = 'different';
  expect(controller.snapshot().turns[0].request.attachments).toEqual([ready.attachment]);
});

it('rejects renamed non-images and tiny files declaring more than 16 MP before any object URL', async () => {
  const controller = new AttachmentController();
  await controller.select([new File(['not an image'], 'fake.png', { type: 'image/png' })]);
  expect(controller.snapshot().error).toBe('type');
  const bytes = png(); const view = new DataView(bytes.buffer); view.setUint32(16, 5000); view.setUint32(20, 5000);
  await controller.select([new File([bytes], 'huge.png', { type: 'image/png' })]);
  expect(controller.snapshot().error).toBe('limit');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
