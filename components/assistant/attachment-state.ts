import { preflightImage } from './image-preflight';
import { COACH_IMAGE_LIMITS, type CoachAttachmentOperation, type CoachAttachmentRef, type CoachAttachmentResult, type CoachImageMime } from '@/agents/coach-assistant/contracts';

export interface AttachmentTransport {
  operation(input: CoachAttachmentOperation, signal: AbortSignal): Promise<CoachAttachmentResult>;
  upload(conversationId: string, id: string, token: string, file: File, signal: AbortSignal): Promise<CoachAttachmentResult>;
}
export interface SelectedImage {
  key: string; file: File; url: string; state: 'selected' | 'uploading' | 'available' | 'uncertain' | 'retryable';
  requestId: string; reference?: CoachAttachmentRef; token?: string;
}
export interface AttachmentState { items: SelectedImage[]; pending: boolean; error: 'limit' | 'type' | 'failed' | null }
const empty = (): AttachmentState => ({ items: [], pending: false, error: null });

/** Local selection never uploads. Explicit review starts upload; uncertain uploads reuse their reservation. */
export class AttachmentController {
  constructor(private readonly maxImages: number = COACH_IMAGE_LIMITS.count) {}
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: AttachmentState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private change(key: string, update: Partial<SelectedImage>) { this.publish({ ...this.state, items: this.state.items.map(item => item.key === key ? { ...item, ...update } : item) }); }
  async select(files: File[]) {
    if (this.state.pending) return;
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { this.publish({ ...this.state, error: 'type' }); return; }
    if (this.state.items.length + files.length > this.maxImages || files.some(file => file.size < 1 || file.size > COACH_IMAGE_LIMITS.fileBytes)
      || [...this.state.items.map(item => item.file), ...files].reduce((sum, file) => sum + file.size, 0) > COACH_IMAGE_LIMITS.totalBytes) { this.publish({ ...this.state, error: 'limit' }); return; }
    const controller = new AbortController(); this.active = controller;
    const generation = ++this.generation;
    this.publish({ ...this.state, pending: true, error: null });
    const timer = setTimeout(() => { if (generation === this.generation) this.cancel(); }, 45_000);
    try {
      for (const file of files) await preflightImage(file, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return;
      this.publish({ ...this.state, items: [...this.state.items, ...files.map(file => ({ key: crypto.randomUUID(), requestId: crypto.randomUUID(), file, url: URL.createObjectURL(file), state: 'selected' as const }))] });
    } catch (error) {
      if (generation === this.generation) this.publish({ ...this.state, error: error instanceof Error && error.message === 'limit' ? 'limit' : 'type' });
    } finally { clearTimeout(timer); if (generation === this.generation) { this.active = null; this.publish({ ...this.state, pending: false }); } }

  }
  reset() {
    this.generation++; this.active?.abort(); this.active = null;
    this.state.items.forEach(item => URL.revokeObjectURL(item.url)); this.publish(empty());
  }
  cancel() {
    if (!this.active) return;
    this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, items: this.state.items.map(item => item.state === 'uploading' ? { ...item, state: item.reference ? 'uncertain' : 'selected' } : item) });
  }
  references() { return this.state.items.filter(item => item.state === 'available' && item.reference).map(item => ({ ...item.reference! })); }
  reconcile(references: CoachAttachmentRef[]) {
    let changed = false;
    const items = this.state.items.map(item => {
      const resolved = references.find(reference => reference.id === item.reference?.id);
      if (item.state === 'available' && resolved && resolved.status !== 'available') { changed = true; return { ...item, state: 'uncertain' as const }; }
      return item;
    });
    if (changed) this.publish({ ...this.state, items });
  }
  async upload(key: string, conversationId: string, transport: AttachmentTransport) {
    const item = this.state.items.find(entry => entry.key === key);
    if (!item || !['selected', 'retryable'].includes(item.state) || this.state.pending) return;
    await this.run(key, async (signal, valid) => {
      let reference = item.reference, token = item.token;
      if (!reference || !token) {
        const prepared = await transport.operation({ version: 'coach-assistant.v2', operation: 'attachment.prepare', conversationId, requestId: item.requestId, mime: item.file.type as CoachImageMime, bytes: item.file.size }, signal);
        if (!valid()) return;
        if (!prepared.ok || !prepared.attachment || !prepared.uploadToken) throw new Error('prepare_failed');
        reference = prepared.attachment; token = prepared.uploadToken;
        this.change(key, { reference, token });
      }
      const uploaded = await transport.upload(conversationId, reference.id, token, item.file, signal);
      if (!valid()) return;
      if (!uploaded.ok || uploaded.state !== 'available' || uploaded.attachment?.id !== reference.id || uploaded.attachment.status !== 'available') throw new Error('upload_failed');
      this.change(key, { reference: uploaded.attachment, state: 'available' });
    });
  }
  async check(key: string, conversationId: string, transport: AttachmentTransport) {
    const item = this.state.items.find(entry => entry.key === key);
    if (!item?.reference || this.state.pending || item.state !== 'uncertain') return;
    await this.run(key, async (signal, valid) => {
      const result = await transport.operation({ version: 'coach-assistant.v2', operation: 'attachment.status', conversationId, attachmentId: item.reference!.id }, signal);
      if (!valid()) return;
      if (!result.ok || result.attachment?.id !== item.reference!.id) throw new Error('status_failed');
      if (result.state === 'available') this.change(key, { state: 'available', reference: result.attachment });
      else if (result.state === 'prepared') this.change(key, { state: 'retryable' });
      else this.change(key, { state: 'uncertain' });
    });
  }
  async remove(key: string, conversationId: string, transport?: AttachmentTransport) {
    const item = this.state.items.find(entry => entry.key === key);
    if (!item || this.state.pending || (item.reference && !transport)) return;
    const removeLocal = () => { URL.revokeObjectURL(item.url); this.publish({ ...this.state, items: this.state.items.filter(entry => entry.key !== key) }); };
    if (!item.reference) { removeLocal(); return; }
    await this.run(key, async (signal, valid) => {
      const result = await transport!.operation({ version: 'coach-assistant.v2', operation: 'attachment.remove', conversationId, attachmentId: item.reference!.id, reviewed: true }, signal);
      if (!valid()) return;
      if (!result.ok || result.state !== 'removed') throw new Error('remove_failed');
      removeLocal();
    });
  }
  private async run(key: string, work: (signal: AbortSignal, valid: () => boolean) => Promise<void>) {
    const controller = new AbortController(); this.active = controller;
    const generation = ++this.generation;
    const valid = () => generation === this.generation && !controller.signal.aborted;
    this.publish({ ...this.state, pending: true, error: null }); this.change(key, { state: 'uploading' });
    const fail = () => {
      this.cancel();
      this.publish({ ...this.state, error: 'failed' });
    };
    const timer = setTimeout(() => { if (valid()) fail(); }, 45_000);
    try { await work(controller.signal, valid); }
    catch { if (valid()) fail(); }
    finally { clearTimeout(timer); if (valid()) { this.active = null; this.publish({ ...this.state, pending: false }); } }
  }
}
