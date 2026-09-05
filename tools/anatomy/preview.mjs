/** Private local QA of the actual product component; no atlas copied to public/. */
import { readFile, mkdtemp, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { tsImport } from "tsx/esm/api";
const directory = resolve(process.argv[2]);
const root = resolve(new URL("../..", import.meta.url).pathname);
const { validateAtlas } = await tsImport(
  "../../lib/anatomy/validation.ts",
  import.meta.url,
);
const light = process.argv.includes("--light");
const manifestBytes = await readFile(join(directory, "manifest.json"));
if (manifestBytes.length > 8 * 1024 * 1024) throw Error("Manifest cap");
const manifest = validateAtlas(JSON.parse(manifestBytes));
const assets = new Map();
const prefix = `/anatomy/${manifest.release}/`;
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
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AnatomyExplorer from './components/anatomy/AnatomyExplorer';import {I18nProvider} from './lib/i18n';createRoot(document.getElementById('root')).render(<I18nProvider defaultLang="es"><AnatomyExplorer manifestUrl="${prefix}manifest.json"/></I18nProvider>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "esm",
  splitting: true,
  outdir: temp,
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
for (const f of result.outputFiles)
  assets.set("/_qa/" + f.path.slice(temp.length + 1), {
    bytes: f.contents,
    mime: f.path.endsWith(".css") ? "text/css" : "text/javascript",
  });
assets.set("/_qa/theme.css", {
  bytes: Buffer.from(
    ":root{color-scheme:dark;--bg-primary:#181c1d;--bg-surface:#222828;--text-primary:#f3f1e9;--text-secondary:#b9c0b7;--border-default:#59605d;--accent:#d4a853}:root.light{color-scheme:light;--bg-primary:#faf9f6;--bg-surface:#eeeae1;--text-primary:#242a27;--text-secondary:#55615b;--border-default:#a7aea6;--accent:#71531c}*{box-sizing:border-box}body{margin:0;font:16px system-ui;background:var(--bg-primary);color:var(--text-primary)}button,input{font:inherit}a{color:inherit}",
  ),
  mime: "text/css",
});
assets.set("/", {
  bytes: Buffer.from(
    '<!doctype html><html lang="es" class="' +
      (light ? "light" : "") +
      '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Trophē · atlas privado</title><link rel="stylesheet" href="/_qa/theme.css"><link rel="stylesheet" href="/_qa/stdin.css"></head><body><div id="root"></div><script type="module" src="/_qa/stdin.js"></script></body></html>',
  ),
  mime: "text/html",
});
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
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
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
    const compressed = req.headers["accept-encoding"]?.includes("gzip")
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
