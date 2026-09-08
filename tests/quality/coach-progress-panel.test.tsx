// @vitest-environment jsdom
import React, { useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgressPanel } from '@/components/assistant/ProgressPanel';
import { ProgressController, type ProgressTransport } from '@/components/assistant/progress-state';
import { I18nProvider } from '@/lib/i18n';

afterEach(cleanup);
const actor = '00000000-0000-4000-8000-000000000001';
const proposalId = '00000000-0000-4000-8000-000000000002';
const after = { measuredDate: '2026-09-07', weightKg: 75.5, bodyFatPct: 18.2, waistCm: 82 };
it('shows canonical records and requires exact review before a receipt-backed refresh', async () => {
  let stored = false; const operations: string[] = [];
  const transport: ProgressTransport = async operation => {
    operations.push(operation.operation);
    if (operation.operation === 'progress.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { subjectId: actor, version: stored ? '2' : '1', window: { start: '2026-06-10', end: '2026-09-07', timezone: 'America/Bogota', days: operation.days }, measurements: stored ? [{ id: proposalId, ...after }] : [], trends: [], truncated: false, duplicateRowsDropped: 0, invalidValuesExcluded: 0, limitations: [] } };
    if (operation.operation === 'measurement.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: { id: proposalId, hash: 'a'.repeat(64), action: 'measurement.create', resource: { kind: 'measurement', id: proposalId, version: '1' }, before: null, after: operation.after, precondition: '1', expiresAt: new Date(Date.now() + 300_000).toISOString(), reviewRequired: true, inputSource: 'explicit_user' } };
    stored = true;
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, receipt: { id: crypto.randomUUID(), actionId: operation.actionId, proposalId, status: 'applied', resourceVersion: '2', recordedAt: new Date().toISOString(), action: 'measurement.create' }, refresh: { measurementId: proposalId, measuredDate: after.measuredDate, previousVersion: '1', version: '2', strategy: 'refetch' } };
  };
  const controller = new ProgressController(); controller.select(actor, crypto.randomUUID()); await controller.read(transport); const onSaved = vi.fn();
  function Harness() { const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot); return <ProgressPanel controller={controller} state={state} transport={transport} onSaved={onSaved} />; }
  render(<I18nProvider defaultLang="en"><Harness /></I18nProvider>);
  expect(screen.getByText('No measurements in the last 90 days.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: after.measuredDate } });
  fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: String(after.weightKg) } });
  fireEvent.change(screen.getByLabelText('Body fat (%)'), { target: { value: String(after.bodyFatPct) } });
  fireEvent.change(screen.getByLabelText('Waist (cm)'), { target: { value: String(after.waistCm) } });
  fireEvent.click(screen.getByRole('button', { name: 'Review measurement' }));
  await screen.findByText('Before: No measurement');
  expect(screen.getByText('After: Sep 7, 2026 · 75.5 kg · 18.2% · 82 cm')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm measurement' }));
  await screen.findByText('Measurement saved and refreshed.');
  await waitFor(() => expect(operations).toEqual(['progress.read', 'measurement.propose', 'measurement.apply', 'progress.read']));
  expect(onSaved).toHaveBeenCalledOnce();
});
