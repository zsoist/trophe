import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';
import { loadReviewEvidence } from '../../scripts/media/private-review-evidence.mjs';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'trophe-private-review-')); roots.push(root);
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#808080' } }).png().toBuffer();
  await writeFile(join(root, 'hand.png'), bytes);
  const item = { path: 'hand.png', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), label: 'Synthetic hand diagnostic', category: 'hands-before', source_kind: 'render_export', source_sha256: 'a'.repeat(64), build_key: 'b'.repeat(64), asset_id: 'curl', release_id: 'test', frame_index: 30, recipe_ref: 'synthetic export recipe' };
  const indexPath = join(root, 'index.json');
  const save = () => writeFile(indexPath, JSON.stringify({ version: 'trophe.private-review/1', items: [item] }));
  await save();
  return { root, item, save, indexPath, records: [{ videoSha256: item.source_sha256, buildKey: item.build_key, releaseId: 'test', media: { slug: 'curl' } }] };
}
it('loads only declared, hash-bound images without exposing filesystem paths', async () => {
  const f = await fixture(); const assets = new Map(); const items = await loadReviewEvidence(f.indexPath, f.records, assets);
  expect(assets.size).toBe(1); expect(items[0].frameIndex).toBe(30); expect(items[0]).not.toHaveProperty('path'); expect(JSON.stringify(items)).not.toContain(f.root);
});
it.each(['source_sha256','build_key','asset_id','release_id','sha256'])('rejects mismatched %s instead of matching by exercise name', async key => {
  const f = await fixture(); Object.assign(f.item, { [key]: 'wrong' }); await f.save(); await expect(loadReviewEvidence(f.indexPath, f.records, new Map())).rejects.toThrow(/mismatch/);
});
it('rejects traversal and symlinks', async () => {
  const f = await fixture(); f.item.path = '../hand.png'; await f.save(); await expect(loadReviewEvidence(f.indexPath, f.records, new Map())).rejects.toThrow(/unsafe/);
  await symlink(join(f.root,'hand.png'), join(f.root,'linked.png')); f.item.path = 'linked.png'; await f.save(); await expect(loadReviewEvidence(f.indexPath, f.records, new Map())).rejects.toThrow(/symlink/);
});
it('requires an export index/PTS and recipe', async () => {
  const f = await fixture(); Object.assign(f.item, { frame_index: undefined }); await f.save(); await expect(loadReviewEvidence(f.indexPath, f.records, new Map())).rejects.toThrow(/index or PTS/);
});
it('allows explicitly unlinked recording evidence without attributing it to a render', async () => {
  const f = await fixture(); Object.assign(f.item, { source_kind: 'screen_recording', binding_status: 'unverified', recording_seconds: 5, source_sha256: 'c'.repeat(64) }); await f.save();
  const items = await loadReviewEvidence(f.indexPath, f.records, new Map()); expect(items[0].sourceKind).toBe('screen_recording'); expect(items[0].recordingSeconds).toBe(5);
});
