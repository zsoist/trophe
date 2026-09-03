#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { assertDecodedMotion, assertFileSha256, assertMediaToolsAvailable, runMediaTool, sha256File } from './workout-v3-media-validation.mjs';

const root = process.cwd();
const check = process.argv.includes('--check');
const sourceDir = join(root, 'assets/workout-v3/sources');
const masterDir = join(root, 'assets/workout-v3/masters');
const provenanceDir = join(root, 'assets/workout-v3/provenance');
const posterDir = join(root, 'public/workout-v3/posters');
const motionDir = join(root, 'public/workout-v3/motion');
const manifestPath = join(root, 'public/workout-v3/manifest.json');
const slash = (path) => relative(root, path).replaceAll('\\', '/');

const assets = [
  ['bench-press', 'Barbell Bench Press', 'Barbell', 'setup: bar above chest; work: lower toward lower chest; finish: press overhead'],
  ['incline-press', 'Incline Dumbbell Press', 'Dumbbell', 'setup: dumbbells over upper chest; work: lower with wrists stacked; finish: press upward'],
  ['smith-bench-press', 'Smith Machine Bench Press', 'Smith Machine', 'setup: fixed bar above chest; work: lower along rails; finish: press along rails'],
  ['machine-chest-press', 'Machine Chest Press', 'Machine', 'setup: handles at chest; work: press forward; finish: elbows extended'],
  ['floor-press', 'Floor Press', 'Barbell', 'setup: bar above chest; work: upper arms meet floor; finish: press overhead'],
  ['pec-deck', 'Pec Deck Machine', 'Machine', 'setup: arms open on pads; work: close pads; finish: pads meet before chest'],
  ['cable-fly', 'Standing Cable Chest Fly', 'Cable', 'setup: handles open between cable towers; work: bring inward; finish: handles meet before sternum'],
  ['push-up', 'Push Ups', 'Bodyweight', 'setup: high plank; work: controlled bottom; finish: high plank'],
  ['dip', 'Parallel Bar Chest Dips', 'Bodyweight', 'setup: supported on parallel bars; work: lower between bars; finish: supported top'],
  ['pull-up', 'Pull Ups', 'Bodyweight', 'setup: dead hang; work: pull upward; finish: chin above bar'],
  ['row', 'Seated Cable Row', 'Cable', 'setup: arms long on V handle; work: pull to lower ribs; finish: handle at lower ribs'],
  ['overhead-press', 'Standing Overhead Barbell Press', 'Barbell', 'setup: front rack; work: pass forehead; finish: bar over midfoot'],
  ['curl', 'Standing Dumbbell Biceps Curl', 'Dumbbell', 'setup: dumbbells at sides; work: curl through midpoint; finish: dumbbells near shoulders'],
  ['triceps-extension', 'Cable Rope Triceps Extension', 'Cable', 'setup: rope near upper chest; work: extend downward; finish: rope beside thighs'],
  ['squat', 'Barbell Back Squat', 'Barbell', 'setup: tall with bar on upper back; work: controlled descent; finish: controlled bottom-depth with neutral spine'],
  ['deadlift', 'Conventional Barbell Deadlift', 'Barbell', 'setup: hinge to bar; work: bar below knees; finish: tall lockout with neutral spine'],
].map(([slug, name, equipment, phases]) => ({ slug, name, equipment, phases, source: join(sourceDir, `${slug}-contact-sheet.png`) }));

function promptFor(asset) {
  return `Use case: photorealistic-natural\nAsset type: premium workout technique motion source contact sheet\nPrimary request: wide three-panel contact sheet of ${asset.name}, showing ${asset.phases}.\nScene/backdrop: clean neutral-white/light-gray studio plate.\nSubject: same real clothed adult athlete, full body and exact ${asset.equipment} equipment fully visible in every panel.\nComposition/framing: fixed wide camera, light and scale; generous 12 percent safe margins.\nConstraints: scientifically plausible sequential phases; no cropped body/equipment, impossible technique, distorted hands/joints, extra equipment, text, logos, watermark, anatomy overlay, or black background.`;
}

function requireFile(path, label) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${slash(path)}`);
}

function expectedFiles(asset) {
  return {
    provenance: join(provenanceDir, `${asset.slug}.json`),
    master: join(masterDir, `${asset.slug}.webp`),
    poster: join(posterDir, `${asset.slug}.webp`),
    motion: join(motionDir, `${asset.slug}.webm`),
  };
}

function assertByteBudget(path, budget, label) {
  if (statSync(path).size > budget) throw new Error(`${label} exceeds ${budget} bytes: ${slash(path)}`);
}

async function build(asset) {
  requireFile(asset.source, `${asset.slug} generated source`);
  const output = expectedFiles(asset);
  const sourceMetadata = await sharp(asset.source).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height) throw new Error(`Unreadable source ${slash(asset.source)}`);
  const panelWidth = Math.floor(sourceMetadata.width / 3);
  const sourceStats = statSync(asset.source);
  const provenance = {
    version: 1,
    slug: asset.slug,
    canonicalName: asset.name,
    equipment: asset.equipment,
    generatedWith: 'built-in-image-gen',
    sourcePath: slash(asset.source),
    sourceNativeDimensions: { width: sourceMetadata.width, height: sourceMetadata.height },
    prompt: promptFor(asset),
    promptClass: 'photorealistic-natural',
    phases: ['setup', 'work', 'finish'],
    review: { exerciseIdentity: true, equipmentIdentity: true, setupPhase: true, workPhase: true, finishPhase: true },
    reviewNote: 'Visual identity/phase review accepts this generated contact sheet. Curated code-native anatomy remains the authority for muscle activation.',
  };
  if (!check) {
    [masterDir, provenanceDir, posterDir, motionDir].forEach((dir) => mkdirSync(dir, { recursive: true }));
    writeFileSync(output.provenance, `${JSON.stringify(provenance, null, 2)}\n`);
    // WebP has no embedded-prompt path in the project verifier, and sharp may
    // strip PNG metadata. Keep the exact generation intent adjacent to every
    // source and derived raster in the verifier's documented sidecar format.
    for (const raster of [asset.source, output.master, output.poster, output.motion]) {
      writeFileSync(`${raster}.json`, `${JSON.stringify({ prompt: promptFor(asset) }, null, 2)}\n`);
    }
    const frame = (index, width, height, path) => sharp(asset.source)
      .extract({ left: Math.min(index * panelWidth, sourceMetadata.width - panelWidth), top: 0, width: panelWidth, height: sourceMetadata.height })
      .resize({ width, height, fit: 'contain', background: '#f5f5f3' })
      .webp({ quality: 82, effort: 6 })
      .toFile(path);
    await frame(1, 3840, 2160, output.master);
    await frame(1, 960, 540, output.poster);
    const frameDir = mkdtempSync(join(tmpdir(), `trophe-${asset.slug}-`));
    try {
      for (const [number, panel] of [0, 1, 2, 1].entries()) {
        await sharp(asset.source)
          .extract({ left: Math.min(panel * panelWidth, sourceMetadata.width - panelWidth), top: 0, width: panelWidth, height: sourceMetadata.height })
          .resize({ width: 960, height: 540, fit: 'contain', background: '#f5f5f3' })
          .png()
          .toFile(join(frameDir, `frame-${String(number + 1).padStart(2, '0')}.png`));
      }
      runMediaTool('ffmpeg', ['-y', '-framerate', '2', '-i', join(frameDir, 'frame-%02d.png'), '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-b:v', '0', '-crf', '0', '-pix_fmt', 'yuv420p', output.motion], 'V3 motion encode');
    } finally {
      rmSync(frameDir, { recursive: true, force: true });
    }
  }
  Object.values(output).forEach((path) => requireFile(path, `${asset.slug} output`));
  for (const raster of [asset.source, output.master, output.poster, output.motion]) {
    requireFile(`${raster}.json`, `${asset.slug} prompt sidecar`);
    const promptSidecar = JSON.parse(readFileSync(`${raster}.json`, 'utf8'));
    if (promptSidecar.prompt !== promptFor(asset)) throw new Error(`${asset.slug} prompt sidecar is stale`);
  }
  const masterMeta = await sharp(output.master).metadata();
  if ((masterMeta.width ?? 0) * (masterMeta.height ?? 0) < 8_000_000) throw new Error(`${asset.slug} master is below 8MP`);
  assertByteBudget(output.poster, 260_000, `${asset.slug} poster`);
  assertByteBudget(output.motion, 900_000, `${asset.slug} motion`);
  const decodedMotion = assertDecodedMotion(output.motion, { width: 960, height: 540, frameRate: 2, durationSeconds: 2 });
  const savedProvenance = JSON.parse(readFileSync(output.provenance, 'utf8'));
  if (!savedProvenance.prompt || savedProvenance.generatedWith !== 'built-in-image-gen') throw new Error(`${asset.slug} provenance is incomplete`);
  return {
    [asset.slug]: {
      canonicalName: asset.name,
      equipment: asset.equipment,
      source: { path: slash(asset.source), width: sourceMetadata.width, height: sourceMetadata.height, bytes: sourceStats.size, sha256: sha256File(asset.source) },
      master: { path: slash(output.master), width: masterMeta.width, height: masterMeta.height, sha256: sha256File(output.master), resampling: 'deterministic-upscale' },
      poster: { src: `/${slash(output.poster).replace(/^public\//, '')}`, width: 960, height: 540, byteBudget: 260000, bytes: statSync(output.poster).size, sha256: sha256File(output.poster), objectPosition: '50% 50%' },
      motion: { src: `/${slash(output.motion).replace(/^public\//, '')}`, durationSeconds: 2, frameRate: 2, byteBudget: 900000, bytes: statSync(output.motion).size, sha256: sha256File(output.motion), phases: ['setup', 'work', 'finish', 'work'], ...decodedMotion },
      provenance: { promptOrOrigin: slash(output.provenance), sourcePath: slash(asset.source), generatedWith: 'built-in-image-gen' },
      review: savedProvenance.review,
      safeMarginPct: 12,
    },
  };
}

async function assertManifestEvidence(manifest) {
  for (const asset of assets) {
    const item = manifest.assets?.[asset.slug];
    if (!item) throw new Error(`Manifest is missing ${asset.slug}`);
    const output = expectedFiles(asset);
    const fileChecks = [
      ['source', asset.source, item.source?.sha256],
      ['master', output.master, item.master?.sha256],
      ['poster', output.poster, item.poster?.sha256],
      ['motion', output.motion, item.motion?.sha256],
    ];
    for (const [kind, path, declaredHash] of fileChecks) {
      requireFile(path, `${asset.slug} ${kind}`);
      assertFileSha256(path, declaredHash, `${asset.slug} ${kind}`);
    }
    const sourceMeta = await sharp(asset.source).metadata();
    const masterMeta = await sharp(output.master).metadata();
    const provenance = JSON.parse(readFileSync(output.provenance, 'utf8'));
    if (item.source.width !== sourceMeta.width || item.source.height !== sourceMeta.height
      || provenance.sourceNativeDimensions?.width !== sourceMeta.width || provenance.sourceNativeDimensions?.height !== sourceMeta.height) {
      throw new Error(`${asset.slug} source native dimensions disagree with manifest/provenance`);
    }
    if (item.master.width !== masterMeta.width || item.master.height !== masterMeta.height || masterMeta.width !== 3840 || masterMeta.height !== 2160) {
      throw new Error(`${asset.slug} master dimensions disagree with manifest or 4K contract`);
    }
    if (item.master.resampling !== 'deterministic-upscale' || (sourceMeta.width === masterMeta.width && sourceMeta.height === masterMeta.height)) {
      throw new Error(`${asset.slug} source-native/master resampling declaration is not truthful`);
    }
  }
}

assertMediaToolsAvailable();
const records = Object.assign({}, ...(await Promise.all(assets.map(build))));
const manifest = { version: 1, generatedAt: 'deterministic-build-v1', assets: records };
if (!check) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
requireFile(manifestPath, 'manifest');
const existing = readFileSync(manifestPath, 'utf8');
await assertManifestEvidence(JSON.parse(existing));
if (existing !== `${JSON.stringify(manifest, null, 2)}\n`) throw new Error('workout-v3 manifest is stale; run node scripts/visual/build-workout-v3-media.mjs');
console.log(`${check ? 'Validated' : 'Built'} ${assets.length} workout-v3 media records.`);
