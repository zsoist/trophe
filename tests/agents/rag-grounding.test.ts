import { describe, expect, it } from 'vitest';
import { groundingStatus } from '@/agents/rag/grounding';

describe('RAG grounding status', () => {
  it('distinguishes verified, uncited, and no-context responses', () => {
    expect(groundingStatus('Use this guidance [chunk-1].', ['chunk-1'])).toBe('verified');
    expect(groundingStatus('Use this guidance.', ['chunk-1'])).toBe('uncited');
    expect(groundingStatus('General guidance.', [])).toBe('not_applicable');
  });
});
