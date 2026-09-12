// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
const capture = vi.hoisted(() => ({ cancel: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/log' }));
vi.mock('@/agents/coach-assistant/voice-capture', () => ({ COACH_AUDIO_LIMITS: { durationMs: 30000, fileBytes: 8000000 }, startCoachAudioRecording: (callbacks: { onRecording: () => void }) => { callbacks.onRecording(); return { active: true, cancel: capture.cancel, stop: vi.fn() }; } }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('stops local recording and TTS on visual close while keeping the draft', () => {
 const cancelSpeech = vi.fn(); vi.stubGlobal('speechSynthesis', { cancel: cancelSpeech });
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} example={vi.fn()} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Keep my draft' } });
 fireEvent.click(screen.getByLabelText('Voice'));
 fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
 expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
 const before = cancelSpeech.mock.calls.length;
 fireEvent.click(screen.getByRole('button', { name: 'Close Ask Trophē' }));
 expect(capture.cancel).toHaveBeenCalledTimes(1); expect(cancelSpeech.mock.calls.length).toBeGreaterThan(before);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('Keep my draft');
 expect(screen.queryByRole('button', { name: 'Stop recording' })).toBeNull();
});
