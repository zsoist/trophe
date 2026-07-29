import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated conflict-copy isolation', () => {
  it('keeps macOS conflict copies under .next out of source typechecking', () => {
    const tsconfig = JSON.parse(
      readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf8'),
    ) as { exclude?: string[] };

    expect(tsconfig.exclude).toContain('.next/**/* *.ts');
  });
});
