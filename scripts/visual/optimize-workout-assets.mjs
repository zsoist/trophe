import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const assetRoot = join(repoRoot, 'assets', 'workout-v2');
const publicRoot = join(repoRoot, 'public', 'workout-v2');
const manifestPath = join(publicRoot, 'manifest.json');
const checkOnly = process.argv.includes('--check');
const verifyIdempotence = process.argv.includes('--verify-idempotence');
const maxDerivativeBytes = 450_000;
const maxPublicPayloadBytes = 2 * 1024 * 1024;
const canvasPaddingPct = 12;

// Accepted, checked-in source allow-list. Generation never reads outside assets/workout-v2.
const assets = [
  ['chest', 'anatomy', 'body-areas'], ['back', 'anatomy', 'body-areas'], ['shoulders', 'anatomy', 'body-areas'],
  ['arms', 'anatomy', 'body-areas'], ['legs', 'anatomy', 'body-areas'], ['core', 'anatomy', 'body-areas'],
  ['full-body', 'anatomy', 'body-areas'], ['cardio', 'cardio', 'body-areas'],
  ['bench-press', 'technique', 'exercises'], ['incline-press', 'technique', 'exercises'], ['overhead-press', 'technique', 'exercises'],
  ['pec-deck', 'technique', 'exercises'], ['cable-fly', 'technique', 'exercises'], ['pull-up', 'technique', 'exercises'],
  ['deadlift', 'technique', 'exercises'], ['squat', 'technique', 'exercises'], ['dip', 'technique', 'exercises'],
  ['row', 'technique', 'exercises'], ['curl', 'technique', 'exercises'], ['triceps-extension', 'technique', 'exercises'],
];

const promptSummaries = {
  anatomy: 'Full adult anatomical figure, warm-white clinical studio, full figure inside frame and restrained muscle-region highlights.',
  cardio: 'Recognizable running figure, warm-white studio and non-diagnostic cardio emphasis.',
  technique: 'Canonical exercise midpoint with complete athlete and required equipment on a warm-white studio field.',
};

const hashFile = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const relative = (path) => path.slice(repoRoot.length + 1).replaceAll('\\', '/');
const publicSrc = (folder, slug) => `/workout-v2/${folder}/${slug}.webp`;

function detailsFor(kind) {
  return kind === 'technique'
    ? { master: { width: 3240, height: 2160 }, display: { width: 1280, height: 853 }, quality: 86 }
    : { master: { width: 2160, height: 3240 }, display: { width: 640, height: 960 }, quality: 84 };
}

function isEdgeMatte(r, g, b, threshold) {
  // The studio floor has a warm-grey falloff rather than pure white. Restricting
  // removal to edge-connected, low-chroma pixels preserves the subject/equipment
  // while removing that field for the dark-surface runtime composite.
  return (r + g + b) / 3 >= threshold && Math.max(r, g, b) - Math.min(r, g, b) <= 48;
}

function removeEdgeConnectedMatte(data, width, height, channels, threshold, removeEnclosedMatte) {
  const total = width * height;
  const matte = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0; let tail = 0;
  const enqueue = (index) => {
    if (matte[index]) return;
    const offset = index * channels;
    if (!isEdgeMatte(data[offset], data[offset + 1], data[offset + 2], threshold)) return;
    matte[index] = 1; queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y += 1) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++]; const x = index % width; const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1); if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width); if (y + 1 < height) enqueue(index + width);
  }
  const rgba = Buffer.alloc(total * 4);
  for (let index = 0; index < total; index += 1) {
    const source = index * channels; const target = index * 4;
    rgba[target] = data[source]; rgba[target + 1] = data[source + 1]; rgba[target + 2] = data[source + 2];
    rgba[target + 3] = (matte[index] || (removeEnclosedMatte && isEdgeMatte(data[source], data[source + 1], data[source + 2], threshold)))
      ? 0
      : (channels === 4 ? data[source + 3] : 255);
  }
  return rgba;
}

function alphaBounds(data, width, height, channels) {
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * channels + 3] > 24) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('no opaque subject/equipment pixels found');
  return {
    left, top, right, bottom, width: right - left + 1, height: bottom - top + 1,
    marginPct: Math.min(left / width, (width - 1 - right) / width, top / height, (height - 1 - bottom) / height) * 100,
  };
}

async function foregroundFromSource(sourcePath, kind) {
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const threshold = kind === 'technique' ? 120 : 205;
  const rgba = removeEdgeConnectedMatte(data, info.width, info.height, info.channels, threshold, kind === 'technique');
  return { rgba, info: { width: info.width, height: info.height }, bounds: alphaBounds(rgba, info.width, info.height, 4) };
}

async function createEntry(slug, kind, folder) {
  const sourcePath = join(assetRoot, 'sources', `${slug}.png`);
  const masterPath = join(assetRoot, 'masters', `${slug}.webp`);
  const displayPath = join(publicRoot, folder, `${slug}.webp`);
  const source = await foregroundFromSource(sourcePath, kind);
  const settings = detailsFor(kind);
  const cropped = await sharp(source.rgba, { raw: { width: source.info.width, height: source.info.height, channels: 4 } })
    .extract({ left: source.bounds.left, top: source.bounds.top, width: source.bounds.width, height: source.bounds.height })
    .resize({ width: Math.floor(settings.master.width * 0.8), height: Math.floor(settings.master.height * 0.8), fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.7, m1: 0.6, m2: 1.2, x1: 2, y2: 10, y3: 20 })
    .webp({ quality: 94, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  await mkdir(join(assetRoot, 'masters'), { recursive: true });
  await mkdir(join(publicRoot, folder), { recursive: true });
  await sharp({ create: { width: settings.master.width, height: settings.master.height, channels: 4, background: { r: 248, g: 246, b: 242, alpha: 0 } } })
    .composite([{ input: cropped, gravity: 'centre' }])
    .webp({ quality: 94, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(masterPath);
  await sharp(masterPath)
    .resize({ ...settings.display, fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .webp({ quality: settings.quality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(displayPath);
  return inspectedEntry(slug, kind, folder, source.bounds.marginPct);
}

async function inspectedEntry(slug, kind, folder, knownSourceMargin) {
  const sourcePath = join(assetRoot, 'sources', `${slug}.png`);
  const masterPath = join(assetRoot, 'masters', `${slug}.webp`);
  const displayPath = join(publicRoot, folder, `${slug}.webp`);
  const [sourceMeta, masterMeta, displayMeta, sourceHash, masterHash, displayHash] = await Promise.all([
    sharp(sourcePath).metadata(), sharp(masterPath).metadata(), sharp(displayPath).metadata(),
    hashFile(sourcePath), hashFile(masterPath), hashFile(displayPath),
  ]);
  const sourceMarginPct = knownSourceMargin ?? (await foregroundFromSource(sourcePath, kind)).bounds.marginPct;
  const displayRaw = await sharp(displayPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const displayMarginPct = alphaBounds(displayRaw.data, displayRaw.info.width, displayRaw.info.height, displayRaw.info.channels).marginPct;
  const settings = detailsFor(kind);
  return {
    kind,
    src: publicSrc(folder, slug),
    source: { path: relative(sourcePath), width: sourceMeta.width, height: sourceMeta.height, sha256: sourceHash, safeMarginPct: Number(sourceMarginPct.toFixed(2)) },
    master: { path: relative(masterPath), width: masterMeta.width, height: masterMeta.height, upscaled: true, sha256: masterHash, canvasPaddingPct, format: 'webp' },
    display: { width: displayMeta.width, height: displayMeta.height, quality: settings.quality, hasAlpha: displayMeta.hasAlpha === true, sha256: displayHash, safeMarginPct: Number(displayMarginPct.toFixed(2)) },
    safeMarginPct: Number(displayMarginPct.toFixed(2)),
    generatorMode: 'built-in-imagegen',
    promptSummary: promptSummaries[kind],
    fallbackLabel: 'anatomy',
  };
}

async function buildManifest(regenerate) {
  const entries = {};
  for (const [slug, kind, folder] of assets) entries[slug] = regenerate
    ? await createEntry(slug, kind, folder)
    : await inspectedEntry(slug, kind, folder);
  return { version: 2, assets: entries };
}

async function validateManifest() {
  const actualText = await readFile(manifestPath, 'utf8');
  const actual = JSON.parse(actualText);
  const expected = await buildManifest(false);
  if (actualText !== `${JSON.stringify(expected, null, 2)}\n`) throw new Error('manifest drift: computed config, dimensions, margins, alpha, or hashes differ');
  let payloadBytes = Buffer.byteLength(actualText);
  for (const [slug, kind, folder] of assets) {
    const entry = actual.assets[slug]; const details = detailsFor(kind);
    if (!entry || entry.src !== publicSrc(folder, slug) || entry.kind !== kind || entry.generatorMode !== 'built-in-imagegen' || entry.promptSummary !== promptSummaries[kind]) throw new Error(`${slug}: manifest config drift`);
    if (entry.master.width !== details.master.width || entry.master.height !== details.master.height || entry.master.format !== 'webp') throw new Error(`${slug}: master dimensions or format drift`);
    if (entry.display.width !== details.display.width || entry.display.height !== details.display.height || entry.display.hasAlpha !== true) throw new Error(`${slug}: display dimensions or alpha drift`);
    if (entry.safeMarginPct < 8 || entry.master.canvasPaddingPct < 10 || entry.display.safeMarginPct < 8) throw new Error(`${slug}: output safety margin is below threshold`);
    const displayPath = join(repoRoot, 'public', entry.src.slice(1)); const displayStat = await stat(displayPath); payloadBytes += displayStat.size;
    if (displayStat.size >= maxDerivativeBytes) throw new Error(`${slug}: display derivative exceeds ${maxDerivativeBytes} bytes`);
  }
  if (payloadBytes >= maxPublicPayloadBytes) throw new Error(`public workout payload is ${payloadBytes} bytes, over ${maxPublicPayloadBytes}`);
  console.log(`Workout artwork check passed: ${assets.length} alpha WebPs, ${payloadBytes} runtime bytes, and deterministic hashes.`);
}

async function generatedFingerprints() {
  const paths = [manifestPath];
  for (const [slug, , folder] of assets) paths.push(join(assetRoot, 'masters', `${slug}.webp`), join(publicRoot, folder, `${slug}.webp`));
  return Promise.all(paths.map(async (path) => `${relative(path)}:${await hashFile(path)}`));
}

if (checkOnly) await validateManifest();
else {
  const manifest = await buildManifest(true);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await validateManifest();
  if (verifyIdempotence) {
    const first = await generatedFingerprints();
    const repeated = await buildManifest(true);
    await writeFile(manifestPath, `${JSON.stringify(repeated, null, 2)}\n`);
    await validateManifest();
    const second = await generatedFingerprints();
    if (first.join('\n') !== second.join('\n')) throw new Error('byte idempotence failed: a second generation changed output bytes');
    console.log('Workout artwork byte-idempotence check passed.');
  }
}
