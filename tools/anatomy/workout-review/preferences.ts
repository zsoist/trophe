/** Same transaction core as the server, backed only by disposable browser memory. */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { createPreferenceStore } from '../../../agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '../../../lib/workout/preferences';
import type { PreferenceTransport } from '../../../components/assistant/preference-state';
import { REVIEW_USER } from './store';
let store: ReturnType<typeof createPreferenceStore> | null = null;
export function privatePreferences() {
  return store ??= createPreferenceStore([{ actorId: REVIEW_USER, subjectId: REVIEW_USER, organizationId: '00000000-0000-4000-8000-000000000002', preferences: { ...defaultWorkoutPreferences } }], {
    hash: value => bytesToHex(sha256(utf8ToBytes(JSON.stringify(value)))), id: () => crypto.randomUUID(),
  });
}
export const privatePreferenceTransport: PreferenceTransport = async (operation, signal) => {
  signal.throwIfAborted();
  return privatePreferences().execute(REVIEW_USER, operation);
};
