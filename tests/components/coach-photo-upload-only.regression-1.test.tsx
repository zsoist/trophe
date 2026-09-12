// @vitest-environment jsdom
//
// Regression: the private-attachment capability (`uploads.images`) is emitted by
// the server independently of the client photo-food action flag. The composer
// offers an "upload only" photo affordance in that configuration, but the Send
// path gated on `photoFoodEnabled` and silently discarded the selected photo.
// The two capability checks must agree so a user can always upload what the
// composer let them attach.
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

const id = crypto.randomUUID();
const attachmentId = crypto.randomUUID();
const ref = { id: attachmentId, kind: 'image' as const, status: 'available' as const };
const base = { version: 'coach-assistant.v2' as const, storage: 'private_storage' as const, analysis: 'not_connected' as const, ok: true };

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1');
  // The client photo-food UI flag is OFF: only the upload capability is available.
  vi.stubEnv('NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED', '0');
  URL.createObjectURL = vi.fn(() => 'blob:private-photo');
  URL.revokeObjectURL = vi.fn();
  vi.mocked(requestAttachment.operation).mockResolvedValue({ ...base, attachment: { ...ref, status: 'pending' }, uploadToken: 'a'.repeat(64), state: 'prepared' });
  vi.mocked(requestAttachment.upload).mockResolvedValue({ ...base, attachment: ref, state: 'available' });
  vi.mocked(requestConversation).mockImplementation(async request => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    attachments: request.attachments ?? [],
    // Server advertises private storage with uploads only (analysis not connected).
    uploads: { images: true, storage: 'private_storage', analysis: 'not_connected', limits: { count: 1, fileBytes: 8_000_000, totalBytes: 8_000_000, pixels: 16_000_000 } },
    evidence: [], output: { answer: 'Answer', limitations: [], evidenceRefs: [] },
  } as unknown as Awaited<ReturnType<typeof requestConversation>>));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

it('uploads the selected photo even when only the private-attachment capability is available', async () => {
  const create = vi.fn(async () => ({ id, title: 'What is this?', revision: '1', state: 'active' as const, createdAt: new Date().toISOString() }));
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} historyTransport={{ create, list: vi.fn(), read: vi.fn() }} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));

  // A first turn returns the private-attachment capability the composer relies on.
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Hello' } });
  fireEvent.submit(screen.getByRole('textbox', { name: 'Your question' }).closest('form')!);
  await screen.findByText('Answer');

  fireEvent.click(screen.getByLabelText('Photos'));
  fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files: [new File(['private'], 'meal.png', { type: 'image/png' })] } });
  await screen.findByText('meal.png');
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'What is this?' } });
  fireEvent.submit(screen.getByRole('textbox', { name: 'Your question' }).closest('form')!);

  await waitFor(() => expect(requestAttachment.upload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(requestConversation).toHaveBeenCalledTimes(2));
  expect(vi.mocked(requestConversation).mock.calls[1][0]).toMatchObject({ message: 'What is this?', attachments: [ref] });
});
