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
    pattern: /(?:bg|text|border|outline|ring|fill|stroke)-\[#(?:000|000000|fff|ffffff|0a0a0a|111111|141414|1a1a1a|1c1c1c|222222|242424|2a2a2a|333333|44403c|57534e|78716c|a8a29e|d6d3d1|e7e5e4|f5f5f4|fafaf9)\]|(?:background(?:Color)?|color|fill|stroke|border(?:Color)?):\s*["']#(?:000|000000|fff|ffffff|0a0a0a|111111|141414|1a1a1a|1c1c1c|222222|242424|2a2a2a|333333|44403c|57534e|78716c|a8a29e|d6d3d1|e7e5e4|f5f5f4|fafaf9)["']|(?:fill|stroke|color)=["']#(?:000|000000|fff|ffffff|0a0a0a|111111|141414|1a1a1a|1c1c1c|222222|242424|2a2a2a|333333|44403c|57534e|78716c|a8a29e|d6d3d1|e7e5e4|f5f5f4|fafaf9)["']/gi,
  },
  {
    name: 'functional text below 12px',
    pattern: /text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/g,
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
  return tagStart !== -1 && tagStart < index && index <= tagEnd
    && /\bdata-theme-exempt\s*=\s*["']media-canvas["']/.test(source.slice(tagStart, tagEnd));
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
