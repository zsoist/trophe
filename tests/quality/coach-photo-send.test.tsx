// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import { requestConversation } from '@/components/assistant/client';
import { requestAttachment } from '@/components/assistant/attachment-client';
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/log' }));
vi.mock('@/components/assistant/image-preflight', () => ({ preflightImage: vi.fn(async () => {}) }));
vi.mock('@/components/assistant/client', () => ({ requestConversation: vi.fn() }));
vi.mock('@/components/assistant/attachment-client', () => ({ requestAttachment: { operation: vi.fn(), upload: vi.fn() } }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
const id = crypto.randomUUID(); const attachmentId = crypto.randomUUID();
const ref = { id: attachmentId, kind: 'image' as const, status: 'available' as const };
const base = { version: 'coach-assistant.v2' as const, storage: 'private_storage' as const, analysis: 'not_connected' as const, ok: true };
beforeEach(() => {
 vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1'); vi.stubEnv('NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED', '1');
 URL.createObjectURL = vi.fn(() => 'blob:private-photo'); URL.revokeObjectURL = vi.fn();
 vi.mocked(requestAttachment.operation).mockResolvedValue({ ...base, attachment: { ...ref, status: 'pending' }, uploadToken: 'a'.repeat(64), state: 'prepared' });
 vi.mocked(requestAttachment.upload).mockResolvedValue({ ...base, attachment: ref, state: 'available' });
 vi.mocked(requestConversation).mockImplementation(async request => ({ version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, attachments: [ref], evidence: [], output: { answer: 'Photo answer', limitations: [], evidenceRefs: [] } } as unknown as Awaited<ReturnType<typeof requestConversation>>));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
async function setup() {
 const create = vi.fn(async () => ({ id, title: 'What is this?', revision: '1', state: 'active' as const, createdAt: new Date().toISOString() }));
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} historyTransport={{ create, list: vi.fn(), read: vi.fn() }} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 fireEvent.click(screen.getByLabelText('Photos'));
 expect(screen.getByText('One photo per message.')).toBeTruthy();
 expect(screen.getByLabelText('Choose photos').hasAttribute('multiple')).toBe(false);
 fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files: [new File(['private'], 'meal.png', { type: 'image/png' })] } });
 await screen.findByText('meal.png');
 fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'What is this?' } });
 return create;
}
it('selects locally and uploads to one canonical thread only on deliberate Send', async () => {
 const create = await setup();
 expect(create).not.toHaveBeenCalled(); expect(requestAttachment.upload).not.toHaveBeenCalled(); expect(requestConversation).not.toHaveBeenCalled();
 expect(screen.queryByRole('button', { name: 'Review upload' })).toBeNull();
 const form = screen.getByRole('textbox', { name: 'Your question' }).closest('form')!;
 fireEvent.submit(form); fireEvent.submit(form);
 await screen.findByText('Photo answer');
 expect(create).toHaveBeenCalledTimes(1); expect(requestAttachment.upload).toHaveBeenCalledTimes(1); expect(requestConversation).toHaveBeenCalledTimes(1);
 expect(requestConversation).toHaveBeenCalledWith(expect.objectContaining({ conversationId: id, message: 'What is this?', attachments: [ref] }), expect.any(AbortSignal));
});
it('does not generate a text fallback when upload fails and keeps draft and preview', async () => {
 vi.mocked(requestAttachment.upload).mockRejectedValue(new Error('lost upload'));
 await setup(); fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
 await waitFor(() => expect(requestAttachment.upload).toHaveBeenCalledTimes(1));
 await waitFor(() => expect(screen.getByRole('button', { name: 'Send question' }).hasAttribute('disabled')).toBe(false));
 expect(requestConversation).not.toHaveBeenCalled();
 expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('What is this?');
 expect(screen.getByText('meal.png')).toBeTruthy();
});
