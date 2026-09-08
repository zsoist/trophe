import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

/** Canonical version used by draft proposals and the local workspace review boundary. */
export const hashWorkoutWorkspace = (value: unknown): string =>
  bytesToHex(sha256(utf8ToBytes(JSON.stringify(value))));
