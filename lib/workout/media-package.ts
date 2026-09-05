/** Operator-only intake. Never import this module into a client component. */
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import sharp from 'sharp';
import schema from '@/contracts/media/v1/manifest.schema.json';
import { EXERCISE_MEDIA_REGISTRY } from './exercise-media';

export interface MediaFile {
  path: string; role: 'poster' | 'video_hd' | 'video_mobile' | 'model_glb';
  mime_type: string; sha256: string; bytes: number; width?: number; height?: number;
  fps?: number; duration_seconds?: number; native_render?: boolean; upscaled?: boolean;
}
export interface MediaReview {
  status: 'pending' | 'passed' | 'rejected' | 'not_applicable';
  reviewer_role: 'agent' | 'owner' | 'coach' | 'physio' | null;
  reviewer_ref: string | null; reviewed_at: string | null; artifact_set_sha256: string | null;
}
export interface MediaAsset {
  asset_id: string; kind: 'exercise' | 'food' | 'equipment'; canonical_name: string;
  build_key: string; source_fingerprint: string; artifact_set_sha256: string;
  exercise?: { catalogue_slug: string; equipment: string; clip_ids: string[]; phases: Array<{ id: string; start_seconds: number; end_seconds: number; label_key: string }> };
  provenance: { method: string; license_review_ref: string; redistribution_reviewed: boolean };
  reviews: Record<'technical' | 'visual' | 'technique', MediaReview>; files: MediaFile[];
}
export interface MediaPackage { schema_version: 'trophe.media-package/1'; release_id: string; created_at: string; release_status: 'candidate' | 'approved'; assets: MediaAsset[] }
/** Loaded separately by the operator from reviews/, never from the untrusted package. */
export interface PublicationEvidence {
  reviews: Array<MediaReview & { decision_source: string }>;
  licenses: Array<{ reference: string; redistribution_allowed: true; artifact_set_sha256: string; decision_source: string }>;
}
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const matchesSchema = ajv.compile(schema);
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
/** UTF-8 JSON array, keys path/sha256/bytes in this order, paths sorted by ASCII. */
export function artifactSetHash(files: Pick<MediaFile, 'path' | 'sha256' | 'bytes'>[]): string {
  return sha256(JSON.stringify([...files].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))));
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const formats: Record<string, [string, string[]]> = {
  '.png': ['image/png', ['poster']], '.webp': ['image/webp', ['poster']],
  '.mp4': ['video/mp4', ['video_hd', 'video_mobile']], '.webm': ['video/webm', ['video_hd', 'video_mobile']],
  '.glb': ['model/gltf-binary', ['model_glb']],
};
async function inventory(root: string, dir = root, depth = 0): Promise<string[]> {
  assert(depth <= 5, 'payload directory depth limit');
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name); assert(!entry.isSymbolicLink(), 'symlink forbidden');
    if (entry.isDirectory()) files.push(...await inventory(root, path, depth + 1));
    else { assert(entry.isFile(), 'non-regular payload'); files.push(relative(root,path)); }
    assert(files.length <= 301, 'payload file limit');
  }
  return files;
}
async function probeFile(root: string, file: MediaFile, publication: boolean) {
  const format = formats[extname(file.path)];
  assert(format && format[0] === file.mime_type && format[1].includes(file.role), 'file allowlist or MIME mismatch');
  const path = resolve(root, file.path); assert(path.startsWith(root + '/'), 'path escape');
  assert(await realpath(path) === path, 'symlink forbidden');
  const stat = await lstat(path); assert(stat.isFile() && stat.size === file.bytes, 'file bytes mismatch');
  assert(stat.size <= 16 * 1024 * 1024, 'derivative exceeds intake size cap');
  const bytes = await readFile(path); assert(sha256(bytes) === file.sha256, 'file hash mismatch');
  if (file.role === 'poster') {
    const metadata = await sharp(bytes, { limitInputPixels: 8192 * 8192 }).metadata();
    assert(metadata.format === extname(file.path).slice(1), 'binary MIME mismatch');
    assert(metadata.width === file.width && metadata.height === file.height, 'poster dimensions mismatch');
    await sharp(bytes, { limitInputPixels: 8192 * 8192 }).raw().toBuffer();
    if (publication) assert(file.bytes <= 150_000 && file.width === 960 && file.height === 540, 'poster publication budget');
  } else if (file.role === 'model_glb') {
    // Fail closed until deformable geometry validation and device budgets are implemented.
    assert(bytes.subarray(0,4).toString() === 'glTF', 'binary MIME mismatch');
    throw new Error('GLB intake held: deformable geometry validator/device QA required');
  } else {
    const mp4 = bytes.subarray(4,8).toString() === 'ftyp';
    const webm = bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
    assert(file.mime_type === 'video/mp4' ? mp4 : webm, 'binary MIME mismatch');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',path], { timeout: 15000, maxBuffer: 1024 * 1024 }).toString());
    const streams = probe.streams as Array<{ codec_type: string; codec_name: string; width: number; height: number; avg_frame_rate: string }>;
    const video = streams.find(s => s.codec_type === 'video');
    assert(video && streams.length === 1, 'exactly one video stream, no audio/data');
    assert(file.mime_type === 'video/mp4' ? video.codec_name === 'h264' : ['vp8','vp9','av1'].includes(video.codec_name), 'unsupported video codec');
    const [num, den] = video.avg_frame_rate.split('/').map(Number); const fps = num / den;
    const duration = Number(probe.format.duration);
    assert(video.width === file.width && video.height === file.height && Math.abs(fps - (file.fps ?? 0)) < 0.05 && Math.abs(duration - (file.duration_seconds ?? 0)) < 0.1, 'video probe metadata mismatch');
    if (publication) assert(file.width === (file.role === 'video_hd' ? 1920 : 1280) && file.height === (file.role === 'video_hd' ? 1080 : 720), 'video publication dimensions');
    if (publication) assert(file.bytes <= 4_000_000 && fps >= 29.9 && fps <= 30.1 && duration >= 4 && duration <= 8 && file.upscaled === false && file.native_render === true, 'video publication budget');
    // Admit bounded metadata before decoding. Publication must reach EOF: no -t/-frames cutoff.
    assert(video.width <= 1920 && video.height <= 1080 && fps > 0 && fps <= 60 && duration > 0 && duration <= 8, 'video decode resource cap');
    execFileSync('ffmpeg', ['-v','error','-xerror','-err_detect','explode','-threads','1','-filter_threads','1','-protocol_whitelist','file','-i',path,...(publication ? [] : ['-t','1']),'-f','null','-'], { timeout: 15000, maxBuffer: 1024 * 1024, stdio: 'pipe' });
  }
}
export async function validateMediaPackage(directory: string, options: { publication?: boolean; evidence?: PublicationEvidence } = {}): Promise<MediaPackage> {
  const root = await realpath(directory); const payload = await inventory(root);
  const manifestPath = join(root, 'manifest.json'); assert((await lstat(manifestPath)).size <= 1024 * 1024, 'manifest size cap');
  const input: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert(matchesSchema(input), 'schema validation failed: ' + ajv.errorsText(matchesSchema.errors));
  const manifest = input as unknown as MediaPackage; const ids = new Set<string>(); const paths = new Set(['manifest.json']);
  if (options.publication) assert(manifest.release_status === 'approved' && options.evidence, 'independent approval evidence required');
  for (const asset of manifest.assets) {
    assert(!ids.has(asset.asset_id), 'duplicate asset ID'); ids.add(asset.asset_id);
    const roles = new Set<string>();
    for (const file of asset.files) {
      assert(!paths.has(file.path) && !roles.has(file.role), 'duplicate file path/role'); paths.add(file.path); roles.add(file.role);
      assert(file.path.startsWith(`assets/${asset.asset_id}/`) && !file.path.split('/').some(p => p === '.' || p === '..' || !p), 'asset path mismatch');
    }
    if (asset.kind === 'exercise') {
      const ex = asset.exercise!; const canonical = EXERCISE_MEDIA_REGISTRY.find(r => r.slug === ex.catalogue_slug);
      assert(canonical && canonical.canonicalNames.includes(asset.canonical_name) && canonical.equipment.includes(ex.equipment), 'catalogue/equipment mismatch');
      assert(asset.asset_id === ex.catalogue_slug, 'catalogue asset ID mismatch');
      const duration = asset.files.find(f => f.role === 'video_hd')?.duration_seconds;
      assert(duration && roles.has('poster'), 'exercise requires poster/video_hd');
      const mobileDuration = asset.files.find(f => f.role === 'video_mobile')?.duration_seconds;
      assert(mobileDuration === undefined || Math.abs(mobileDuration - duration) < 0.1, 'mobile/HD timeline mismatch');
      let end = 0; const phaseIds = new Set<string>();
      for (const phase of ex.phases) {
        assert(!phaseIds.has(phase.id) && phase.start_seconds >= end && phase.end_seconds > phase.start_seconds && phase.end_seconds <= Math.min(duration, mobileDuration ?? duration), 'invalid phases');
        assert(['workout.detail_phase_setup', 'workout.detail_phase_work', 'workout.detail_phase_finish'].includes(phase.label_key), 'phase i18n key invalid');
        end = phase.end_seconds; phaseIds.add(phase.id);
      }
    }
    assert(roles.has('poster'), 'poster required');
    const mobile = asset.files.find(f => f.role === 'video_mobile');
    if (options.publication && mobile) assert(mobile.bytes < (asset.files.find(f => f.role === 'video_hd')?.bytes ?? 0), 'mobile must be smaller than HD');
    assert(asset.artifact_set_sha256 === artifactSetHash(asset.files), 'artifact roster hash mismatch');
    for (const [kind, review] of Object.entries(asset.reviews)) {
      if (review.status === 'passed') {
        assert(review.artifact_set_sha256 === asset.artifact_set_sha256, 'review hash mismatch');
        if (options.publication) assert(options.evidence?.reviews.some(r => r.status === 'passed' && r.reviewer_ref === review.reviewer_ref && r.reviewer_role === review.reviewer_role && r.reviewed_at === review.reviewed_at && r.artifact_set_sha256 === review.artifact_set_sha256 && r.decision_source.trim()), 'independent review record missing: ' + kind);
      }
    }
    if (options.publication) assert(options.evidence?.licenses.some(l => l.reference === asset.provenance.license_review_ref && l.redistribution_allowed === true && l.artifact_set_sha256 === asset.artifact_set_sha256 && l.decision_source.trim()), 'independent license record missing');
    for (const file of asset.files) await probeFile(root, file, Boolean(options.publication));
  }
  assert(payload.length === paths.size && payload.every(p => paths.has(p)), 'undeclared payload file');
  return manifest;
}
