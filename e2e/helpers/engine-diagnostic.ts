const engineErrorCodes = new Set([
  'budget_blocked',
  'cancelled',
  'deadline',
  'forbidden',
  'provider_unavailable',
  'query_failed',
  'unauthenticated',
]);

export function boundedEngineErrorCode(value: unknown): string {
  return typeof value === 'string' && engineErrorCodes.has(value) ? value : 'other';
}
