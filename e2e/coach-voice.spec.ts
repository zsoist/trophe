import { expect, test, type Page } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';
import { VALID_SILENT_WEBM } from '../tests/fixtures/voice-audio';

const enabled = process.env.E2E_COACH_VOICE === '1';
test.skip(!enabled, 'Only the explicitly dispatched disposable voice runner supplies this fixture');

type VoiceHarness = { mode: 'granted' | 'denied' | 'pending'; trackStops: number; speak: number; pause: number; resume: number; cancel: number; grant?: () => void };

async function installSimulatedBrowserPrimitives(page: Page) {
  await page.addInitScript((webm) => {
    const harness: VoiceHarness = { mode: 'granted', trackStops: 0, speak: 0, pause: 0, resume: 0, cancel: 0 };
    Object.defineProperty(window, '__voiceHarness', { configurable: true, value: harness });
    const stream = () => ({ getTracks: () => [{ stop: () => { harness.trackStops++; } }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => {
      if (harness.mode === 'denied') return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
      if (harness.mode === 'pending') return new Promise(resolve => { harness.grant = () => resolve(stream()); });
      return Promise.resolve(stream());
    } } });
    class FakeMediaRecorder {
      static isTypeSupported(type: string) { return type.startsWith('audio/webm'); }
      state: 'inactive' | 'recording' = 'inactive'; mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null; onerror: ((event: { error?: unknown }) => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) { this.mimeType = options?.mimeType ?? 'audio/webm'; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        const bytes = Uint8Array.from(atob(webm), character => character.charCodeAt(0));
        this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) }); this.onstop?.();
      }
    }
    class FakeUtterance { lang = ''; rate = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak: () => { harness.speak++; }, pause: () => { harness.pause++; }, resume: () => { harness.resume++; }, cancel: () => { harness.cancel++; },
    } });
  }, VALID_SILENT_WEBM);
}

const harness = (page: Page) => page.evaluate(() => (window as typeof window & { __voiceHarness: VoiceHarness }).__voiceHarness);
async function setMode(page: Page, mode: VoiceHarness['mode']) { await page.evaluate(value => { (window as typeof window & { __voiceHarness: VoiceHarness }).__voiceHarness.mode = value; }, mode); }
async function recordAndTranscribe(page: Page) {
  const panel = page.locator('#global-coach');
  await panel.getByText('Voice', { exact: true }).click();
  await panel.getByRole('button', { name: 'Record audio', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.waitForTimeout(120);
  await panel.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Create editable transcript', exact: true })).toBeVisible();
  const transcript = page.waitForResponse(item => new URL(item.url()).pathname === '/api/coach-assistant/voice' && item.request().method() === 'PUT');
  await panel.getByRole('button', { name: 'Create editable transcript', exact: true }).click();
  const response = await transcript; expect(response.status()).toBe(200);
  return { panel, response, body: await response.json() };
}

test('governed voice reaches the existing text pipeline with simulated browser media only', async ({ page }) => {
  const noPaid = await blockPaidRequests(page);
  await installSimulatedBrowserPrimitives(page);
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/coach-assistant/voice') requests.push(request.method()); });
  await loginAs(page, 'client'); await page.goto('/dashboard/workout');
  await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
  const first = await recordAndTranscribe(page);
  expect(first.body).toMatchObject({ ok: true, status: 'review_required', transcript: { source: 'synthetic_fixture', trust: 'untrusted_transcript' }, review: { editable: true, audioRetention: 'discarded_after_transcription' } });
  await expect(first.panel.getByText('Synthetic transcript example. This text does not come from your recording.', { exact: true })).toBeVisible();
  const editor = first.panel.getByRole('textbox', { name: 'Edit transcript', exact: true });
  await editor.fill('Help me review my workout records today');
  const reviewed = page.waitForResponse(item => new URL(item.url()).pathname === '/api/coach-assistant/voice' && item.request().method() === 'POST');
  await first.panel.getByRole('button', { name: 'Send reviewed question', exact: true }).click();
  const answered = await reviewed; expect(answered.status()).toBe(200);
  const reviewedRequest = answered.request().postDataJSON(); const reviewedBody = await answered.json();
  expect(reviewedRequest.voice.turnId).toBe(reviewedRequest.request.turnId);
  expect(reviewedRequest.voice.scope.conversationId).toBe(reviewedRequest.request.conversationId);
  expect(reviewedRequest.editedText).toBe('Help me review my workout records today');
  expect(reviewedBody).toMatchObject({ ok: true, status: 'answered', transcript: { trust: 'untrusted_user_reviewed_data' }, response: { ok: true, mode: 'offline', dataSource: 'authorized_records', conversationId: reviewedRequest.request.conversationId, turnId: reviewedRequest.request.turnId }, speech: { autoplay: false, syntheticVoice: true, textSource: 'validated_final_answer' } });
  await expect(first.panel.getByText(/Offline record summary; no AI model interpreted your message/)).toBeVisible();
  expect((await harness(page)).speak).toBe(0);
  await first.panel.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('1.25');
  await first.panel.getByRole('button', { name: 'Listen with device voice', exact: true }).click();
  await first.panel.getByRole('button', { name: 'Pause voice playback', exact: true }).click();
  await first.panel.getByRole('button', { name: 'Resume voice playback', exact: true }).click();
  await first.panel.getByRole('button', { name: 'Stop voice playback', exact: true }).click();
  expect(await harness(page)).toMatchObject({ speak: 1, pause: 1, resume: 1 });

  const second = await recordAndTranscribe(page);
  await second.panel.getByRole('textbox', { name: 'Edit transcript', exact: true }).fill('Log 15 or 50 g');
  const postsBefore = requests.filter(method => method === 'POST').length;
  await second.panel.getByRole('button', { name: 'Send reviewed question', exact: true }).click();
  await expect(second.panel.getByRole('alert')).toContainText('Check the number before sending');
  expect(requests.filter(method => method === 'POST')).toHaveLength(postsBefore);
  await second.panel.getByRole('button', { name: 'Cancel', exact: true }).click();

  await setMode(page, 'denied');
  await second.panel.getByText('Voice', { exact: true }).click();
  await second.panel.getByRole('button', { name: 'Record audio', exact: true }).click();
  await expect(second.panel.getByRole('status')).toContainText('Microphone permission was denied');
  await expect(second.panel.getByRole('textbox', { name: 'Your question', exact: true })).toBeEnabled();

  await setMode(page, 'pending');
  await second.panel.getByRole('button', { name: 'Record audio', exact: true }).click();
  await expect(second.panel.getByRole('status')).toContainText('Waiting for microphone permission');
  const beforeClose = await harness(page); const requestsBeforeClose = requests.length;
  await second.panel.getByRole('button', { name: 'Close Ask Trophē', exact: true }).click();
  await page.evaluate(() => (window as typeof window & { __voiceHarness: VoiceHarness }).__voiceHarness.grant?.());
  await expect.poll(async () => (await harness(page)).trackStops).toBe(beforeClose.trackStops + 1);
  await page.waitForTimeout(100);
  expect(requests).toHaveLength(requestsBeforeClose);
  await expect(page.locator('#global-coach')).toHaveCount(0);
  noPaid();
});
