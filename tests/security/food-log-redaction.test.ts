import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('food processing log redaction', () => {
  it('does not place user food text or ingredient names in decomposition logs', () => {
    const decompose = source('agents/food-parse/decompose.ts');
    const logLines = decompose
      .split('\n')
      .filter((line) => /console\.(warn|error|log)/.test(line))
      .join('\n');

    expect(logLines).not.toContain('input.foodName');
    expect(logLines).not.toContain('fallbackNames');
    expect(logLines).not.toContain('food_name');
  });

  it('does not log raw parser failures or thrown provider objects', () => {
    const parseRoute = source('app/api/food/parse/route.ts');
    const photoRoute = source('app/api/ai/photo-analyze/route.ts');
    const parser = source('agents/food-parse/index.v4.ts');

    expect(parseRoute).not.toContain('error: result.error');
    expect(parseRoute).toContain('safeErrorMetadata(error)');
    expect(photoRoute).toContain('safeErrorMetadata(error)');
    expect(parser).toContain('safeErrorMetadata(err)');
  });
});
