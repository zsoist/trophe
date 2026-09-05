import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { validateMediaPackage, artifactSetHash } from '@/lib/workout/media-package';

const roots: string[] = [];
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'trophe-synthetic-media-')); roots.push(root);
  await mkdir(join(root, 'assets/synthetic-food'), { recursive: true });
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#808080' } }).png().toBuffer();
  const file = { path: 'assets/synthetic-food/poster.png', role: 'poster', mime_type: 'image/png', sha256: hash(bytes), bytes: bytes.length, width: 16, height: 16 };
  await writeFile(join(root, file.path), bytes);
  const pending = { status: 'pending', reviewer_role: null, reviewer_ref: null, reviewed_at: null, artifact_set_sha256: null };
  const manifest = { schema_version: 'trophe.media-package/1', release_id: 'synthetic-test-only', created_at: '2026-09-05T00:00:00Z', release_status: 'candidate', assets: [{ asset_id: 'synthetic-food', kind: 'food', canonical_name: 'Synthetic QA fixture', build_key: hash('fixture'), source_fingerprint: hash('source'), artifact_set_sha256: artifactSetHash([file]), food: { representation: 'illustrative', measurement_evidence_ref: null }, provenance: { method: 'procedural-authored', license_review_ref: 'synthetic-fixture', redistribution_reviewed: false }, reviews: { technical: { ...pending }, visual: { ...pending }, technique: { ...pending, status: 'not_applicable' } }, files: [file] }] };
  const save = () => writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await save(); return { root, manifest, file, save };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe('media package intake (synthetic fixtures only)', () => {
  it('accepts a decodable candidate without claiming approval', async () => { const f = await fixture(); expect((await validateMediaPackage(f.root)).release_status).toBe('candidate'); });
  it.each(['schema_version', 'extra'])('rejects invalid schema: %s', async key => { const f = await fixture(); Object.assign(f.manifest, { [key]: 'invalid' }); await f.save(); await expect(validateMediaPackage(f.root)).rejects.toThrow(/schema/i); });
  it.each(['/tmp/poster.png', '../poster.png', 'assets/../poster.png', 'assets/synthetic-food/run.sh'])('rejects unsafe/non-allowlisted path %s', async path => { const f = await fixture(); f.file.path = path; await f.save(); await expect(validateMediaPackage(f.root)).rejects.toThrow(); });
  it('rejects symlinks', async () => { const f = await fixture(); await rm(join(f.root, f.file.path)); await symlink('/etc/hosts', join(f.root, f.file.path)); await expect(validateMediaPackage(f.root)).rejects.toThrow(/symlink/i); });
  it.each(['sha256', 'bytes', 'mime_type', 'width'])('checks actual file %s', async key => { const f = await fixture(); Object.assign(f.file, { [key]: key === 'bytes' || key === 'width' ? 999 : key === 'sha256' ? hash('false') : 'image/webp' }); f.manifest.assets[0].artifact_set_sha256 = artifactSetHash([f.file]); await f.save(); await expect(validateMediaPackage(f.root)).rejects.toThrow(); });
  it('rejects duplicate asset IDs', async () => { const f = await fixture(); f.manifest.assets.push(structuredClone(f.manifest.assets[0])); await f.save(); await expect(validateMediaPackage(f.root)).rejects.toThrow(/duplicate/i); });
  it('rejects duplicate file roles', async () => { const f = await fixture(); f.manifest.assets[0].files.push({ ...f.file }); await f.save(); await expect(validateMediaPackage(f.root)).rejects.toThrow(/duplicate/i); });
  it('rejects undeclared payload files', async () => { const f = await fixture(); await writeFile(join(f.root, 'plugin.js'), 'throw new Error("must never execute")'); await expect(validateMediaPackage(f.root)).rejects.toThrow(/undeclared/i); });
  it('rejects reviews for different bytes', async () => { const f = await fixture(); Object.assign(f.manifest.assets[0].reviews.technical, { status: 'passed', reviewer_role: 'agent', reviewer_ref: 'ag2', reviewed_at: f.manifest.created_at, artifact_set_sha256: hash('other') }); await f.save(); await expect(validateMediaPackage(f.root)).rejects.toThrow(/review/i); });
  it('refuses to publish candidates or self-declared approval', async () => { const f = await fixture(); await expect(validateMediaPackage(f.root, { publication: true })).rejects.toThrow(/approv/i); });
  it('rejects unknown exercises and incompatible equipment', async () => { for (const [slug, equipment] of [['unknown', 'Dumbbell'], ['curl', 'Barbell']]) { const f = await fixture(); Object.assign(f.manifest.assets[0], { kind: 'exercise', canonical_name: 'Standing Dumbbell Biceps Curl', food: undefined, exercise: { catalogue_slug: slug, equipment, clip_ids: ['curl'], phases: [{ id: 'setup', start_seconds: 0, end_seconds: 1, label_key: 'workout.detail_phase_setup' }, { id: 'work', start_seconds: 1, end_seconds: 2, label_key: 'workout.detail_phase_work' }] } }); f.manifest.assets[0].reviews.technique.status = 'pending'; await f.save(); await expect(validateMediaPackage(f.root)).rejects.toThrow(/catalog|equipment/i); } });
});

it('cannot promote an approved-looking manifest without independent matching evidence', async () => {
  const f = await fixture(); f.manifest.release_status = 'approved'; f.manifest.assets[0].provenance.redistribution_reviewed = true;
  for (const [kind, role] of [['technical', 'agent'], ['visual', 'owner']] as const) Object.assign(f.manifest.assets[0].reviews[kind], { status: 'passed', reviewer_role: role, reviewer_ref: 'synthetic-test-only', reviewed_at: f.manifest.created_at, artifact_set_sha256: f.manifest.assets[0].artifact_set_sha256 });
  await f.save(); await expect(validateMediaPackage(f.root, { publication: true, evidence: { reviews: [], licenses: [] } })).rejects.toThrow(/independent review/i);
});

it('stages only synthetic approved test bytes with sanitized public metadata and refuses overwrite', async () => {
  const f = await fixture();
  const bytes = await sharp({ create: { width: 960, height: 540, channels: 3, background: '#808080' } }).png().toBuffer();
  Object.assign(f.file, { width: 960, height: 540, bytes: bytes.length, sha256: hash(bytes) });
  await writeFile(join(f.root, f.file.path), bytes);
  const asset = f.manifest.assets[0]; asset.artifact_set_sha256 = artifactSetHash([f.file]);
  f.manifest.release_status = 'approved'; asset.provenance.redistribution_reviewed = true;
  const reviews = [];
  for (const [kind, role] of [['technical', 'agent'], ['visual', 'owner']] as const) {
    Object.assign(asset.reviews[kind], { status: 'passed', reviewer_role: role, reviewer_ref: 'SYNTHETIC-NOT-A-HUMAN-APPROVAL', reviewed_at: f.manifest.created_at, artifact_set_sha256: asset.artifact_set_sha256 });
    reviews.push({ ...asset.reviews[kind], decision_source: 'synthetic test fixture only' });
  }
  await f.save();
  const evidenceDir = await mkdtemp(join(tmpdir(), 'trophe-synthetic-review-')); roots.push(evidenceDir);
  const evidencePath = join(evidenceDir, 'evidence.json');
  await writeFile(evidencePath, JSON.stringify({ reviews, licenses: [{ reference: 'synthetic-fixture', redistribution_allowed: true, artifact_set_sha256: asset.artifact_set_sha256, decision_source: 'synthetic test fixture only' }] }));
  const output = join(evidenceDir, 'release');
  const args = ['scripts/media/prepare-release.mjs', f.root, evidencePath, output];
  const result = JSON.parse(execFileSync(process.execPath, args).toString()); expect(result.published).toBe(false);
  const publishedMetadata = await readFile(join(output, 'public/workout-v4', asset.build_key, 'synthetic-food.manifest.json'), 'utf8');
  expect(publishedMetadata).not.toContain('reviewer'); expect(publishedMetadata).not.toContain('SYNTHETIC-NOT');
  expect(() => execFileSync(process.execPath, args, { stdio: 'pipe' })).toThrow();
});

it('rejects HD video dimensions below the publication profile even when metadata is honest', async () => {
  const f = await fixture();
  const poster = await sharp({ create: { width: 960, height: 540, channels: 3, background: '#808080' } }).png().toBuffer();
  Object.assign(f.file, { width: 960, height: 540, bytes: poster.length, sha256: hash(poster) }); await writeFile(join(f.root, f.file.path), poster);
  const videoPath = 'assets/synthetic-food/motion.mp4';
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=16x16:r=30:d=4', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', join(f.root, videoPath)]);
  const video = await readFile(join(f.root, videoPath));
  f.manifest.assets[0].files.push(Object.assign({ ...f.file }, { path: videoPath, role: 'video_hd', mime_type: 'video/mp4', width: 16, height: 16, bytes: video.length, sha256: hash(video), fps: 30, duration_seconds: 4, native_render: true, upscaled: false }));
  const asset = f.manifest.assets[0]; asset.artifact_set_sha256 = artifactSetHash(asset.files); asset.provenance.redistribution_reviewed = true; f.manifest.release_status = 'approved';
  for (const [kind, role] of [['technical', 'agent'], ['visual', 'owner']] as const) Object.assign(asset.reviews[kind], { status: 'passed', reviewer_role: role, reviewer_ref: 'SYNTHETIC-TEST', reviewed_at: f.manifest.created_at, artifact_set_sha256: asset.artifact_set_sha256 });
  await f.save();
  const evidence = { reviews: [asset.reviews.technical, asset.reviews.visual].map(r => ({ ...r, decision_source: 'synthetic fixture' })), licenses: [{ reference: 'synthetic-fixture', redistribution_allowed: true, artifact_set_sha256: asset.artifact_set_sha256, decision_source: 'synthetic fixture' }] };
  // Runtime evidence is deliberately serialized: no real approval is asserted by this fixture.
  await expect(validateMediaPackage(f.root, { publication: true, evidence: JSON.parse(JSON.stringify(evidence)) })).rejects.toThrow(/dimensions/i);
});
