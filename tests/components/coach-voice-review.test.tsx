// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { VoiceTranscriptReview } from '@/components/assistant/VoiceTranscriptReview';
import { PrivateVoiceReview } from '@/tools/anatomy/workout-review/voice-review';
import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout' }));
HTMLElement.prototype.scrollTo = vi.fn();
afterEach(cleanup);
const example = vi.fn();
const mounted = (identity = 'owner') => <I18nProvider defaultLang="en"><GlobalCoach identity={identity} example={example} voiceSlot={props => <PrivateVoiceReview {...props} />} /></I18nProvider>;
function openTranscript() {
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect(screen.queryByRole('textbox', { name: 'Edit transcript' })).toBeNull();
  expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('');
});
it('will not offer use of a transcript whose reviewed scope differs from the current conversation', () => {
  const scope = { actorId: 'owner', organizationId: 'org', conversationId: 'conversation-a' };
  const result: Extract<CoachVoiceResult, { ok: true }> = { version: 'coach-assistant.voice.v1', ok: true, status: 'review_required', scope, turnId: 'turn', transcript: { text: 'Private words', languages: [], source: 'synthetic_fixture' }, durationMs: 1000 };
  const use = vi.fn();
  render(<I18nProvider defaultLang="en"><VoiceTranscriptReview result={result} scope={{ ...scope, conversationId: 'conversation-b' }} onUse={use} onDiscard={vi.fn()} /></I18nProvider>);
  expect(screen.getByRole('button', { name: 'Add reviewed text to question' }).hasAttribute('disabled')).toBe(true);
  expect(use).not.toHaveBeenCalled();
});
