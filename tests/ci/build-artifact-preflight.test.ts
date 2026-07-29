import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareNextBuildArtifacts } from '../../scripts/build/prepare-next-build.mjs';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'trophe-build-preflight-'));
  temporaryRoots.push(root);
  await mkdir(join(root, '.next', 'types'), { recursive: true });
  await mkdir(join(root, 'public'), { recursive: true });
  await writeFile(join(root, '.next', 'types', 'routes.d.ts'), 'generated');
  await writeFile(join(root, 'public', 'sw.js'), 'worker');
  return root;
}

describe('Next build artifact preflight', () => {
  it('removes the ignored build tree and byte-identical conflict copies', async () => {
    const root = await workspace();
    await writeFile(join(root, 'public', 'sw 2.js'), 'worker');

    await expect(prepareNextBuildArtifacts(root)).resolves.toEqual({
      removedConflictCopies: 1,
    });
    await expect(access(join(root, '.next'))).rejects.toThrow();
    await expect(access(join(root, 'public', 'sw 2.js'))).rejects.toThrow();
    await expect(readFile(join(root, 'public', 'sw.js'), 'utf8')).resolves.toBe('worker');
  });

  it('fails closed and preserves a non-identical numbered file', async () => {
    const root = await workspace();
    await writeFile(join(root, 'public', 'sw 3.js'), 'user content');

    await expect(prepareNextBuildArtifacts(root)).rejects.toThrow(/differs from public\/sw\.js/i);
    await expect(readFile(join(root, 'public', 'sw 3.js'), 'utf8')).resolves.toBe('user content');
    await expect(access(join(root, '.next'))).resolves.toBeUndefined();
  });
});
