#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs'];
const PAID_MODULE_PATTERN =
  /(?:agents\/(?:runtime\/providers|clients\/(?:anthropic|google)|rag\/ingest)|factory-runtime)/;
const PAID_TEXT_PATTERNS = [
  /api\.anthropic\.com/i,
  /api\.deepseek\.com/i,
  /api\.mistral\.ai/i,
  /api\.openai\.com/i,
  /api\.voyageai\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /\/api\/ai\//i,
  /\/api\/food\/parse/i,
  /\/api\/food-parse/i,
];
const PAID_CALL_PATTERN =
  /^(?:call(?:Anthropic|Gemini)|generateFactoryText|invoke(?:Anthropic|DeepSeek|Gemini|OpenAi|StructuredProvider|TextProvider|Voyage)|runPipeline)/;
const SENSITIVE_CALLS = new Set([
  'appendFile',
  'appendFileSync',
  'createClient',
  'loadEnvConfig',
  'mkdir',
  'mkdirSync',
  'Pool',
  'writeFile',
  'writeFileSync',
]);
const SENSITIVE_IMPORT_PATTERN =
  /(?:^|\/)(?:db\/client|agents\/rag\/ingest)(?:\.[a-z]+)?$/;
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'reports',
  'eval-results',
]);

function relativePath(rootDir, absolute) {
  return path.relative(rootDir, absolute).split(path.sep).join('/');
}

function readManifest(rootDir, violations) {
  const manifestPath = path.join(rootDir, 'scripts/safety/tool-policy-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    violations.add('scripts/safety/tool-policy-manifest.json:manifest-missing');
    return { version: 1, tools: [] };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    violations.add('scripts/safety/tool-policy-manifest.json:manifest-invalid');
    return { version: 1, tools: [] };
  }
  if (manifest?.version !== 1 || !Array.isArray(manifest.tools)) {
    violations.add('scripts/safety/tool-policy-manifest.json:manifest-invalid');
    return { version: 1, tools: [] };
  }
  const seenPaths = new Set();
  const seenIds = new Set();
  for (const tool of manifest.tools) {
    const entrypoint = typeof tool?.entrypoint === 'string'
      ? tool.entrypoint
      : 'scripts/safety/tool-policy-manifest.json';
    if (
      typeof tool?.id !== 'string'
      || !['node', 'shell'].includes(tool?.runtime)
      || !Array.isArray(tool?.policies)
      || tool.policies.some((policy) => !['paid-ai', 'production-write'].includes(policy))
      || JSON.stringify(tool.policies) !== JSON.stringify([...new Set(tool.policies)].sort())
      || !tool?.owners
      || !tool?.operations
      || JSON.stringify(Object.keys(tool.owners).sort()) !== JSON.stringify(tool.policies)
      || JSON.stringify(Object.keys(tool.operations).sort()) !== JSON.stringify(tool.policies)
      || tool.policies.some((policy) =>
        typeof tool.owners[policy] !== 'string'
        || tool.owners[policy].length === 0
        || typeof tool.operations[policy] !== 'string'
        || !/^[a-z0-9](?:[a-z0-9-]{0,63})$/.test(tool.operations[policy]))
      || (tool.policies.includes('paid-ai')
        && tool.owners['paid-ai'] !== 'ai-offline-harness-task-6')
      || typeof tool?.classifications?.serviceRole !== 'boolean'
      || typeof tool?.classifications?.localDb !== 'boolean'
    ) {
      violations.add(`${entrypoint}:manifest-contract-invalid`);
    }
    if (seenPaths.has(entrypoint)) {
      violations.add(`${entrypoint}:manifest-entrypoint-duplicate`);
    }
    if (seenIds.has(tool?.id)) {
      violations.add(`${entrypoint}:manifest-id-duplicate`);
    }
    seenPaths.add(entrypoint);
    seenIds.add(tool?.id);
    if (!fs.existsSync(path.join(rootDir, entrypoint))) {
      violations.add(`${entrypoint}:manifest-entrypoint-missing`);
    }
  }
  return manifest;
}

function walkRepositorySources(rootDir) {
  const files = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (
        SOURCE_EXTENSIONS.includes(path.extname(entry.name))
        || entry.name.endsWith('.sh')
      ) {
        files.push(absolute);
      }
    }
  }
  return files.sort();
}

function parseSource(absolute) {
  const source = fs.readFileSync(absolute, 'utf8');
  const kind = absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return {
    source,
    sourceFile: ts.createSourceFile(
      absolute,
      source,
      ts.ScriptTarget.Latest,
      true,
      kind,
    ),
  };
}

function moduleSpecifiers(sourceFile) {
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function resolveLocalModule(rootDir, fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) {
    base = path.join(rootDir, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return undefined;
  }
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function packageEntrypoints(rootDir) {
  const packagePath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(packagePath)) return new Set();
  let scripts;
  try {
    scripts = JSON.parse(fs.readFileSync(packagePath, 'utf8'))?.scripts;
  } catch {
    return new Set();
  }
  const entrypoints = new Set();
  for (const command of Object.values(scripts ?? {})) {
    if (typeof command !== 'string') continue;
    for (const token of command.matchAll(/(?:^|[\s"'=])((?:agents|scripts)\/[A-Za-z0-9_./-]+\.(?:[cm]?[jt]sx?|sh))(?=$|[\s"'])/g)) {
      entrypoints.add(token[1]);
    }
  }
  return entrypoints;
}

function callName(call) {
  let expression = call.expression;
  while (ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function hasTopLevelExecution(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) continue;
    let expression = statement.expression;
    while (
      ts.isVoidExpression(expression)
      || ts.isAwaitExpression(expression)
      || ts.isParenthesizedExpression(expression)
    ) {
      expression = expression.expression;
    }
    if (ts.isCallExpression(expression)) return true;
  }
  return false;
}

function executableEntrypoints(rootDir, allFiles, manifest) {
  const packagePaths = packageEntrypoints(rootDir);
  const manifestPaths = new Set(manifest.tools.map((tool) => tool.entrypoint));
  const entrypoints = new Set([...packagePaths, ...manifestPaths]);
  for (const absolute of allFiles) {
    const file = relativePath(rootDir, absolute);
    if (
      !(file.startsWith('scripts/') || file.startsWith('agents/evals/'))
      || file.endsWith('.d.ts')
    ) {
      continue;
    }
    if (absolute.endsWith('.sh')) {
      const source = fs.readFileSync(absolute, 'utf8');
      if (source.startsWith('#!')) entrypoints.add(file);
      continue;
    }
    if (hasTopLevelExecution(parseSource(absolute).sourceFile)) entrypoints.add(file);
  }
  return [...entrypoints].sort();
}

function dependencyGraph(rootDir, entrypoint) {
  const start = path.join(rootDir, entrypoint);
  if (!fs.existsSync(start) || start.endsWith('.sh')) return [];
  const visited = new Set();
  const pending = [start];
  while (pending.length > 0) {
    const absolute = pending.pop();
    if (visited.has(absolute)) continue;
    visited.add(absolute);
    const { sourceFile } = parseSource(absolute);
    for (const specifier of moduleSpecifiers(sourceFile)) {
      const dependency = resolveLocalModule(rootDir, absolute, specifier);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited];
}

function graphHasPaidSignal(rootDir, graph) {
  return graph.some((absolute) => {
    const file = relativePath(rootDir, absolute);
    if (PAID_MODULE_PATTERN.test(file)) return true;
    const { sourceFile } = parseSource(absolute);
    let paid = false;
    function visit(node) {
      if (ts.isCallExpression(node) && PAID_CALL_PATTERN.test(callName(node))) paid = true;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier
        && ts.isStringLiteralLike(node.moduleSpecifier)
        && PAID_MODULE_PATTERN.test(node.moduleSpecifier.text)
      ) {
        paid = true;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return paid;
  });
}

function isProviderBoundaryFile(rootDir, absolute) {
  const file = relativePath(rootDir, absolute);
  return file.startsWith('agents/runtime/providers/')
    || file === 'agents/clients/anthropic.ts'
    || file === 'agents/clients/google.ts';
}

function graphHasTransportCapability(rootDir, graph) {
  for (const absolute of graph) {
    if (isProviderBoundaryFile(rootDir, absolute)) continue;
    const { sourceFile } = parseSource(absolute);
    let capable = false;
    function visit(node) {
      if (
        ts.isPropertyAssignment(node)
        && (
          (ts.isIdentifier(node.name) && node.name.text === 'beforeTransportAttempt')
          || (ts.isStringLiteral(node.name) && node.name.text === 'beforeTransportAttempt')
        )
      ) {
        capable = true;
      }
      if (
        ts.isShorthandPropertyAssignment(node)
        && node.name.text === 'beforeTransportAttempt'
      ) {
        capable = true;
      }
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'fetchOpaque'
      ) {
        capable = true;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    if (capable) return true;
  }
  return false;
}

function argumentCarriesTransportCapability(node) {
  let capable = false;
  function visit(candidate) {
    if (
      ts.isPropertyAccessExpression(candidate)
      && candidate.name.text === 'beforeTransportAttempt'
    ) {
      capable = true;
    }
    if (
      (ts.isPropertyAssignment(candidate) || ts.isShorthandPropertyAssignment(candidate))
      && candidate.name.getText().replaceAll(/['"]/g, '') === 'beforeTransportAttempt'
    ) {
      capable = true;
    }
    ts.forEachChild(candidate, visit);
  }
  visit(node);
  return capable;
}

function graphHasUnprotectedPaidCall(rootDir, graph) {
  for (const absolute of graph) {
    if (isProviderBoundaryFile(rootDir, absolute)) continue;
    const { sourceFile } = parseSource(absolute);
    let unprotected = false;
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const name = callName(node);
        let expression = node.expression;
        while (
          ts.isNonNullExpression(expression)
          || ts.isParenthesizedExpression(expression)
        ) {
          expression = expression.expression;
        }
        const isPaidBoundary =
          PAID_CALL_PATTERN.test(name)
          || ['generateFactoryText', 'ingestKnowledge', 'runAgent', 'runPipeline']
            .includes(name)
          || (name === 'run' && ts.isIdentifier(expression));
        if (
          isPaidBoundary
          && !node.arguments.some(argumentCarriesTransportCapability)
        ) {
          unprotected = true;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    if (unprotected) return true;
  }
  return false;
}

function nearestControlAncestor(node, sourceFile) {
  let current = node.parent;
  while (current && current !== sourceFile) {
    if (
      ts.isIfStatement(current)
      || ts.isConditionalExpression(current)
      || ts.isForStatement(current)
      || ts.isForInStatement(current)
      || ts.isForOfStatement(current)
      || ts.isWhileStatement(current)
      || ts.isDoStatement(current)
      || ts.isSwitchStatement(current)
      || ts.isTryStatement(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function analyzeNodeEntrypoint(rootDir, entrypoint, graph, manifestTool, violations) {
  const absolute = path.join(rootDir, entrypoint);
  const { sourceFile } = parseSource(absolute);
  const guards = [];
  const guardOperations = new Set();
  const sensitive = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement)
      && ts.isStringLiteralLike(statement.moduleSpecifier)
      && SENSITIVE_IMPORT_PATTERN.test(statement.moduleSpecifier.text)
    ) {
      sensitive.push(statement.getStart(sourceFile));
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = callName(node);
      if (name === 'requirePaidAiToolApproval') {
        guards.push({
          position: node.getStart(sourceFile),
          conditional: nearestControlAncestor(node, sourceFile) != null,
        });
        const object = node.arguments[0];
        if (object && ts.isObjectLiteralExpression(object)) {
          for (const property of object.properties) {
            if (
              ts.isPropertyAssignment(property)
              && property.name.getText(sourceFile).replaceAll(/['"]/g, '') === 'operation'
              && ts.isStringLiteralLike(property.initializer)
            ) {
              guardOperations.add(property.initializer.text);
            }
          }
        }
      }
      if (SENSITIVE_CALLS.has(name)) sensitive.push(node.getStart(sourceFile));
      if (
        ts.isPropertyAccessExpression(node.expression)
        && /^(?:db|database|client|pool)\b/.test(
          node.expression.expression.getText(sourceFile),
        )
        && /^(?:delete|execute|insert|query|update)$/.test(name)
      ) {
        sensitive.push(node.getStart(sourceFile));
      }
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0]
        && ts.isStringLiteralLike(node.arguments[0])
        && SENSITIVE_IMPORT_PATTERN.test(node.arguments[0].text)
      ) {
        sensitive.push(node.getStart(sourceFile));
      }
      if (
        name === 'fetch'
        && node.arguments[0]
        && PAID_TEXT_PATTERNS.some((pattern) =>
          pattern.test(node.arguments[0].getText(sourceFile)))
      ) {
        sensitive.push(node.getStart(sourceFile));
      }
      if (
        name === 'fetch'
        && node.arguments[0]
        && /\/auth\/v1\/token/i.test(node.arguments[0].getText(sourceFile))
      ) {
        sensitive.push(node.getStart(sourceFile));
      }
    }
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'process'
      && node.expression.name.text === 'env'
      && /(?:API_KEY|SERVICE_ROLE_KEY|DATABASE_URL)$/.test(node.name.text)
    ) {
      sensitive.push(node.getStart(sourceFile));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (guards.length === 0) {
    violations.add(`${entrypoint}:paid-ai-approval-missing`);
  } else {
    if (
      guards.every((guard) => guard.conditional)
      || !guardOperations.has(manifestTool.operations['paid-ai'])
    ) {
      violations.add(
        guards.every((guard) => guard.conditional)
          ? `${entrypoint}:paid-ai-approval-not-dominating`
          : `${entrypoint}:paid-ai-operation-mismatch`,
      );
    }
    const firstUnconditionalGuard = Math.min(
      ...guards.filter((guard) => !guard.conditional).map((guard) => guard.position),
    );
    if (sensitive.some((position) => position < firstUnconditionalGuard)) {
      violations.add(`${entrypoint}:approval-after-sensitive-boundary`);
    }
  }
  if (
    !graphHasTransportCapability(rootDir, graph)
    || graphHasUnprotectedPaidCall(rootDir, graph)
  ) {
    violations.add(`${entrypoint}:paid-transport-capability-missing`);
  }
}

function analyzeShellEntrypoint(rootDir, entrypoint, manifestTool, violations) {
  const source = fs.readFileSync(path.join(rootDir, entrypoint), 'utf8');
  if (!PAID_TEXT_PATTERNS.some((pattern) => pattern.test(source))) return;
  if (!manifestTool) {
    violations.add(`${entrypoint}:unclassified-paid-ai-tool`);
    return;
  }
  if (!manifestTool.policies.includes('paid-ai')) return;
  const lines = source.split(/\r?\n/);
  const guardIndex = lines.findIndex((line) =>
    line.includes('safety/require-paid-ai-approval.ts'));
  const paidIndex = lines.findIndex((line) => /\bcurl\b/.test(line));
  if (guardIndex < 0) {
    violations.add(`${entrypoint}:paid-ai-approval-missing`);
  } else if (guardIndex > paidIndex) {
    violations.add(`${entrypoint}:approval-after-sensitive-boundary`);
  }
  if (
    !source.includes('set -euo pipefail')
    || guardIndex < 0
    || /(?:\|\||&&|;|&)\s*(?:true|:)?\s*$/.test(lines[guardIndex].trim())
  ) {
    violations.add(`${entrypoint}:shell-guard-fail-open`);
  }
  if (!source.includes(`--operation=${manifestTool.operations['paid-ai']}`)) {
    violations.add(`${entrypoint}:paid-ai-operation-mismatch`);
  }
}

export function scanPaidAiTools({ rootDir = process.cwd() } = {}) {
  const root = path.resolve(rootDir);
  const violations = new Set();
  const manifest = readManifest(root, violations);
  const manifestByPath = new Map(
    manifest.tools.map((tool) => [tool.entrypoint, tool]),
  );
  const allFiles = walkRepositorySources(root);
  for (const entrypoint of executableEntrypoints(root, allFiles, manifest)) {
    const manifestTool = manifestByPath.get(entrypoint);
    if (entrypoint.endsWith('.sh')) {
      analyzeShellEntrypoint(root, entrypoint, manifestTool, violations);
      continue;
    }
    const graph = dependencyGraph(root, entrypoint);
    const graphIsPaid = graphHasPaidSignal(root, graph);
    if (!graphIsPaid && !manifestTool?.policies.includes('paid-ai')) continue;
    if (!manifestTool) {
      violations.add(`${entrypoint}:unclassified-paid-ai-tool`);
      continue;
    }
    if (!manifestTool.policies.includes('paid-ai')) continue;
    analyzeNodeEntrypoint(root, entrypoint, graph, manifestTool, violations);
  }
  return [...violations].sort();
}

function cliRoot(argv) {
  const index = argv.indexOf('--root');
  if (index < 0) return process.cwd();
  return argv[index + 1] ?? process.cwd();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = scanPaidAiTools({ rootDir: cliRoot(process.argv.slice(2)) });
  if (violations.length > 0) {
    process.stdout.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
  }
}
