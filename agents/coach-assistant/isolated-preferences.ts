import { createHash, randomUUID } from 'node:crypto';
import { createPreferenceStore } from './preference-store';
import type { FixtureScope } from './preference-store';

/** Node adapter over the shared browser-safe isolated transaction core. */
export function createIsolatedPreferenceService(fixtures:FixtureScope[], now:()=>Date = ()=>new Date()) {
  return createPreferenceStore(fixtures,{hash:value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),id:randomUUID},now);
}
