/** Private local QA of the actual product component; no atlas copied to public/. */
import { readFile, mkdtemp, stat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { tsImport } from "tsx/esm/api";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const exportAt = process.argv.indexOf("--export-review");
const exportDirectory =
  exportAt >= 0 ? resolve(process.argv[exportAt + 1]) : null;
const directory = resolve(process.argv[2]);
const root = resolve(new URL("../..", import.meta.url).pathname);
const { validateAtlas } = await tsImport(
  "../../lib/anatomy/validation.ts",
  import.meta.url,
);
const codeSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (
  exportDirectory &&
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
)
  throw Error("Commit review code before exporting an exact-SHA deployment");
const light = process.argv.includes("--light");
const authoredAt = process.argv.indexOf("--authored");
const authoredPath =
  authoredAt < 0 ? null : resolve(process.argv[authoredAt + 1]);
const { validateAuthored } = await tsImport(
  "../../lib/anatomy/authored.ts",
  import.meta.url,
);
const authoredSupplement = authoredPath
  ? validateAuthored(JSON.parse(await readFile(authoredPath, "utf8")))
  : undefined;
const manifestBytes = await readFile(join(directory, "manifest.json"));
if (manifestBytes.length > 8 * 1024 * 1024) throw Error("Manifest cap");
const manifest = validateAtlas(JSON.parse(manifestBytes));
const assets = new Map();
assets.set("/anatomy/muscle-atlas-mark.webp", {
  bytes: await readFile(join(root, "public/anatomy/muscle-atlas-mark.webp")),
  mime: "image/webp",
});
// Serve only media resolved by the production catalogue; never candidate or AG2 review media.
const { resolveExerciseMedia } = await tsImport('../../lib/workout/exercise-media.ts', import.meta.url);
const { ATLAS_EXERCISES } = await tsImport('../../lib/anatomy/exercises.ts', import.meta.url);
for (const exercise of ATLAS_EXERCISES) {
  const media = resolveExerciseMedia({ name: exercise.name, equipment: exercise.equipment, muscleGroup: exercise.muscle_group });
  for (const url of [media.posterSrc, media.motionSrc, media.mobileMotionSrc].filter(Boolean)) {
    if (!/^\/workout(?:-v[23])?\//.test(url) || url.includes('..')) throw Error('Unexpected catalogue media path');
    const extension = url.split('.').at(-1);
    const mime = { webp: 'image/webp', svg: 'image/svg+xml', webm: 'video/webm', mp4: 'video/mp4' }[extension];
    if (!mime) throw Error('Unexpected catalogue media type');
    assets.set(url, { bytes: await readFile(join(root, 'public', url)), mime });
  }
}
const styles = await postcss([tailwind({ base: root })]).process(await readFile(join(root, 'app/globals.css'), 'utf8'), { from: join(root, 'app/globals.css') });
assets.set('/_qa/workout.css', { bytes: Buffer.from(styles.css), mime: 'text/css' });
assets.set('/device-check.txt', { bytes: await readFile(join(root, 'tools/anatomy/workout-review/DEVICE_CHECK.md')), mime: 'text/plain; charset=utf-8' });
assets.set('/sprite.svg', { bytes: await readFile(join(root, 'public/sprite.svg')), mime: 'image/svg+xml' });
const fontDirectory = join(root, 'public/fonts/workout-review');
const fontSources = JSON.parse(await readFile(join(fontDirectory, 'sources.json'), 'utf8'));
for (const font of fontSources.fonts) assets.set('/fonts/workout-review/' + font.file, { bytes: await readFile(join(fontDirectory, font.file)), mime: 'font/woff2' });
assets.set('/fonts/workout-review/fonts.css', { bytes: await readFile(join(fontDirectory, 'fonts.css')), mime: 'text/css' });
for (const file of ['inter-OFL.txt', 'instrumentserif-OFL.txt', 'jetbrainsmono-OFL.txt']) assets.set('/fonts/workout-review/' + file, { bytes: await readFile(join(fontDirectory, file)), mime: 'text/plain' });
const prefix = `/anatomy/${manifest.release}/`;
if (authoredSupplement) {
  if (authoredSupplement.baseRelease !== manifest.release)
    throw Error("Authored base release mismatch");
  const c = authoredSupplement.chunk;
  assets.set(c.url, {
    path: join(dirname(authoredPath), "authored-core.glb"),
    sha256: c.sha256,
    size: c.bytes,
    mime: "model/gltf-binary",
  });
}
assets.set(prefix + "manifest.json", {
  bytes: manifestBytes,
  mime: "application/json",
});
for (const c of manifest.chunks) {
  const path = join(directory, c.id + ".glb");
  if ((await stat(path)).size !== c.bytes) throw Error("Chunk size");
  assets.set(c.url, {
    path,
    sha256: c.sha256,
    mime: "model/gltf-binary",
    size: c.bytes,
  });
}
if (manifest.poster)
  assets.set(manifest.poster.url, {
    path: join(
      directory,
      manifest.poster.mime === "image/jpeg" ? "poster.jpg" : "poster.png",
    ),
    sha256: manifest.poster.sha256,
    mime: manifest.poster.mime,
    size: manifest.poster.bytes,
  });
const temp = await mkdtemp(join(directory, "preview-"));
const result = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {PrivateAtlasReview} from './tools/anatomy/private-review';import {I18nProvider} from './lib/i18n';import {ThemeModeProvider} from './components/shared/ThemeMode';createRoot(document.getElementById('root')).render(<I18nProvider defaultLang="en"><ThemeModeProvider><PrivateAtlasReview manifestUrl="${prefix}manifest.json" authoredSupplement={${JSON.stringify(authoredSupplement) ?? "undefined"}} identity={${JSON.stringify({ codeSha, manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"), release: manifest.release, authoredSha256: authoredSupplement?.chunk.sha256 ?? null })}}/></ThemeModeProvider></I18nProvider>);`,
    resolveDir: root,
    loader: "tsx",
  },
  plugins: [{ name: 'private-workout-boundaries', setup(build) {
    const aliases = {
      'next/navigation': 'navigation.tsx', 'next/link': 'navigation.tsx',
      '@/lib/supabase': 'supabase.ts',
      '@/lib/trpc/client': 'trpc.ts',
      '@/components/workout/workout-persistence': 'persistence.ts',
      '@/lib/workout/analytics-data': 'analytics.ts',
    };
    build.onResolve({ filter: /^(next\/(navigation|link)|@\/lib\/(supabase|trpc\/client|workout\/analytics-data)|@\/components\/workout\/workout-persistence)$/ }, args => ({ path: join(root, 'tools/anatomy/workout-review', aliases[args.path]) }));
  } }],
  metafile: true,
  bundle: true,
  write: false,
  format: "esm",
  splitting: true,
  outdir: temp,
  jsx: "automatic",
  minify: true,
  define: {
    // Standalone review has no Next runtime or host environment. Only explicit
    // public flags below are available; never serialize the process environment.
    "process.env": "{}",
    "process.env.NODE_ENV": '"production"',
    "process.env.__NEXT_IMAGE_OPTS": "undefined",
    "process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED": '"false"',
    "process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED": '"0"',
    "process.env.NEXT_PUBLIC_COACH_ASSISTANT_ENABLED": '"0"',
  },
});
if (Object.keys(result.metafile.inputs).some(path => path.includes('@supabase/') || path.includes('@trpc/'))) throw Error('Private export must not bundle account data clients');
for (const f of result.outputFiles)
  assets.set("/_qa/" + f.path.slice(temp.length + 1), {
    bytes: f.contents,
    mime: f.path.endsWith(".css") ? "text/css" : "text/javascript",
  });
assets.set("/_qa/theme.css", {
  bytes: Buffer.from(
    ":root{--font-inter:Inter,system-ui,sans-serif;--font-instrument-serif:'Instrument Serif',Georgia,serif;--font-jetbrains-mono:'JetBrains Mono',monospace}.private-device-review{padding:8px 16px;border-bottom:1px solid var(--border-default);color:var(--content-secondary);font-size:12px}.private-device-review>details>summary{min-height:28px;cursor:pointer}.private-device-review>details>p{margin:12px 0;max-width:65ch}.private-review-language{display:flex;align-items:center;gap:12px;margin:12px 0}.private-review-language select,.private-device-review select{color:var(--content-primary);background:var(--surface-raised);border:1px solid var(--border-default);border-radius:8px;padding:6px 10px}.private-device-review pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.private-device-review button,.private-device-review select{min-height:44px}.private-review-switch{display:flex;flex-wrap:wrap;gap:8px}.private-review-switch button{border:1px solid var(--border-default);border-radius:8px;padding:8px 12px;color:var(--content-primary);background:var(--surface-raised)}body{margin:0;font-family:var(--font-inter);background:var(--bg-primary);color:var(--content-primary)}button,input{font:inherit}",
  ),
  mime: "text/css",
});
assets.set("/", {
  bytes: Buffer.from(
    '<!doctype html><html lang="en" class="' +
      (light ? "light" : "") +
      '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Trophē · Workout design preview</title><link rel="stylesheet" href="/fonts/workout-review/fonts.css"><link rel="stylesheet" href="/_qa/workout.css"><link rel="stylesheet" href="/_qa/theme.css"><link rel="stylesheet" href="/_qa/stdin.css"></head><body><div id="root"></div><script type="module" src="/_qa/stdin.js"></script></body></html>',
  ),
  mime: "text/html",
});
if (exportDirectory) {
  const output = join(exportDirectory, ".vercel/output"),
    staticRoot = join(output, "static");
  await mkdir(staticRoot, { recursive: true });
  const routes = [],
    records = [];
  for (const [url, asset] of assets) {
    const bytes = asset.bytes ?? (await readFile(asset.path));
    if (
      asset.path &&
      (bytes.length !== asset.size ||
        createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    )
      throw Error("Source changed");
    const file = url === "/" ? "index.html" : url.slice(1),
      path = join(staticRoot, file);
    await mkdir(dirname(path), { recursive: true });
    const compressed = asset.mime.startsWith('video/') ? bytes : gzipSync(bytes);
    await writeFile(path, compressed);
    records.push({
      url,
      bytes: bytes.length,
      transferBytes: compressed.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    routes.push({
      src: "^" + url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
      dest: "/" + file,
      headers: {
        "Content-Type": asset.mime,
        ...(asset.mime.startsWith("video/") ? {} : { "Content-Encoding": "gzip" }),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      },
    });
  }
  await writeFile(
    join(output, "config.json"),
    JSON.stringify({ version: 3, routes }),
  );
  await writeFile(
    join(exportDirectory, "review-export.json"),
    JSON.stringify(
      {
        codeSha,
        workoutPreview: { components: 'Production WorkoutHome, builder, review, browser, detail, live, history and analytics', data: 'Isolated example records in browser session storage; no account writes', persistence: 'Private export alias; production backend unchanged', css: 'Compiled app/globals.css with project Tailwind' },
        authoredSupplement: authoredSupplement
          ? {
              sha256: authoredSupplement.chunk.sha256,
              recipeSha256: authoredSupplement.recipeSha256,
              author: authoredSupplement.author,
            }
          : null,
        release: manifest.release,
        manifestSha256: createHash("sha256")
          .update(manifestBytes)
          .digest("hex"),
        records,
        protection_required:
          "Existing Vercel SSO protection, preview only; do not promote this diagnostic deployment",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      exportDirectory,
      files: records.length,
      bytes: records.reduce((n, r) => n + r.transferBytes, 0),
      deployment: "not performed",
    }),
  );
  process.exit(0);
}
let active = 0;
const server = createServer(async (req, res) => {
  const host = `127.0.0.1:${server.address().port}`;
  if (
    req.headers.host !== host ||
    (req.headers.origin && req.headers.origin !== `http://${host}`) ||
    !["GET", "HEAD"].includes(req.method)
  ) {
    res.writeHead(403).end();
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  const asset = assets.get(req.url);
  if (!asset) {
    res.writeHead(404).end();
    return;
  }
  if (active >= 4) {
    res.writeHead(503).end();
    return;
  }
  active++;
  try {
    const bytes = asset.bytes ?? (await readFile(asset.path));
    if (
      asset.path &&
      (bytes.length !== asset.size ||
        createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    )
      throw Error("Source changed");
    if (asset.mime.startsWith('video/') && req.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      const start = range ? Number(range[1]) : -1;
      const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
      if (start < 0 || start >= bytes.length || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end(); return; }
      res.writeHead(206, { 'Content-Type': asset.mime, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
      return;
    }
    const compressed = !asset.mime.startsWith('video/') && req.headers["accept-encoding"]?.includes("gzip")
      ? gzipSync(bytes)
      : bytes;
    if (compressed !== bytes) res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    res.writeHead(200, {
      "Content-Type": asset.mime,
      "Content-Length": compressed.length,
    });
    console.log(
      JSON.stringify({
        request: req.url,
        body_bytes: compressed.length,
        uncompressed_bytes: bytes.length,
      }),
    );
    res.end(req.method === "HEAD" ? undefined : compressed);
  } catch {
    res.writeHead(409).end();
  } finally {
    active--;
  }
});
server.listen(0, "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      preview: `http://127.0.0.1:${server.address().port}`,
      release: manifest.release,
      published: false,
      geometryBytes: manifest.chunks.reduce((n, c) => n + c.bytes, 0),
    }),
  ),
);
