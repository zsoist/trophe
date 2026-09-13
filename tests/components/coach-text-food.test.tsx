// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n';
import { TextFoodReview, TextFoodRecoveryNotice } from '@/components/assistant/TextFoodReview';
import type { TextFoodTransport } from '@/components/assistant/text-food-client';
import type { TextFoodDraft, TextFoodProposal, TextFoodReceipt } from '@/agents/coach-assistant/text-food-contract';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const draft: TextFoodDraft = { kind: 'parsed', id: id(1), hash: 'a'.repeat(64), action: 'food.text.create', rawText: '100g rice', items: [{ raw_text: '100g rice', food_name: 'Rice', name_localized: 'Rice', quantity: 100, unit: 'g', grams: 100, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4, sugar_g: 0, confidence: 0.9, source: 'ai_estimate' }], clarification: null, warnings: [], expiresAt: '2099-09-12T23:00:00Z' };
afterEach(()=>{cleanup();window.sessionStorage.clear();});
function fixture(lost = false, rawText = draft.rawText) {
  let proposal: TextFoodProposal | null = null, receipt: TextFoodReceipt | null = null;
  const transport = vi.fn<TextFoodTransport>(async operation => {
    if (operation.operation === 'text.food.propose') { proposal = { kind: 'review', id: id(2), hash: 'b'.repeat(64), action: 'food.text.create', draftId: draft.id, draftHash: draft.hash, after: operation.after, items: [{ ...draft.items[0], grams: operation.after.items[0].grams, calories: 195 }], entryIds: [id(3)], expiresAt: draft.expiresAt, reviewRequired: true }; return { ok: true, proposal }; }
    if (operation.operation === 'text.food.apply') { receipt = { actionId: operation.actionId, proposalId: operation.proposalId, hash: operation.hash, entryIds: proposal!.entryIds, loggedDate: proposal!.after.loggedDate, recordedAt: '2026-09-12T23:00:00Z', status: 'applied' }; if (lost) throw Error('response lost'); return { ok: true, receipt, refresh: 'refetch' }; }
    if (operation.operation === 'text.food.receipt' && receipt) return { ok: true, receipt, refresh: 'refetch' };
    return { ok: false, error: 'not_found' };
  });
  const onReceipt = vi.fn();
  render(<I18nProvider defaultLang="en"><TextFoodReview draft={{ ...draft, rawText }} conversationId={id(4)} transport={transport} onReceipt={onReceipt} /></I18nProvider>);
  return { transport, onReceipt };
}
describe('text Food functional review controls', () => {
  it.each(['I ate 90 g banana for dinner today.', 'Cené 90 g de banana hoy.'])('preselects an explicit dinner without writing: %s', async rawText => {
    const f = fixture(false, rawText);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('dinner');
    expect(f.transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review food entry' }));
    await screen.findByRole('button', { name: 'Confirm and save food' });
    expect(f.transport.mock.calls[0][0]).toMatchObject({ operation: 'text.food.propose', after: { mealType: 'dinner' } });
  });
  it('retains a user-edited meal through review and lost-receipt recovery', async () => {
    const f = fixture(true, 'I ate 90 g banana for dinner today.');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'snack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review food entry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('snack');
    fireEvent.click(await screen.findByRole('button', { name: /Check/ }));
    await waitFor(() => expect(f.onReceipt).toHaveBeenCalledTimes(1));
    expect(f.transport.mock.calls[0][0]).toMatchObject({ after: { mealType: 'snack' } });
    expect(f.transport.mock.calls.filter(([op]) => op.operation === 'text.food.apply')).toHaveLength(1);
  });
  it('reopens an acknowledged receipt without offering another save or stale portions', () => {
    const transport = vi.fn();
    const receipt: TextFoodReceipt = { actionId: id(5), proposalId: id(2), hash: 'b'.repeat(64), entryIds: [id(3)], loggedDate: '2026-09-12', recordedAt: '2026-09-12T23:00:00Z', status: 'applied' };
    render(<I18nProvider defaultLang="en"><TextFoodReview draft={draft} conversationId={id(4)} savedReceipt={receipt} transport={transport} onReceipt={vi.fn()} /></I18nProvider>);
    expect(screen.getByText('Meal saved. Your food log is refreshing.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review food entry' })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  it('does not write on render or portion edit; review precedes explicit confirmation', async () => {
    const f = fixture(); expect(f.transport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '150' } }); expect(f.transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review food entry' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm and save food' });
    expect(f.transport.mock.calls.map(([operation]) => operation.operation)).toEqual(['text.food.propose']);
    expect(screen.getByText(/195 kcal/)).toBeTruthy(); fireEvent.click(confirm);
    await waitFor(() => expect(f.onReceipt).toHaveBeenCalledTimes(1));
    expect(f.transport.mock.calls.map(([operation]) => operation.operation)).toEqual(['text.food.propose', 'text.food.apply']);
  });
  it('invalidates the proposal when portion changes after review', async () => {
    const f = fixture(); fireEvent.click(screen.getByRole('button', { name: 'Review food entry' })); await screen.findByRole('button', { name: 'Confirm and save food' });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '200' } });
    expect(screen.queryByRole('button', { name: 'Confirm and save food' })).toBeNull(); expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it('recovers a lost apply by receipt and never dispatches a second apply', async () => {
    const f = fixture(true); fireEvent.click(screen.getByRole('button', { name: 'Review food entry' })); fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
    const check = await screen.findByRole('button', { name: /Check/ }); fireEvent.click(check);
    await waitFor(() => expect(f.onReceipt).toHaveBeenCalledTimes(1));
    expect(f.transport.mock.calls.filter(([operation]) => operation.operation === 'text.food.apply')).toHaveLength(1);
    const apply = f.transport.mock.calls.find(([operation]) => operation.operation === 'text.food.apply')![0];
    const recovery = f.transport.mock.calls.find(([operation]) => operation.operation === 'text.food.receipt')![0];
    expect('actionId' in recovery && recovery.actionId).toBe('actionId' in apply && apply.actionId);
  });
  it('recovers after remount using only stored request identifiers and never replays apply', async () => {
    const f = fixture(true); fireEvent.click(screen.getByRole('button', { name: 'Review food entry' })); fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
    await screen.findByRole('button', { name: /Check/ });
    expect(window.sessionStorage.getItem(`trophe:text-food:pending:${id(4)}`)).not.toContain('Rice');
    cleanup();
    render(<I18nProvider defaultLang="en"><TextFoodRecoveryNotice conversationId={id(4)} transport={f.transport} onReceipt={f.onReceipt}/></I18nProvider>);
    fireEvent.click(screen.getByRole('button',{name:/Check/}));await waitFor(()=>expect(f.onReceipt).toHaveBeenCalledTimes(1));
    expect(f.transport.mock.calls.filter(([operation])=>operation.operation==='text.food.apply')).toHaveLength(1);
    expect(window.sessionStorage.getItem(`trophe:text-food:pending:${id(4)}`)).toBeNull();
  });

});
