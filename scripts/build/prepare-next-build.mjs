#!/usr/bin/env node

import {
  readdir,
  readFile,
  rm,
  unlink,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFLICT_COPY_PATTERN = /^sw \d+\.js$/;

export async function prepareNextBuildArtifacts(cwd = process.cwd()) {
  const root = resolve(cwd);
  const nextPath = resolve(root, '.next');
  const publicPath = resolve(root, 'public');
  if (dirname(nextPath) !== root || dirname(publicPath) !== root) {
    throw new Error('Refusing to clean build artifacts outside the workspace root');
  }

  let publicEntries = [];
  try {
    publicEntries = await readdir(publicPath);
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  }
  const conflictCopies = publicEntries.filter((name) => CONFLICT_COPY_PATTERN.test(name));

  if (conflictCopies.length > 0) {
    let canonical;
    try {
      canonical = await readFile(join(publicPath, 'sw.js'));
    } catch {
      throw new Error('Cannot verify numbered service-worker copies without public/sw.js');
    }

    for (const name of conflictCopies) {
      const candidate = await readFile(join(publicPath, name));
      if (!candidate.equals(canonical)) {
        throw new Error(`${join('public', name)} differs from public/sw.js; refusing to delete it`);
      }
    }
  }

  await Promise.all(
    conflictCopies.map((name) => unlink(join(publicPath, name))),
  );
  await rm(nextPath, { recursive: true, force: true });

  return { removedConflictCopies: conflictCopies.length };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  prepareNextBuildArtifacts()
    .then(({ removedConflictCopies }) => {
      if (removedConflictCopies > 0) {
        console.log(`Removed ${removedConflictCopies} identical service-worker conflict copy/copies.`);
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
