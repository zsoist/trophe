/**
 * Regression 9 (route/UI) — over-long recipes are refused BEFORE dispatch.
 *
 * The agent supports RECIPE_ANALYZE_MAX_INPUT_CHARS and must never silently
 * truncate; the route must reject the same bound before any paid call, return a
 * stable `too_long` code (localized client copy), and the modal must advertise
 * the same limit. Otherwise a >limit recipe silently becomes a different one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/recipe-analyze', () => ({ run: mocks.run }));

import { POST } from '@/app/api/food/recipe-analyze/route';
import { RECIPE_ANALYZE_MAX_INPUT_CHARS } from '@/agents/schemas/recipe-analyze';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/food/recipe-analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/food/recipe-analyze — input bound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1', rateLimitBypassed: false });
    mocks.run.mockResolvedValue({
      ok: true,
      output: { recipe_name: 'R', servings: 1, ingredients: [], total: {}, per_serving: {} },
      telemetry: { rawStatus: 200, model: 'm', traceId: 'g-1' },
    });
  });

  it('rejects an over-long recipe with a stable too_long code BEFORE dispatch', async () => {
    const text = 'x'.repeat(RECIPE_ANALYZE_MAX_INPUT_CHARS + 1);

    const response = await POST(request({ text, language: 'en' }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe('too_long');
    expect(body.error).toBe(body.message);
    expect(body.message).toContain(String(RECIPE_ANALYZE_MAX_INPUT_CHARS));
    // No paid provider call is dispatched for a recipe we would only truncate.
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('dispatches a within-bound recipe unchanged', async () => {
    const text = 'flour, water, salt';

    const response = await POST(request({ text, language: 'en' }));

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.run.mock.calls[0][0]).toMatchObject({ text });
  });
});

describe('recipe-analyze bound is consistent across route + modal', () => {
  const route = readFileSync(
    join(process.cwd(), 'app/api/food/recipe-analyze/route.ts'),
    'utf8',
  );
  const modal = readFileSync(
    join(process.cwd(), 'components/food/RecipeAnalyzerModal.tsx'),
    'utf8',
  );

  it('route validates the shared agent bound, not a wider ad-hoc max', () => {
    expect(route).toContain('RECIPE_ANALYZE_MAX_INPUT_CHARS');
    expect(route).not.toContain('.max(30_000)');
    expect(route).not.toContain('max 30k chars');
  });

  it('route maps an over-long text to the localized too_long error code', () => {
    expect(route).toContain("code: 'too_long'");
  });

  it('modal mirrors the bound on the textarea and localizes the too_long copy', () => {
    expect(modal).toContain('maxLength={RECIPE_ANALYZE_MAX_INPUT_CHARS}');
    expect(modal).toContain('RECIPE_ANALYZE_MAX_INPUT_CHARS');
    expect(modal).toContain("food.err_too_long");
    expect(modal).toContain('RECIPE_ERROR_KEYS');
  });
});
