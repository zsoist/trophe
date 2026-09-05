/** Private review sidecar, deliberately separate from the frozen publication schema. */
import { readFile, realpath, lstat } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export async function loadReviewEvidence(indexPath, records, assets) {
  if (!indexPath) return [];
  const root = await realpath(dirname(indexPath));
  assert((await lstat(indexPath)).size <= 262144, 'review index size limit');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  assert(index.version === 'trophe.private-review/1' && Array.isArray(index.items) && index.items.length <= 64, 'invalid private review index');
  let total = 0;
  const items = [];
  for (const [i, item] of index.items.entries()) {
    assert(typeof item.path === 'string' && !item.path.startsWith('/') && !item.path.includes('\\') && item.path.split('/').every(p => p && p !== '.' && p !== '..'), 'unsafe diagnostic path');
    const path = resolve(root, item.path);
    assert(await realpath(path) === path, 'diagnostic symlink forbidden');
    const stat = await lstat(path);
    assert(stat.isFile() && stat.size === item.bytes && stat.size <= 8 * 1024 * 1024, 'diagnostic size mismatch/limit');
    total += stat.size; assert(total <= 64 * 1024 * 1024, 'diagnostic total size limit');
    const bytes = await readFile(path); assert(hash(bytes) === item.sha256, 'diagnostic hash mismatch');
    const format = { '.png': ['png', 'image/png'], '.webp': ['webp', 'image/webp'], '.jpg': ['jpeg', 'image/jpeg'] }[extname(path)];
    assert(format, 'diagnostic image allowlist');
    const decoded = sharp(bytes, { limitInputPixels: 4096 * 4096 });
    assert((await decoded.metadata()).format === format[0], 'diagnostic MIME mismatch');
    await decoded.raw().toBuffer();
    assert(typeof item.label === 'string' && item.label.length <= 240 && typeof item.category === 'string' && item.category.length <= 80, 'diagnostic label/category required');
    if (item.source_kind === 'render_export') {
      assert(records.some(r => r.videoSha256 === item.source_sha256 && r.buildKey === item.build_key && r.releaseId === item.release_id && r.media.slug === item.asset_id), 'diagnostic source/build mismatch');
      assert((Number.isInteger(item.frame_index) && item.frame_index >= 0) || (Number.isFinite(item.pts_seconds) && item.pts_seconds >= 0), 'diagnostic index or PTS required');
      assert(typeof item.recipe_ref === 'string' && item.recipe_ref.trim() && item.recipe_ref.length <= 240, 'diagnostic recipe reference required');
    } else {
      assert(item.source_kind === 'screen_recording' && item.binding_status === 'unverified' && /^[a-f0-9]{64}$/.test(item.source_sha256) && Number.isFinite(item.recording_seconds) && item.recording_seconds >= 0, 'unlinked recording evidence must be explicit');
    }
    const url = `/_diagnostics/${i}${extname(path)}`;
    assets.set(url, { bytes, mime: format[1] });
    // Never expose a filesystem path or arbitrary sidecar keys in the browser.
    items.push({ url, label: item.label, category: item.category, sha256: item.sha256, sourceKind: item.source_kind, sourceSha256: item.source_sha256, buildKey: item.build_key, frameIndex: item.frame_index, ptsSeconds: item.pts_seconds, recipeRef: item.recipe_ref, recordingSeconds: item.recording_seconds });
  }
  return items;
}
