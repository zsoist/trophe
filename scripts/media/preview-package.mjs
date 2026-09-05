#!/usr/bin/env node
/** Loopback-only reviewer tool. Does not deploy or expose candidate files in public/. */
import { tsImport } from 'tsx/esm/api';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { privateByteRange } from './private-byte-range.mjs';
import { loadReviewEvidence } from './private-review-evidence.mjs';
const [packagePath, ...args] = process.argv.slice(2);
let beforePath, evidencePath;
while (args.length) {
  const flag = args.shift(); const value = args.shift();
  if (!value || !['--before', '--review-evidence'].includes(flag)) throw new Error('Invalid private preview option');
  if (flag === '--before') beforePath = value; else evidencePath = value;
}
if (!packagePath) { console.error('Usage: node scripts/media/preview-package.mjs PRIVATE_PACKAGE'); process.exit(2); }
const { validateMediaPackage } = await tsImport('../../lib/workout/media-package.ts', import.meta.url);
const root = resolve(new URL('../..', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'trophe-local-preview-'));
const assets = new Map();
const records = [];
let snapshotBytes = 0;
for (const [index, directory] of [beforePath, packagePath].filter(Boolean).entries()) {
  const manifestBytes = await readFile(join(directory, 'manifest.json'));
  const manifest = await validateMediaPackage(directory);
  if (!(await readFile(join(directory, 'manifest.json'))).equals(manifestBytes)) throw new Error('Manifest changed during validation');
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  const prefix = `/_candidate/${index}/`;
  for (const asset of manifest.assets) {
    for (const file of asset.files) {
      const bytes = await readFile(join(directory, file.path));
      if (createHash('sha256').update(bytes).digest('hex') !== file.sha256 || bytes.length !== file.bytes) throw new Error('Source changed after validation');
      snapshotBytes += bytes.length;
      if (snapshotBytes > 64 * 1024 * 1024) throw new Error('Private preview snapshot size limit');
      assets.set(prefix + file.path, { bytes, mime: file.mime_type });
    }
    const hd = asset.files.find(f => f.role === 'video_hd');
    records.push({ releaseId: manifest.release_id, releaseStatus: manifest.release_status, buildKey: asset.build_key, manifestSha256, videoSha256: hd?.sha256, duration: hd?.duration_seconds ?? 0, label: beforePath && index === 0 ? 'Before' : 'Candidate', media: { slug: asset.asset_id, canonicalNames: [asset.canonical_name], equipment: asset.exercise ? [asset.exercise.equipment] : [], posterSrc: prefix + asset.files.find(f => f.role === 'poster').path, motionSrc: hd ? prefix + hd.path : undefined, motionType: hd?.mime_type, tier: 'candidate-preview', activations: [], phases: [], timedPhases: asset.exercise?.phases.map(p => ({ id: p.id, startSeconds: p.start_seconds, endSeconds: p.end_seconds, labelKey: p.label_key })), provenance: { kind: 'sourced', source: 'local candidate', reviewedOn: '' } } });
  }
}
const diagnostics = await loadReviewEvidence(evidencePath, records, assets);
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PrivateReview} from './scripts/media/private-review'; import {I18nProvider} from './lib/i18n'; createRoot(document.getElementById('root')).render(<I18nProvider><PrivateReview records={${JSON.stringify(records)}} diagnostics={${JSON.stringify(diagnostics)}} /></I18nProvider>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'esm', splitting: true, outdir: temp, jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
for (const file of bundle.outputFiles) assets.set('/_preview/' + file.path.slice(temp.length + 1), { bytes: file.contents, mime: 'text/javascript' });
const css = `:root{color-scheme:dark;--bg:#171a1a;--text:#f1f3ee;--line:#67726b}:root.light{color-scheme:light;--bg:#f5f4ee;--text:#202923;--line:#7b857c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px system-ui}main{max-width:1000px;margin:auto;padding:16px}button,select{font:inherit;padding:10px;margin:4px;border:1px solid var(--line);border-radius:6px}section{margin-block:24px}h1{font-size:26px}h2{font-size:22px}.identity{font-size:12px;overflow-wrap:anywhere}.identity dd{margin:0 0 6px}.identity dt{font-weight:700}.review-viewport{max-height:62vh;overflow:auto;border:1px solid var(--line);touch-action:pan-x pan-y}.review-scale{width:100%}.review-scale-2{width:200%}.review-scale-3{width:300%}.review-scale-4{width:400%}.exercise-motion{margin:0}.exercise-motion__video,.exercise-motion__poster{display:block;width:100%;max-width:none}.exercise-motion__controls{display:none}.review-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-block:12px}.review-toolbar label{display:flex;gap:6px;align-items:center;flex-wrap:wrap}input[type=range]{max-width:100%;width:220px}details{border-top:1px solid var(--line);padding-block:16px}.diagnostics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:16px}.diagnostics figure{margin:0;overflow-wrap:anywhere;font-size:12px}.diagnostics img{width:100%;height:auto}summary{cursor:pointer;padding:12px}a{color:inherit}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid currentColor}`;
assets.set('/_preview/style.css', { bytes: Buffer.from(css), mime: 'text/css' });
assets.set('/', { bytes: Buffer.from('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Trophe local candidate review</title><link rel="stylesheet" href="/_preview/style.css"></head><body><div id="root"></div><script type="module" src="/_preview/stdin.js"></script></body></html>'), mime: 'text/html' });
const server = createServer((req, res) => {
  const host = `127.0.0.1:${server.address().port}`;
  if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) || !['GET','HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
  const asset = assets.get(req.url);
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (!asset) { res.writeHead(404); res.end(); return; }
  if (asset.mime.startsWith('video/')) {
    res.setHeader('Accept-Ranges', 'bytes');
    try {
      const range = privateByteRange(req.headers.range, asset.bytes.length);
      if (range) {
        res.writeHead(206, { 'Content-Type': asset.mime, 'Content-Length': range.end - range.start + 1, 'Content-Range': `bytes ${range.start}-${range.end}/${asset.bytes.length}` });
        res.end(req.method === 'HEAD' ? undefined : asset.bytes.subarray(range.start, range.end + 1)); return;
      }
    } catch { res.writeHead(416, { 'Content-Range': `bytes */${asset.bytes.length}` }); res.end(); return; }
  }
  res.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': asset.bytes.length }); res.end(req.method === 'HEAD' ? undefined : asset.bytes);
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ preview: `http://127.0.0.1:${server.address().port}`, release_ids: records.map(r => r.releaseId), published: false, protection: 'loopback bind, exact Host/Origin, allowlisted in-memory files, no-store' })));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
