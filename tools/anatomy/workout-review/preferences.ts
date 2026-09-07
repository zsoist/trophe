/** Same transaction core as the server, backed only by disposable browser memory. */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { createPreferenceStore } from '../../../agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '../../../lib/workout/preferences';
import type { PreferenceTransport } from '../../../components/assistant/preference-state';
import { REVIEW_USER } from './store';
export const hashWorkspace = (value: unknown) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(value))));
let store: ReturnType<typeof createPreferenceStore> | null = null;
export function privatePreferences() {
  return store ??= createPreferenceStore([{ actorId: REVIEW_USER, subjectId: REVIEW_USER, organizationId: '00000000-0000-4000-8000-000000000002', preferences: { ...defaultWorkoutPreferences }, memories: [{ id: '00000000-0000-4000-8000-000000000010', text: 'Example: I prefer training in the morning.', source: 'user_input', createdAt: '2026-09-06T12:00:00Z', scope: 'user', confirmation: 'unconfirmed', version: 'example-memory-v1' }] }], {
    hash: hashWorkspace, id: () => crypto.randomUUID(),
  });
}
export const privatePreferenceTransport: PreferenceTransport = async (operation, signal) => {
  signal.throwIfAborted();
  return privatePreferences().execute(REVIEW_USER, operation);
};
