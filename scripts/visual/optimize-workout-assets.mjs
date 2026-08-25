import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const generatedSourceDir = '/Users/daniel_serverm4/.codex/generated_images/019fae1e-8f17-7580-9ca0-8ee8ec096157';
const publicRoot = join(repoRoot, 'public', 'workout-v2');
const manifestPath = join(publicRoot, 'manifest.json');
const checkOnly = process.argv.includes('--check');
const maxDerivativeBytes = 450_000;

/** This allow-list is the post-inspection acceptance record. */
const assets = [
  ['chest', 'anatomy', 'exec-2624960f-f33f-4fe4-a1b7-ec8c5a655632.png', 'body-areas', 12],
  ['back', 'anatomy', 'exec-cc3d0175-6d29-4d5a-9df6-ec4c0910dfa5.png', 'body-areas', 12],
  ['shoulders', 'anatomy', 'exec-3bf34f9a-244e-47d6-a5da-b9ce4eb8d565.png', 'body-areas', 12],
  ['arms', 'anatomy', 'exec-7e9ede82-9cb8-4fc8-94b6-dc8fd5398933.png', 'body-areas', 12],
  ['legs', 'anatomy', 'exec-53fb3fec-ac79-472e-b05a-09f5174cbc61.png', 'body-areas', 12],
  ['core', 'anatomy', 'exec-45f56c3d-0a16-4201-b965-7f29d3135080.png', 'body-areas', 12],
  ['full-body', 'anatomy', 'exec-8351eda9-576e-4667-b02b-de1f4ea59139.png', 'body-areas', 12],
  ['cardio', 'cardio', 'exec-842a3d7a-760c-4ec9-994f-d95c46d2962e.png', 'body-areas', 12],
  ['bench-press', 'technique', 'exec-29757fbc-5e48-47a2-a7af-fa9bbf6b5691.png', 'exercises', 10],
  ['incline-press', 'technique', 'exec-ae668908-13f5-466f-bcda-15a99f084822.png', 'exercises', 10],
  ['overhead-press', 'technique', 'exec-4262699b-d442-44d4-acee-fe3ad87afb3c.png', 'exercises', 10],
  ['pec-deck', 'technique', 'exec-57f65475-b19b-410e-83c0-3b7587375edc.png', 'exercises', 10],
  ['cable-fly', 'technique', 'exec-f8579ffa-ee6f-42f8-90e9-ae33c7288e8c.png', 'exercises', 10],
  ['pull-up', 'technique', 'exec-50602a29-a249-44ae-ac0f-121e5c60dc54.png', 'exercises', 10],
  ['deadlift', 'technique', 'exec-75fa452f-e919-457d-96fd-08f9ea084959.png', 'exercises', 10],
  ['squat', 'technique', 'exec-99753646-32ae-46c4-afa4-5bf4aa4bc39d.png', 'exercises', 10],
  ['dip', 'technique', 'exec-32029d99-5166-4994-adf0-3002f5c1127f.png', 'exercises', 10],
  ['row', 'technique', 'exec-7cf14122-0113-4004-b9a9-c91cb74c001b.png', 'exercises', 10],
  ['curl', 'technique', 'exec-c6d18e36-f59c-4773-88ed-cf7c72407942.png', 'exercises', 10],
  ['triceps-extension', 'technique', 'exec-9f1074e3-e92f-4315-8f3a-749f965fdce5.png', 'exercises', 10],
];

const promptSummaries = {
  anatomy: 'Full adult anatomical figure, warm-white clinical studio, full figure inside frame and restrained muscle-region highlights.',
  cardio: 'Recognizable running figure, warm-white studio and non-diagnostic cardio emphasis.',
  technique: 'Canonical exercise midpoint with complete athlete and required equipment on a warm-white studio field.',
};

function detailsFor(kind) {
  return kind === 'technique'
    ? { master: { width: 3240, height: 2160 }, display: { width: 1280, height: 853 }, quality: 86 }
    : { master: { width: 2160, height: 3240 }, display: { width: 640, height: 960 }, quality: 84 };
}

function relativePublicPath(path) {
  return path.slice(join(repoRoot, 'public').length + 1).replaceAll('\\', '/');
}

async function createAssets() {
  const entries = {};
  for (const [slug, kind, sourceFile, displayFolder, safeMarginPct] of assets) {
    const sourceInput = join(generatedSourceDir, sourceFile);
    const sourceOutput = join(publicRoot, 'masters', 'sources', `${slug}.png`);
    const masterOutput = join(publicRoot, 'masters', `${slug}.png`);
    const displayOutput = join(publicRoot, displayFolder, `${slug}.webp`);
    const sourceMeta = await sharp(sourceInput).metadata();
    if (!sourceMeta.width || !sourceMeta.height) throw new Error(`${slug}: source is malformed`);
    const settings = detailsFor(kind);

    await Promise.all([mkdir(dirname(sourceOutput), { recursive: true }), mkdir(dirname(displayOutput), { recursive: true })]);
    await cp(sourceInput, sourceOutput);
    await sharp(sourceInput)
      .resize({ ...settings.master, fit: 'contain', background: '#f8f6f2', kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.7, m1: 0.6, m2: 1.2, x1: 2, y2: 10, y3: 20 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(masterOutput);
    await sharp(masterOutput)
      .resize({ ...settings.display, fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .webp({ quality: settings.quality, effort: 6, smartSubsample: true })
      .toFile(displayOutput);

    entries[slug] = {
      kind,
      src: relativePublicPath(displayOutput),
      source: { path: relativePublicPath(sourceOutput), width: sourceMeta.width, height: sourceMeta.height },
      master: { path: relativePublicPath(masterOutput), ...settings.master, upscaled: true },
      display: { ...settings.display, quality: settings.quality },
      safeMarginPct,
      generatorMode: 'built-in-imagegen',
      promptSummary: promptSummaries[kind],
      fallbackLabel: 'anatomy',
    };
  }
  await writeFile(manifestPath, `${JSON.stringify({ version: 1, assets: entries }, null, 2)}\n`);
}

async function validateAssets() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const [slug, kind, sourceFile, displayFolder, safeMarginPct] of assets) {
    const entry = manifest.assets?.[slug];
    if (!entry) throw new Error(`${slug}: missing manifest entry`);
    const expected = detailsFor(kind);
    const expectedDisplay = `workout-v2/${displayFolder}/${slug}.webp`;
    if (entry.kind !== kind || entry.src !== expectedDisplay || entry.safeMarginPct !== safeMarginPct || entry.fallbackLabel !== 'anatomy') {
      throw new Error(`${slug}: manifest semantics do not match the accepted mapping`);
    }
    if (entry.master.width !== expected.master.width || entry.master.height !== expected.master.height) {
      throw new Error(`${slug}: master dimensions are not deterministic`);
    }
    if (entry.master.upscaled !== true) throw new Error(`${slug}: manifest must disclose the upscaled master`);
    const [sourceMeta, masterMeta, displayMeta, displayStat] = await Promise.all([
      sharp(join(repoRoot, 'public', entry.source.path)).metadata(),
      sharp(join(repoRoot, 'public', entry.master.path)).metadata(),
      sharp(join(repoRoot, 'public', entry.src)).metadata(),
      stat(join(repoRoot, 'public', entry.src)),
    ]);
    if (sourceMeta.width !== entry.source.width || sourceMeta.height !== entry.source.height) throw new Error(`${slug}: copied source dimensions changed`);
    if (masterMeta.width !== expected.master.width || masterMeta.height !== expected.master.height) throw new Error(`${slug}: master file dimensions changed`);
    if (displayMeta.width !== expected.display.width || displayMeta.height !== expected.display.height) throw new Error(`${slug}: display dimensions changed`);
    if (displayMeta.exif || displayMeta.icc || displayMeta.xmp || displayMeta.iptc) throw new Error(`${slug}: display metadata was not stripped`);
    if (displayStat.size >= maxDerivativeBytes) throw new Error(`${slug}: display derivative is ${displayStat.size} bytes, over ${maxDerivativeBytes}`);
    if (sourceFile.length === 0) throw new Error(`${slug}: source reference missing`);
  }
  console.log(`Workout artwork check passed: ${assets.length} accepted assets, all derivatives under ${maxDerivativeBytes} bytes.`);
}

if (checkOnly) await validateAssets();
else {
  await createAssets();
  await validateAssets();
}
