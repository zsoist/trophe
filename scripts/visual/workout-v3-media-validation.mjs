import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function assertFileSha256(path, expectedHash, label) {
  const actualHash = sha256File(path);
  if (actualHash !== expectedHash) throw new Error(`${label} SHA-256 mismatch: manifest ${expectedHash}, actual ${actualHash}`);
  return actualHash;
}

export function runMediaTool(binary, args, purpose) {
  try {
    return execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${purpose} requires ${binary}, but it is not available on PATH. Install FFmpeg (including ffprobe) and rerun.`);
    }
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${purpose} failed for ${args.at(-1)}: ${detail}`);
  }
}

export function assertMediaToolsAvailable() {
  runMediaTool('ffmpeg', ['-version'], 'V3 media build');
  runMediaTool('ffprobe', ['-version'], 'V3 media verification');
}

export function assertDecodedMotion(path, expected) {
  const probe = JSON.parse(runMediaTool('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', path,
  ], 'V3 motion probe'));
  const stream = probe.streams?.[0];
  if (!stream) throw new Error(`V3 motion has no video stream: ${path}`);
  const [rateNumerator, rateDenominator] = String(stream.avg_frame_rate).split('/').map(Number);
  const frameRate = rateNumerator / rateDenominator;
  const frameCount = Number(stream.nb_read_frames);
  const duration = Number(probe.format?.duration);
  if (stream.codec_name !== 'vp9') throw new Error(`V3 motion must decode as VP9: ${path} reports ${stream.codec_name}`);
  if (stream.width !== expected.width || stream.height !== expected.height) throw new Error(`V3 motion must decode at ${expected.width}x${expected.height}: ${path} is ${stream.width}x${stream.height}`);
  if (frameRate !== expected.frameRate) throw new Error(`V3 motion must decode at ${expected.frameRate} fps: ${path} reports ${stream.avg_frame_rate}`);
  if (frameCount !== 4) throw new Error(`V3 motion must decode exactly four decoded frames: ${path} has ${frameCount}`);
  if (!Number.isFinite(duration) || Math.abs(duration - expected.durationSeconds) > 0.001) throw new Error(`V3 motion duration must be ${expected.durationSeconds}s: ${path} is ${probe.format?.duration}`);

  const frameMd5 = runMediaTool('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:v:0', '-f', 'framemd5', '-'], 'V3 decoded-frame verification');
  const hashes = frameMd5.split('\n')
    .filter((line) => /^\d+,\s*\d+,/.test(line))
    .map((line) => line.split(',').at(-1).trim());
  if (hashes.length !== 4) throw new Error(`V3 motion framemd5 must contain exactly four decoded frames: ${path} has ${hashes.length}`);
  if (new Set(hashes.slice(0, 3)).size !== 3) throw new Error(`V3 motion setup, work, and finish frames must be pairwise distinct: ${path}`);
  if (hashes[3] !== hashes[1]) throw new Error(`V3 motion fourth decoded frame must match work frame for setup→work→finish→work: ${path}`);
  return { codec: stream.codec_name, width: stream.width, height: stream.height, frameRate, durationSeconds: duration, decodedFrameHashes: hashes };
}
