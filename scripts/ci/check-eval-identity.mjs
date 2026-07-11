#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const executableExtensions = new Set(['.js', '.mjs', '.ts']);
const identityPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function executableFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return executableFiles(path);
    return executableExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

const files = [
  ...executableFiles('scripts/eval'),
  ...executableFiles('agents/evals'),
  ...executableFiles('scripts/debug').filter((file) => /(^|\/)smoke-[^/]+\.(?:ts|js|mjs)$/.test(file)),
];
const violations = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(identityPattern)) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${file}:${line}`);
  }
}

if (violations.length > 0) {
  console.error('Eval/smoke identities must come from environment configuration:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Eval identity guard passed across ${files.length} executable files.`);
