#!/usr/bin/env node
import { tsImport } from 'tsx/esm/api';
import { readFile } from 'node:fs/promises';
const [directory, mode, evidencePath] = process.argv.slice(2);
if (!directory || (mode && mode !== '--publication') || (mode && !evidencePath)) {
  console.error('Usage: node scripts/media/validate-package.mjs PACKAGE [--publication PRIVATE_EVIDENCE_JSON]');
  process.exit(2);
}
try {
  const { validateMediaPackage } = await tsImport('../../lib/workout/media-package.ts', import.meta.url);
  const manifest = await validateMediaPackage(directory, { publication: mode === '--publication', evidence: evidencePath ? JSON.parse(await readFile(evidencePath, 'utf8')) : undefined });
  console.log(JSON.stringify({ valid: true, release_id: manifest.release_id, mode: mode ? 'publication' : 'candidate', assets: manifest.assets.length }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Validation failed');
  process.exit(1);
}
