// @vitest-environment jsdom

import React, { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MessagePanel } from '@/components/assistant/MessagePanel';
import {
  MessageController,
  type MessageTransport,
} from '@/components/assistant/message-state';
import { I18nProvider } from '@/lib/i18n';

const ids = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  coachId: '22222222-2222-4222-8222-222222222222',
  proposalId: '33333333-3333-4333-8333-333333333333',
  receiptId: '44444444-4444-4444-8444-444444444444',
  messageId: '55555555-5555-4555-8555-555555555555',
};

const recipient = { coachId: ids.coachId, name: 'Coach Ana', version: 'recipient-v1' };
const proposal = {
  id: ids.proposalId,
  hash: 'a'.repeat(64),
  action: 'chat.message.send' as const,
  recipient,
  after: { message: 'Can we review my plan tomorrow?' },
  expiresAt: '2099-09-08T12:00:00.000Z',
  reviewRequired: true as const,
};

afterEach(cleanup);

function Harness({ controller, transport }: { controller: MessageController; transport: MessageTransport }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  return <I18nProvider defaultLang="en"><MessagePanel controller={controller} state={state} transport={transport} /></I18nProvider>;
}

it('keeps the draft editable, invalidates review on edit, and sends only the re-reviewed exact text', async () => {
  const controller = new MessageController();
  const transport = vi.fn<MessageTransport>(async operation => {
    if (operation.operation === 'message.recipient') return { ok: true, recipient };
    if (operation.operation === 'message.propose') return {
      ok: true,
      proposal: { ...proposal, after: operation.after },
    };
    return {
      ok: true,
      receipt: {
        id: ids.receiptId,
        actionId: operation.actionId,
        proposalId: ids.proposalId,
        messageId: ids.messageId,
        coachId: ids.coachId,
        status: 'stored',
        recordedAt: '2026-09-08T12:01:00.000Z',
      },
      refresh: { coachId: ids.coachId, clientId: ids.conversationId, strategy: 'refetch' },
    };
  });

  render(<Harness controller={controller} transport={transport} />);
  await act(() => controller.activate('b'.repeat(64), ids.conversationId, proposal.after.message, transport));

  expect(screen.getByText('Coach Ana')).toBeTruthy();
  const draft = screen.getByRole('textbox', { name: 'Message to your coach' });
  expect((draft as HTMLTextAreaElement).value).toBe(proposal.after.message);
  fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
  expect(await screen.findByRole('button', { name: 'Send to your coach' })).toBeTruthy();

  fireEvent.change(draft, { target: { value: 'Can we review my plan on Friday?' } });
  expect(screen.queryByRole('button', { name: 'Send to your coach' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
  expect(await screen.findByText('Can we review my plan on Friday?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Send to your coach' }));
  expect(await screen.findByText('Saved in your chat')).toBeTruthy();

  const proposeCalls = transport.mock.calls.filter(([operation]) => operation.operation === 'message.propose');
  expect(proposeCalls).toHaveLength(2);
  expect(proposeCalls[1][0]).toMatchObject({ after: { message: 'Can we review my plan on Friday?' } });
  const apply = transport.mock.calls.find(([operation]) => operation.operation === 'message.apply')?.[0];
  expect(apply).toMatchObject({ proposalId: ids.proposalId, hash: 'a'.repeat(64), reviewed: true });
});

it('keeps an uncertain action and checks the same actionId without applying again', async () => {
  const controller = new MessageController();
  let actionId = '';
  const transport = vi.fn<MessageTransport>(async operation => {
    if (operation.operation === 'message.recipient') return { ok: true, recipient };
    if (operation.operation === 'message.propose') return { ok: true, proposal };
    if (operation.operation === 'message.apply') {
      actionId = operation.actionId;
      throw new Error('response lost after dispatch');
    }
    return { ok: false, error: 'not_found' };
  });

  render(<Harness controller={controller} transport={transport} />);
  await act(() => controller.activate('c'.repeat(64), ids.conversationId, proposal.after.message, transport));
  fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Send to your coach' }));
  expect(await screen.findByRole('button', { name: 'Check send status' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Check send status' }));

  await vi.waitFor(() => expect(transport.mock.calls.filter(([operation]) => operation.operation === 'message.receipt')).toHaveLength(1));
  expect(transport.mock.calls.filter(([operation]) => operation.operation === 'message.apply')).toHaveLength(1);
  expect(transport.mock.calls.find(([operation]) => operation.operation === 'message.receipt')?.[0]).toMatchObject({ actionId });
  expect(screen.getByRole('button', { name: 'Check send status' })).toBeTruthy();
  expect(screen.queryByText('Saved in your chat')).toBeNull();
});

it('discards an unconfirmed review when the conversation changes', async () => {
  const controller = new MessageController();
  const transport = vi.fn<MessageTransport>(async operation => operation.operation === 'message.recipient'
    ? { ok: true, recipient }
    : { ok: true, proposal });

  await controller.activate('d'.repeat(64), ids.conversationId, proposal.after.message, transport);
  await controller.propose(transport);
  expect(controller.snapshot().proposal).toBeTruthy();
  controller.moveConversation('66666666-6666-4666-8666-666666666666');
  expect(controller.snapshot()).toMatchObject({ proposal: null, receipt: null, uncertain: false });
  await controller.apply(transport);
  expect(transport.mock.calls.filter(([operation]) => operation.operation === 'message.apply')).toHaveLength(0);
});

it('adopts a server-prepared proposal without resolving or proposing it again', () => {
  const controller = new MessageController();
  expect(controller.adopt('e'.repeat(64), ids.conversationId, proposal)).toBe(true);
  expect(controller.snapshot()).toMatchObject({
    intentId: 'e'.repeat(64), draft: proposal.after.message, recipient, proposal,
  });
});

it('does not accept a receipt refresh bound to another client', async () => {
  const controller = new MessageController();
  const clientId = '66666666-6666-4666-8666-666666666666';
  controller.adopt('f'.repeat(64), ids.conversationId, proposal, clientId);
  const transport = vi.fn<MessageTransport>(async operation => {
    if (operation.operation !== 'message.apply') return { ok: false, error: 'invalid_input' };
    return { ok: true,
      receipt: { id: ids.receiptId, actionId: operation.actionId, proposalId: ids.proposalId, messageId: ids.messageId, coachId: ids.coachId, status: 'stored', recordedAt: '2026-09-08T12:01:00.000Z' },
      refresh: { coachId: ids.coachId, clientId: '77777777-7777-4777-8777-777777777777', strategy: 'refetch' },
    };
  });
  await controller.apply(transport);
  expect(controller.snapshot()).toMatchObject({ receipt: null, uncertain: true, error: 'invalid_receipt' });
});

it('refreshes a stale recipient and requires a new review before applying to a reassigned coach', async () => {
  const controller = new MessageController();
  const reassigned = {
    coachId: '77777777-7777-4777-8777-777777777777',
    name: 'Coach Bea',
    version: 'recipient-v2',
  };
  let recipientReads = 0;
  const transport = vi.fn<MessageTransport>(async operation => {
    if (operation.operation === 'message.apply') return { ok: false, error: 'version_conflict' };
    if (operation.operation === 'message.recipient') {
      recipientReads += 1;
      return { ok: true, recipient: reassigned };
    }
    if (operation.operation === 'message.propose') return {
      ok: true,
      proposal: { ...proposal, id: crypto.randomUUID(), hash: 'b'.repeat(64), recipient: reassigned, after: operation.after },
    };
    return { ok: false, error: 'invalid_input' };
  });

  render(<Harness controller={controller} transport={transport} />);
  act(() => { controller.adopt('1'.repeat(64), ids.conversationId, proposal, ids.conversationId); });
  fireEvent.click(screen.getByRole('button', { name: 'Send to your coach' }));
  expect(await screen.findByRole('button', { name: 'Refresh recipient' })).toBeTruthy();
  expect(controller.snapshot()).toMatchObject({
    draft: proposal.after.message,
    recipient: null,
    proposal: null,
    error: 'version_conflict',
  });
  expect(transport.mock.calls.filter(([operation]) => operation.operation === 'message.apply')).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: 'Refresh recipient' }));
  expect(await screen.findByText('Coach Bea')).toBeTruthy();
  expect(recipientReads).toBe(1);
  expect(screen.queryByRole('button', { name: 'Send to your coach' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
  expect(await screen.findByRole('button', { name: 'Send to your coach' })).toBeTruthy();
  const repropose = transport.mock.calls.find(([operation]) => operation.operation === 'message.propose')?.[0];
  expect(repropose).toMatchObject({ coachId: reassigned.coachId, resourceVersion: reassigned.version, after: proposal.after });
});

it('does not revive an old review after a same-coach ABA change', async () => {
  const controller = new MessageController();
  const refreshed = { ...recipient, name: 'Coach Ana Updated', version: 'recipient-v3' };
  const transport = vi.fn<MessageTransport>(async operation => {
    if (operation.operation === 'message.apply') return { ok: false, error: 'version_conflict' };
    if (operation.operation === 'message.recipient') return { ok: true, recipient: refreshed };
    if (operation.operation === 'message.propose') return {
      ok: true,
      proposal: { ...proposal, id: crypto.randomUUID(), hash: 'c'.repeat(64), recipient: refreshed, after: operation.after },
    };
    return { ok: false, error: 'invalid_input' };
  });

  controller.adopt('2'.repeat(64), ids.conversationId, proposal, ids.conversationId);
  await controller.apply(transport);
  expect(controller.snapshot()).toMatchObject({ draft: proposal.after.message, recipient: null, proposal: null });
  await controller.refreshRecipient(transport);
  expect(controller.snapshot()).toMatchObject({ recipient: refreshed, proposal: null });
  await controller.propose(transport);
  expect(controller.snapshot().proposal).toMatchObject({ recipient: refreshed, after: proposal.after });
  expect(transport.mock.calls.map(([operation]) => operation.operation)).toEqual([
    'message.apply',
    'message.recipient',
    'message.propose',
  ]);
});
