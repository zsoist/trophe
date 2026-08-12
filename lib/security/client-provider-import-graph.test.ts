import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findClientProviderImportViolations } from './client-provider-import-graph';

let fixtureRoot: string;

beforeEach(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'trophe-client-import-graph-'));
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function addSource(filename: string, source: string): void {
  const absolute = path.join(fixtureRoot, filename);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, source);
}

describe('findClientProviderImportViolations', () => {
  it('reports a direct client import with a sanitized full path', () => {
    addSource(
      'app/direct.tsx',
      "'use client';\nimport '@/agents/runtime/provider-access';\n",
    );
    addSource('agents/runtime/provider-access.ts', 'export const policy = true;\n');

    const violations = findClientProviderImportViolations({ rootDir: fixtureRoot });

    expect(violations).toEqual([{
      entrypoint: 'app/direct.tsx',
      target: 'agents/runtime/provider-access.ts',
      importChain: [
        'app/direct.tsx',
        'agents/runtime/provider-access.ts',
      ],
    }]);
    expect(JSON.stringify(violations)).not.toContain(fixtureRoot);
  });

  it('follows a one-hop helper and TypeScript resolution for a JavaScript extension', () => {
    addSource(
      'components/client.tsx',
      "'use client';\nimport { helper } from '../lib/helper.js';\nvoid helper;\n",
    );
    addSource(
      'lib/helper.ts',
      "import { run } from '@/agents/runtime/providers/deepseek.js';\nexport const helper = run;\n",
    );
    addSource('lib/helper.js', 'export const helper = true;\n');
    addSource('agents/runtime/providers/deepseek.ts', 'export const run = true;\n');

    expect(findClientProviderImportViolations({ rootDir: fixtureRoot })).toEqual([{
      entrypoint: 'components/client.tsx',
      target: 'agents/runtime/providers/deepseek.ts',
      importChain: [
        'components/client.tsx',
        'lib/helper.ts',
        'agents/runtime/providers/deepseek.ts',
      ],
    }]);
  });

  it('follows index barrels, re-exports, and literal dynamic imports across multiple hops', () => {
    addSource(
      'app/barrel-client.tsx',
      "'use client';\nimport { loadProvider } from '@/components/provider-tools';\nvoid loadProvider;\n",
    );
    addSource(
      'components/provider-tools/index.ts',
      "export { loadProvider } from './loader';\n",
    );
    addSource(
      'components/provider-tools/loader.ts',
      "export const loadProvider = () => import('@/agents/clients/anthropic', { with: {} });\n",
    );
    addSource('agents/clients/anthropic.ts', 'export const invoke = true;\n');

    expect(findClientProviderImportViolations({ rootDir: fixtureRoot })).toEqual([{
      entrypoint: 'app/barrel-client.tsx',
      target: 'agents/clients/anthropic.ts',
      importChain: [
        'app/barrel-client.tsx',
        'components/provider-tools/index.ts',
        'components/provider-tools/loader.ts',
        'agents/clients/anthropic.ts',
      ],
    }]);
  });

  it('follows literal require calls', () => {
    addSource(
      'lib/agents/require-client.ts',
      "'use client';\nconst provider = require('../../agents/clients/google');\nvoid provider;\n",
    );
    addSource('agents/clients/google.ts', 'export const invoke = true;\n');

    expect(findClientProviderImportViolations({ rootDir: fixtureRoot })).toEqual([{
      entrypoint: 'lib/agents/require-client.ts',
      target: 'agents/clients/google.ts',
      importChain: [
        'lib/agents/require-client.ts',
        'agents/clients/google.ts',
      ],
    }]);
  });

  it('traverses cycles safely while retaining the complete route to a provider', () => {
    addSource(
      'app/cycle-client.tsx',
      "'use client';\nimport { a } from '@/lib/a';\nvoid a;\n",
    );
    addSource('lib/a.ts', "import { b } from './b';\nexport const a = b;\n");
    addSource(
      'lib/b.ts',
      "import { a } from './a';\nimport { policy } from '@/agents/runtime/provider-access';\nexport const b = a || policy;\n",
    );
    addSource('agents/runtime/provider-access.ts', 'export const policy = true;\n');

    expect(findClientProviderImportViolations({ rootDir: fixtureRoot })).toEqual([{
      entrypoint: 'app/cycle-client.tsx',
      target: 'agents/runtime/provider-access.ts',
      importChain: [
        'app/cycle-client.tsx',
        'lib/a.ts',
        'lib/b.ts',
        'agents/runtime/provider-access.ts',
      ],
    }]);
  });

  it('ignores type-only edges and clean client graphs', () => {
    addSource(
      'app/clean-client.tsx',
      [
        "'use client';",
        "import type { UnsafeShape } from '@/lib/unsafe-types';",
        "import { clean } from '@/lib/clean';",
        "export type { UnsafeShape as ReexportedUnsafeShape } from '@/lib/unsafe-types';",
        'export type LocalShape = UnsafeShape;',
        'void clean;',
        '',
      ].join('\n'),
    );
    addSource(
      'lib/unsafe-types.ts',
      "import { policy } from '@/agents/runtime/provider-access';\nexport type UnsafeShape = typeof policy;\n",
    );
    addSource('lib/clean.ts', 'export const clean = true;\n');
    addSource('agents/runtime/provider-access.ts', 'export const policy = true;\n');

    expect(findClientProviderImportViolations({ rootDir: fixtureRoot })).toEqual([]);
  });
});
