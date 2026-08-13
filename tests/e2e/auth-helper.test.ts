import { describe, expect, it } from 'vitest';

import { isPaidRequest } from '../../e2e/helpers/auth';

describe('isPaidRequest', () => {
  it('blocks paid application and provider endpoints without blocking local Supabase REST', () => {
    expect(isPaidRequest('http://127.0.0.1:54321/rest/v1/messages?select=*')).toBe(false);
    expect(isPaidRequest('http://localhost:3000/api/food/parse')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/food/recipe-analyze')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/ai/photo-analyze')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/ai/meal-suggest')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/ai/conversation')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/ai/coach-insight')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/ai/transcribe')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/coach/shopping-list')).toBe(true);
    expect(isPaidRequest('http://localhost:3000/api/coach/meal-plan-macros')).toBe(true);
    expect(isPaidRequest('https://api.openai.com/v1/responses')).toBe(true);
    expect(isPaidRequest('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(isPaidRequest('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent')).toBe(true);
    expect(isPaidRequest('https://api.voyageai.com/v1/embeddings')).toBe(true);
    expect(isPaidRequest('https://api.deepseek.com/chat/completions')).toBe(true);
    expect(isPaidRequest('https://api.mistral.ai/v1/chat/completions')).toBe(true);
  });
});
