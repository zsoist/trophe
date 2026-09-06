/** Private local QA of the actual product component; no atlas copied to public/. */
import { readFile, mkdtemp, stat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { tsImport } from "tsx/esm/api";
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
const manifestBytes = await readFile(join(directory, "manifest.json"));
if (manifestBytes.length > 8 * 1024 * 1024) throw Error("Manifest cap");
const manifest = validateAtlas(JSON.parse(manifestBytes));
const assets = new Map();
assets.set("/anatomy/muscle-atlas-mark.webp", {
  bytes: await readFile(join(root, "public/anatomy/muscle-atlas-mark.webp")),
  mime: "image/webp",
});
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
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {PrivateAtlasReview} from './tools/anatomy/private-review';import {I18nProvider} from './lib/i18n';createRoot(document.getElementById('root')).render(<I18nProvider defaultLang="en"><PrivateAtlasReview manifestUrl="${prefix}manifest.json" identity={${JSON.stringify({ codeSha, manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"), release: manifest.release })}}/></I18nProvider>);`,
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
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.__NEXT_IMAGE_OPTS": "undefined",
  },
});
for (const f of result.outputFiles)
  assets.set("/_qa/" + f.path.slice(temp.length + 1), {
    bytes: f.contents,
    mime: f.path.endsWith(".css") ? "text/css" : "text/javascript",
  });
assets.set("/_qa/theme.css", {
  bytes: Buffer.from(
    ":root{color-scheme:dark;--bg-primary:#181c1d;--bg-surface:#222828;--text-primary:#f3f1e9;--text-secondary:#b9c0b7;--border-default:#59605d;--accent:#d4a853}:root.light{color-scheme:light;--bg-primary:#faf9f6;--bg-surface:#eeeae1;--text-primary:#242a27;--text-secondary:#55615b;--border-default:#a7aea6;--accent:#71531c}*{box-sizing:border-box}.private-device-review{padding:12px;max-width:1120px;margin:auto}.private-review-language{display:flex;align-items:center;justify-content:flex-end;gap:12px;font-size:13px;color:var(--text-secondary)}.private-review-language select{font:inherit;color:var(--text-primary);background:var(--bg-surface);border:1px solid var(--border-default);border-radius:8px;padding:6px 10px}.private-device-review pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.private-device-review button,.private-device-review select{min-height:44px}.private-device-review summary{min-height:44px}body{margin:0;font:16px system-ui;background:var(--bg-primary);color:var(--text-primary)}button,input{font:inherit}a{color:inherit}",
  ),
  mime: "text/css",
});
assets.set("/", {
  bytes: Buffer.from(
    '<!doctype html><html lang="en" class="' +
      (light ? "light" : "") +
      '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Trophē · Muscle Atlas</title><link rel="stylesheet" href="/_qa/theme.css"><link rel="stylesheet" href="/_qa/stdin.css"></head><body><div id="root"></div><script type="module" src="/_qa/stdin.js"></script></body></html>',
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
    const compressed = gzipSync(bytes);
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
        "Content-Encoding": "gzip",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
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
