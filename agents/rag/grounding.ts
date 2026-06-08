export type GroundingStatus = 'verified' | 'uncited' | 'not_applicable';

export function groundingStatus(output: string, chunkIds: string[]): GroundingStatus {
  if (chunkIds.length === 0) return 'not_applicable';
  return chunkIds.some((id) => output.includes(`[${id}]`)) ? 'verified' : 'uncited';
}
