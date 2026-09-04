import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootFlagIndex = process.argv.indexOf('--root');
const repoRoot = rootFlagIndex === -1 ? process.cwd() : path.resolve(process.argv[rootFlagIndex + 1]);
const sourceRoots = ['app', 'components'];
const sourceExtensions = new Set(['.ts', '.tsx']);

const rules = [
  {
    name: 'dark-only utility',
    pattern: /(?:^|[\s'"`{])(?:bg|text|border|outline|ring|fill|stroke)-(?:black|white|stone|neutral|zinc)(?:-(?:50|100|200|300|400|500|600|700|800|900|950))?(?:\/[\w.\[\]-]+)?(?=$|[\s'"`},])/g,
  },
  {
    name: 'constructed dark-only utility',
    pattern: /(?:bg|text|border|outline|ring|fill|stroke)-\$\{[^}]+\}-(?:50|100|200|300|400|500|600|700|800|900|950)/g,
  },
  {
    name: 'arbitrary white/black rgba presentation',
    pattern: /(?:bg|text|border|outline|ring|fill|stroke)-\[(?:rgba?|hsla?)\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0|#(?:fff|ffffff|000|000000))[^\]]*\)\]|(?:rgba?|hsla?)\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0|#(?:fff|ffffff|000|000000))[^)]*\)/gi,
  },
  {
    name: 'arbitrary dark neutral hex presentation',
    pattern: /(?:bg|text|border|outline|ring|fill|stroke)-\[[^\]\n]*#[\da-f]{3,8}[^\]\n]*\]|(?:background(?:Color)?|color|fill|stroke|border(?:Color)?)\s*:\s*(?:[^,\n}]*?var\([^\)\n]*#[\da-f]{3,8}[^\)\n]*\)|(?:[^(),\n}]|\([^\)\n]*\))*#[\da-f]{3,8})|(?:fill|stroke|color)=["'][^"'\n]*#[\da-f]{3,8}[^"'\n]*["']|(?:fill|stroke|color)\s*=\s*\{[^}\n]*#[\da-f]{3,8}[^}\n]*\}/gi,
  },
  {
    // Catches `text-[Npx]` under 12px and any `text-[N rem]` under 0.75rem
    // (0.5625rem = 9px, 0.625rem = 10px, 0.6875rem = 11px, 0.7rem = 11.2px).
    name: 'functional text below 12px',
    pattern: /text-\[(?:(?:[0-9]|1[01])(?:\.\d+)?px|0?\.(?:[0-6]\d*|7(?:[0-4]\d*)?)rem)\]/g,
  },
];

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(target);
      return sourceExtensions.has(path.extname(entry.name)) ? [target] : [];
    });
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  return {
    line: before.split('\n').length,
    column: index - before.lastIndexOf('\n'),
  };
}

function isRedundantChartTick(filePath, source, index) {
  const fileName = path.basename(filePath);
  const isNamedChart = /(Chart|Heatmap|Radar|Donut|Trend|Distribution|Patterns|Compliance)\.tsx$/.test(fileName);
  if (!isNamedChart) return false;

  const svgStart = source.lastIndexOf('<svg', index);
  const svgEnd = source.indexOf('</svg>', index);
  const isInsideSvg = svgStart !== -1 && svgEnd !== -1 && svgStart < index && index < svgEnd;
  const hasAccessibleEquivalent = /<table\b[\s\S]*?<caption\b|className=["'`][^"'`]*\bsr-only\b[^"'`]*["'`][\s\S]*?(?:summary|data|value|table)/i.test(source);
  return isInsideSvg && hasAccessibleEquivalent;
}

function isExplicitMediaCanvas(source, index) {
  const tagStart = source.lastIndexOf('<', index);
  const tagEnd = source.indexOf('>', tagStart);
  if (tagStart === -1 || tagStart >= index || index > tagEnd) return false;

  const openingTag = source.slice(tagStart, tagEnd + 1);
  if (!/\bdata-theme-exempt\s*=\s*["']media-canvas["']/.test(openingTag)) return false;
  const tagName = openingTag.match(/^<\s*([a-z][\w.-]*)\b/i)?.[1];
  if (!tagName) return false;
  if (/^(?:video|canvas|img)$/i.test(tagName)) return true;

  const closeTagStart = source.indexOf(`</${tagName}`, tagEnd + 1);
  return closeTagStart !== -1 && /<(?:video|canvas|img)\b/i.test(source.slice(tagEnd + 1, closeTagStart));
}

function isDarkOrLightNeutralHex(token) {
  return [...token.matchAll(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi)].some((match) => {
    const value = match[1];
    const hex = value.length <= 4
      ? value.slice(0, 3).split('').map((channel) => channel.repeat(2)).join('')
      : value.slice(0, 6);
    const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    const spread = Math.max(...channels) - Math.min(...channels);
    return spread <= 18 && (Math.max(...channels) <= 48 || Math.min(...channels) >= 224);
  });
}

function isAllowed(rule, filePath, source, index) {
  if (rule.name === 'functional text below 12px') return isRedundantChartTick(filePath, source, index);
  if (rule.name === 'dark-only utility' || rule.name === 'arbitrary white/black rgba presentation' || rule.name === 'arbitrary dark neutral hex presentation') return isExplicitMediaCanvas(source, index);
  return false;
}

const violations = [];

for (const root of sourceRoots) {
  const absoluteRoot = path.join(repoRoot, root);
  if (!fs.existsSync(absoluteRoot)) continue;

  for (const filePath of collectSourceFiles(absoluteRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(repoRoot, filePath);
    if (relativePath === 'app/manifest.ts') continue;

    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      for (const match of source.matchAll(rule.pattern)) {
        const index = match.index ?? 0;
        if (rule.name === 'arbitrary dark neutral hex presentation' && !isDarkOrLightNeutralHex(match[0])) continue;
        if (isAllowed(rule, filePath, source, index)) continue;
        const { line, column } = lineAndColumn(source, index);
        violations.push({
          category: rule.name,
          column,
          line,
          path: relativePath,
          token: match[0].trim(),
        });
      }
    }
  }
}

violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column || a.category.localeCompare(b.category));

if (violations.length === 0) {
  console.log('Theme inventory passed: no dark-only, arbitrary white/black rgba or neutral hex, or functional text below 12px utilities found.');
  process.exit(0);
}

for (const violation of violations) {
  console.error(`${violation.path}:${violation.line}:${violation.column} ${violation.category}: ${violation.token}`);
}
console.error(`Theme inventory failed: ${violations.length} violation${violations.length === 1 ? '' : 's'}.`);
process.exit(1);
