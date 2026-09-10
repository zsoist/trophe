// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { VoiceTranscriptReview } from '@/components/assistant/VoiceTranscriptReview';
import { PrivateVoiceReview } from '@/tools/anatomy/workout-review/voice-review';
import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { CoachVoiceSlot } from '@/components/assistant/GlobalCoach';
import type { ReviewedVoiceTransport } from '@/components/assistant/voice-client';
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout' }));
HTMLElement.prototype.scrollTo = vi.fn();
afterEach(cleanup);
const example = vi.fn();
const mounted = (identity = 'owner') => <I18nProvider defaultLang="en"><GlobalCoach identity={identity} example={example} voiceSlot={props => <PrivateVoiceReview {...props} />} /></I18nProvider>;
function openTranscript() {
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.click(screen.getByRole('button', { name: 'Try a transcript example' }));
}
it('edits and explicitly appends reviewed text to the real composer without sending or replacing an existing question', () => {
  render(mounted()); openTranscript();
  expect(screen.getByText(/does not come from your recording/)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Existing question' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit transcript' }), { target: { value: 'My corrected words' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add reviewed text to question' }));
  expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('Existing question\nMy corrected words');
  expect(screen.queryByRole('textbox', { name: 'Edit transcript' })).toBeNull();
  expect(example).not.toHaveBeenCalled();
});
it('preserves the full composer and editable transcript when combining them would exceed the input cap', () => {
  render(mounted()); openTranscript();
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'x'.repeat(2000) } });
  fireEvent.click(screen.getByRole('button', { name: 'Add reviewed text to question' }));
  expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toHaveLength(2000);
  expect(screen.getByRole('textbox', { name: 'Edit transcript' })).toBeTruthy();
  expect(screen.getByText(/could not accept this text/)).toBeTruthy();
  expect(example).not.toHaveBeenCalled();
});
it('discards unaccepted transcript text when the mounted coach identity changes', () => {
  const view = render(mounted()); openTranscript();
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit transcript' }), { target: { value: 'Private unaccepted words' } });
  view.rerender(mounted('other-owner'));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.queryByRole('textbox', { name: 'Edit transcript' })).toBeNull();
  expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('');
});
it('will not offer use of a transcript whose reviewed scope differs from the current conversation', () => {
  const scope = { actorId: 'owner', organizationId: 'org', conversationId: 'conversation-a' };
  const result: Extract<CoachVoiceResult, { ok: true }> = { version: 'coach-assistant.voice.v1', ok: true, status: 'review_required', scope, turnId: 'turn', transcript: { text: 'Private words', locale: 'en', languages: [], source: 'synthetic_fixture', trust: 'untrusted_transcript' }, review: { token: 'fixture', expiresAt: new Date(Date.now() + 60_000).toISOString(), editable: true, audioRetention: 'discarded_after_transcription' }, durationMs: 1000 };
  const use = vi.fn();
  render(<I18nProvider defaultLang="en"><VoiceTranscriptReview result={result} scope={{ ...scope, conversationId: 'conversation-b' }} onUse={use} onDiscard={vi.fn()} /></I18nProvider>);
  expect(screen.getByRole('button', { name: 'Add reviewed text to question' }).hasAttribute('disabled')).toBe(true);
  expect(use).not.toHaveBeenCalled();
});
it('identifies a real provider transcript without calling it a synthetic example', () => {
  const scope = { actorId: 'owner', organizationId: 'org', conversationId: 'conversation-a' };
  const result: Extract<CoachVoiceResult, { ok: true }> = { version: 'coach-assistant.voice.v1', ok: true, status: 'review_required', scope, turnId: 'turn', transcript: { text: 'Real transcribed words', locale: 'en', languages: ['en'], source: 'provider_transcript', trust: 'untrusted_transcript' }, review: { token: 'provider', expiresAt: new Date(Date.now() + 60_000).toISOString(), editable: true, audioRetention: 'discarded_after_transcription' }, durationMs: 1000 };
  render(<I18nProvider defaultLang="en"><VoiceTranscriptReview result={result} scope={scope} onUse={vi.fn()} onDiscard={vi.fn()} /></I18nProvider>);
  expect(screen.getByText('Transcript from your recording. Review it before sending.')).toBeTruthy();
  expect(screen.queryByText(/Synthetic transcript example/)).toBeNull();
});
it('keeps a negated quantity visible as reviewed user transcript without presenting it as a saved workout fact', async () => {
  const transcript = 'I did not lift 15 kilograms today. What does my recorded workout data show?';
  const safeAnswer = 'Your reviewed transcript and your recorded workout data are separate sources.';
  const reviewedImplementation: ReviewedVoiceTransport = async input => {
    const request: CoachConversationRequest = { ...input.request, message: input.editedText };
    const response: CoachConversationResponse = { version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: null,
      output: { answer: safeAnswer, evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
      telemetry: { model: null, provider: null, promptVersion: 'fixture', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'fixture' } };
    return { ok: true, status: 'answered', transcript: { text: input.editedText, locale: 'en', languages: ['en'], source: 'provider_transcript', trust: 'untrusted_user_reviewed_data' }, response, speech: null };
  };
  const reviewed = vi.fn(reviewedImplementation);
  const voiceSlot: CoachVoiceSlot = props => {
    const scope = { actorId: 'owner', organizationId: 'org', conversationId: props.conversationId };
    const result: Extract<CoachVoiceResult, { ok: true }> = { version: 'coach-assistant.voice.v1', ok: true, status: 'review_required', scope, turnId: 'provider-turn', transcript: { text: transcript, locale: 'en', languages: ['en'], source: 'provider_transcript', trust: 'untrusted_transcript' }, review: { token: 'provider', expiresAt: new Date(Date.now() + 60_000).toISOString(), editable: true, audioRetention: 'discarded_after_transcription' }, durationMs: 1000 };
    return <VoiceTranscriptReview result={result} scope={scope} onUse={props.onUse} onSend={props.onSend ? message => props.onSend!(result, message) : undefined} onDiscard={vi.fn()} />;
  };
  render(<I18nProvider defaultLang="en"><GlobalCoach identity="owner" example={example} reviewedVoiceTransport={reviewed} voiceSlot={voiceSlot} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect((screen.getByRole('textbox', { name: 'Edit transcript' }) as HTMLTextAreaElement).value).toBe(transcript);
  expect(screen.getByText('Transcript from your recording. Review it before sending.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Send reviewed question' }));
  await screen.findByText(safeAnswer);
  expect(screen.getAllByText(transcript)).toHaveLength(2);
  expect(reviewed).toHaveBeenCalledWith(expect.objectContaining({ editedText: transcript, reviewed: true, voice: expect.objectContaining({ transcript: expect.objectContaining({ source: 'provider_transcript', trust: 'untrusted_transcript', text: transcript }) }) }), expect.any(AbortSignal));
  expect(await vi.mocked(reviewed).mock.results[0].value).toMatchObject({ transcript: { text: transcript, source: 'provider_transcript', trust: 'untrusted_user_reviewed_data' }, response: { proposals: [], receipts: [] } });
});
it('sends reviewed fixture text through the integrated text turn and renders its response', async () => {
  const reviewedImplementation: ReviewedVoiceTransport = async input => {
    const request: CoachConversationRequest = { ...input.request, message: input.editedText };
    const response: CoachConversationResponse = { version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: null,
      output: { answer: 'Reviewed voice answer', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
      telemetry: { model: null, provider: null, promptVersion: 'fixture', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'fixture' } };
    return { ok: true, status: 'answered', transcript: { text: input.editedText, locale: input.voice.transcript.locale, languages: input.voice.transcript.languages, source: 'synthetic_fixture', trust: 'untrusted_user_reviewed_data' }, response, speech: null };
  };
  const reviewed = vi.fn(reviewedImplementation);
  render(<I18nProvider defaultLang="en"><GlobalCoach identity="owner" example={example} reviewedVoiceTransport={reviewed} voiceSlot={props => <PrivateVoiceReview {...props} />} /></I18nProvider>);
  openTranscript();
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit transcript' }), { target: { value: 'My reviewed workout question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reviewed question' }));
  await screen.findByText('Reviewed voice answer');
  expect(reviewed).toHaveBeenCalledWith(expect.objectContaining({ editedText: 'My reviewed workout question', reviewed: true, offerSpeech: true, request: expect.objectContaining({ turnId: expect.any(String) }) }), expect.any(AbortSignal));
  expect(screen.queryByRole('textbox', { name: 'Edit transcript' })).toBeNull();
});
