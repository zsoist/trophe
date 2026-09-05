#!/usr/bin/env node
/** Loopback-only reviewer tool. Does not deploy or expose candidate files in public/. */
import { tsImport } from 'tsx/esm/api';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const [packagePath] = process.argv.slice(2);
if (!packagePath) { console.error('Usage: node scripts/media/preview-package.mjs PRIVATE_PACKAGE'); process.exit(2); }
const { validateMediaPackage } = await tsImport('../../lib/workout/media-package.ts', import.meta.url);
const manifest = await validateMediaPackage(packagePath);
const root = resolve(new URL('../..', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'trophe-local-preview-'));
const assets = new Map();
for (const asset of manifest.assets) for (const file of asset.files) {
  const bytes = await readFile(join(packagePath, file.path));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256 || bytes.length !== file.bytes) throw new Error('Source changed after validation');
  assets.set('/' + file.path, { bytes, mime: file.mime_type });
}
const records = manifest.assets.map(asset => ({ slug: asset.asset_id, canonicalNames: [asset.canonical_name], equipment: asset.exercise ? [asset.exercise.equipment] : [], posterSrc: '/' + asset.files.find(f => f.role === 'poster').path, motionSrc: asset.files.find(f => f.role === 'video_hd') ? '/' + asset.files.find(f => f.role === 'video_hd').path : undefined, motionType: asset.files.find(f => f.role === 'video_hd')?.mime_type, mobileMotionSrc: asset.files.find(f => f.role === 'video_mobile') ? '/' + asset.files.find(f => f.role === 'video_mobile').path : undefined, mobileMotionType: asset.files.find(f => f.role === 'video_mobile')?.mime_type, tier: 'candidate-preview', activations: [], phases: [], timedPhases: asset.exercise?.phases.map(p => ({ id: p.id, startSeconds: p.start_seconds, endSeconds: p.end_seconds, labelKey: p.label_key })), provenance: { kind: 'sourced', source: 'local candidate', reviewedOn: '' } }));
const bundle = await build({ stdin: { contents: `import React, { useState } from 'react'; import {createRoot} from 'react-dom/client'; import {ExerciseMotion} from './components/workout/ExerciseMotion'; import {I18nProvider,useI18n} from './lib/i18n'; const records=${JSON.stringify(records)}; function App(){const [paused,setPaused]=useState(false); const {setLang}=useI18n(); return <main><h1>Local candidate review</h1><p>Generic candidate — not approved technique. No workout data or production writes.</p><select aria-label="Locale" onChange={e=>setLang(e.target.value)}>{['en','es','el','fr','de','it','pt','nl'].map(x=><option key={x}>{x}</option>)}</select><button onClick={()=>setPaused(!paused)}>Toggle session pause</button><button onClick={()=>document.documentElement.classList.toggle('light')}>Toggle theme</button>{records.map(media=><section key={media.slug}><h2>{media.canonicalNames[0]}</h2><ExerciseMotion media={media} alt={'Candidate: '+media.canonicalNames[0]} previewOnly playbackDisabled={paused}/></section>)}</main>} createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'esm', splitting: true, outdir: temp, jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
for (const file of bundle.outputFiles) assets.set('/_preview/' + file.path.slice(temp.length + 1), { bytes: file.contents, mime: 'text/javascript' });
const css = `:root{color-scheme:dark;--bg:#171a1a;--text:#f1f3ee;--line:#67726b} :root.light{color-scheme:light;--bg:#f5f4ee;--text:#202923;--line:#7b857c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px system-ui}main{max-width:900px;margin:auto;padding:20px}button,select{font:inherit;padding:12px;margin:4px;border:1px solid var(--line);border-radius:8px}section{margin-block:24px}h1{font-size:28px}h2{font-size:22px}.exercise-motion{margin:0}.exercise-motion__video,.exercise-motion__poster{width:100%;max-height:60vh;object-fit:contain}.exercise-motion__controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.exercise-motion__controls span{font-size:14px}`;
assets.set('/_preview/style.css', { bytes: Buffer.from(css), mime: 'text/css' });
assets.set('/', { bytes: Buffer.from('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Trophe local candidate review</title><link rel="stylesheet" href="/_preview/style.css"></head><body><div id="root"></div><script type="module" src="/_preview/stdin.js"></script></body></html>'), mime: 'text/html' });
const server = createServer((req, res) => {
  const host = `127.0.0.1:${server.address().port}`;
  if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) || !['GET','HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
  const asset = assets.get(req.url);
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': asset.bytes.length }); res.end(req.method === 'HEAD' ? undefined : asset.bytes);
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ preview: `http://127.0.0.1:${server.address().port}`, release_id: manifest.release_id, published: false, protection: 'loopback bind, exact Host/Origin, allowlisted in-memory files, no-store' })));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
