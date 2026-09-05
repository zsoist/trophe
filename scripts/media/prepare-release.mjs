#!/usr/bin/env node
/** Stage only. Never merges, deploys, or copies candidates into public/. */
import { tsImport } from 'tsx/esm/api';
import { readFile, writeFile, mkdir, mkdtemp, rename, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const [packagePath, evidencePath, outputPath] = process.argv.slice(2);
if (!packagePath || !evidencePath || !outputPath) { console.error('Usage: node scripts/media/prepare-release.mjs PACKAGE PRIVATE_EVIDENCE NEW_OUTPUT_DIRECTORY'); process.exit(2); }
try {
  const { validateMediaPackage } = await tsImport('../../lib/workout/media-package.ts', import.meta.url);
  const manifest = await validateMediaPackage(packagePath, { publication: true, evidence: JSON.parse(await readFile(evidencePath, 'utf8')) });
  const destination = resolve(outputPath);
  try { await lstat(destination); throw new Error('Output already exists; immutable releases cannot be overwritten'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stage = await mkdtemp(join(dirname(destination), '.trophe-release-'));
  const checksums = []; const activation = [];
  for (const asset of manifest.assets) {
    const publicFiles = [];
    for (const file of asset.files) {
      const bytes = await readFile(join(packagePath, file.path));
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Source changed after validation');
      const relative = join('public/workout-v4', asset.build_key, file.path);
      const target = join(stage, relative); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
      checksums.push(`${file.sha256}  ${relative}`); publicFiles.push({ path: file.path, sha256: file.sha256, bytes: file.bytes, role: file.role, mime_type: file.mime_type });
    }
    // Public metadata deliberately omits reviewer identities, private refs, notes and license originals.
    const publicManifest = { schema_version: 'trophe.public-media/1', release_id: manifest.release_id, asset_id: asset.asset_id, artifact_set_sha256: asset.artifact_set_sha256, files: publicFiles };
    const manifestTarget = join(stage, 'public/workout-v4', asset.build_key, `${asset.asset_id}.manifest.json`);
    await writeFile(manifestTarget, JSON.stringify(publicManifest, null, 2) + '\n', { flag: 'wx' });
    if (asset.kind === 'exercise') {
      const poster = asset.files.find(f => f.role === 'poster'); const video = asset.files.find(f => f.role === 'video_hd'); const mobile = asset.files.find(f => f.role === 'video_mobile');
      activation.push({ slug: asset.exercise.catalogue_slug, buildKey: asset.build_key, equipment: asset.exercise.equipment, posterSrc: `/workout-v4/${asset.build_key}/${poster.path}`, motionSrc: `/workout-v4/${asset.build_key}/${video.path}`, motionType: video.mime_type, ...(mobile ? { mobileSrc: `/workout-v4/${asset.build_key}/${mobile.path}`, mobileType: mobile.mime_type } : {}), artifactSetSha256: asset.artifact_set_sha256, reviewedOn: asset.reviews.visual.reviewed_at, phases: asset.exercise.phases.map(p => ({ id: p.id, startSeconds: p.start_seconds, endSeconds: p.end_seconds, labelKey: p.label_key })) });
    }
  }
  await writeFile(join(stage, 'SHA256SUMS'), checksums.sort().join('\n') + '\n');
  await writeFile(join(stage, 'activation.json'), JSON.stringify(activation, null, 2) + '\n');
  await rename(stage, destination);
  console.log(JSON.stringify({ staged: true, release_id: manifest.release_id, destination, published: false }));
} catch (error) { console.error(error instanceof Error ? error.message : 'Release staging failed'); process.exit(1); }
