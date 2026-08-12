export function normalizeTranscript(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function appendTranscript(existing: string, transcript: string): string {
  return normalizeTranscript(`${existing} ${transcript}`);
}
