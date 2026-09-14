// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { globalCoachTranslations } from '@/lib/locales/global-coach';
vi.mock('@/components/assistant/useGlobalCoachI18n', () => ({ useGlobalCoachI18n: () => ({ t: (key: string) => globalCoachTranslations[key]?.en ?? key }) }));
import { LiveVoiceControl } from '@/components/assistant/LiveVoiceControl';
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ enabled: true })));
  vi.stubGlobal('RTCPeerConnection', class {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
for (const [name, message] of [
  ['NotAllowedError', 'Allow microphone access in your browser, then start again. You can also type your message.'],
  ['NotFoundError', 'Microphone access is unavailable. Check your microphone or open this page in Chrome or Safari. You can still type.'],
]) {
  it(`shows actionable ${name} feedback without creating a paid session`, async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('private device details', name)) } });
    render(<LiveVoiceControl conversationId="00000000-0000-4000-8000-000000000001" onQuery={async () => 'unused'} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voice conversation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start conversation' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByText('private device details')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(screen.getByRole('button', { name: 'Start conversation' })).toBeTruthy();
  });
}
