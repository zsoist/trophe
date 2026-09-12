import type { CoachAttachmentResult } from '@/agents/coach-assistant/contracts';
import type { AttachmentTransport } from './attachment-state';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function readAttachmentResult(value: unknown): CoachAttachmentResult {
  if (!object(value) || value.version !== 'coach-assistant.v2' || typeof value.ok !== 'boolean'
    || !['isolated_ephemeral', 'private_storage'].includes(String(value.storage)) || value.analysis !== 'not_connected') throw new Error('invalid_attachment_result');
  if (value.attachment !== undefined && (!object(value.attachment) || typeof value.attachment.id !== 'string' || value.attachment.kind !== 'image' || !['pending', 'available'].includes(String(value.attachment.status)))) throw new Error('invalid_attachment');
  if (value.state !== undefined && !['prepared', 'uploading', 'available', 'removed'].includes(String(value.state))) throw new Error('invalid_attachment_state');
  if (value.uploadToken !== undefined && (typeof value.uploadToken !== 'string' || !/^[a-f0-9]{64}$/.test(value.uploadToken))) throw new Error('invalid_upload_token');
  return value as unknown as CoachAttachmentResult;
}
async function result(response: Response) {
  const value = readAttachmentResult(await response.json());
  if (!response.ok && value.ok) throw new Error('invalid_attachment_result');
  return value;
}
export const requestAttachment: AttachmentTransport = {
  async operation(input, signal) {
    return result(await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(input) }));
  },
  async upload(conversationId, id, token, file, signal) {
    return result(await fetch('/api/coach-assistant', { method: 'PUT', credentials: 'same-origin', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json', 'x-coach-conversation-id': conversationId, 'x-coach-attachment-id': id, 'x-coach-upload-token': token }, body: file }));
  },
};
