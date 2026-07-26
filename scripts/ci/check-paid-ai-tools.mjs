#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const SCAN_ROOTS = [
  'agents/evals',
  'scripts/debug',
  'scripts/eval',
  'scripts/ingest',
  'scripts/ops',
];
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.mts', '.ts', '.tsx']);
const NON_EXECUTABLE_PAID_HELPERS = new Set([
  'scripts/eval/factory-runtime.ts',
]);
const PAID_IMPORT_PATTERNS = [
  /agents\/runtime\/providers\//,
  /agents\/clients\/(?:anthropic|google)/,
  /agents\/food-parse\//,
  /\.\/factory-runtime(?:\.[a-z]+)?$/,
];
const PAID_TRANSPORT_PATTERNS = [
  /api\.anthropic\.com/i,
  /api\.deepseek\.com/i,
  /api\.openai\.com/i,
  /api\.voyageai\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /\/api\/ai\//i,
  /\/api\/food\/parse/i,
  /\/api\/food-parse/i,
];
const PROVIDER_CALL_PATTERN =
  /^(?:generateFactoryText|runPipeline|invoke(?:DeepSeek|StructuredProvider|TextProvider|Voyage))/;
const MUTATION_CALLS = new Set([
  'appendFile',
  'appendFileSync',
  'mkdir',
  'mkdirSync',
  'writeFile',
  'writeFileSync',
]);

function relativePath(rootDir, absolute) {
  return path.relative(rootDir, absolute).split(path.sep).join('/');
}

function walkSources(rootDir) {
  const files = [];
  for (const scanRoot of SCAN_ROOTS) {
    const absoluteRoot = path.join(rootDir, scanRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    const pending = [absoluteRoot];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(absolute);
        } else if (
          SOURCE_EXTENSIONS.has(path.extname(entry.name))
          || entry.name.endsWith('.sh')
        ) {
          files.push(absolute);
        }
      }
    }
  }
  return files.sort();
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

function sourceText(expression, constants) {
  if (!expression) return '';
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) {
    return [
      expression.head.text,
      ...expression.templateSpans.map((span) =>
        `${sourceText(span.expression, constants)}${span.literal.text}`),
    ].join('');
  }
  if (ts.isIdentifier(expression)) return constants.get(expression.text) ?? '';
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return `${sourceText(expression.left, constants)}${sourceText(expression.right, constants)}`;
  }
  if (ts.isNewExpression(expression) && expression.expression.getText() === 'URL') {
    return expression.arguments?.map((argument) => sourceText(argument, constants)).join('') ?? '';
  }
  return '';
}

function callName(call) {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function functionScope(node, sourceFile) {
  let current = node.parent;
  while (current && current !== sourceFile) {
    if (
      ts.isFunctionDeclaration(current)
      || ts.isFunctionExpression(current)
      || ts.isArrowFunction(current)
      || ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return sourceFile;
}

function analyzeNodeSource(rootDir, absolute, manifestTool, violations) {
  const file = relativePath(rootDir, absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const kind = absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    absolute,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const constants = new Map();
  const paidImports = new Set();
  const importedPaidRunNames = new Set();
  const guardPositionsByScope = new Map();
  const guardOperations = new Set();
  const sensitivePositionsByScope = new Map();
  const mainCallPositions = [];
  let hasExecutablePaidSignal = false;
  const paidAttempts = [];
  const consumesByScope = new Map();

  for (const statement of sourceFile.statements) {
    if (
      ts.isVariableStatement(statement)
      && statement.declarationList.declarations.length === 1
    ) {
      const declaration = statement.declarationList.declarations[0];
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        const value = sourceText(declaration.initializer, constants);
        if (value) constants.set(declaration.name.text, value);
      }
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (PAID_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier))) {
        paidImports.add(specifier);
        const clause = statement.importClause;
        if (specifier.includes('agents/food-parse/') && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if ((element.propertyName?.text ?? element.name.text) === 'run') {
              importedPaidRunNames.add(element.name.text);
            }
          }
        }
      }
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = callName(node);
      const scope = functionScope(node, sourceFile);
      if (name === 'main' && scope === sourceFile) {
        mainCallPositions.push(node.getStart(sourceFile));
      }
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        && PAID_IMPORT_PATTERNS.some((pattern) =>
          pattern.test(sourceText(node.arguments[0], constants)))
      ) {
        importedPaidRunNames.add('run');
      }
      if (name === 'requirePaidAiToolApproval') {
        const positions = guardPositionsByScope.get(scope) ?? [];
        positions.push(node.getStart(sourceFile));
        guardPositionsByScope.set(scope, positions);
        const input = node.arguments[0];
        if (input && ts.isObjectLiteralExpression(input)) {
          const operationProperty = input.properties.find((property) =>
            ts.isPropertyAssignment(property)
            && (
              (ts.isIdentifier(property.name) && property.name.text === 'operation')
              || (ts.isStringLiteral(property.name) && property.name.text === 'operation')
            ));
          if (
            operationProperty
            && ts.isPropertyAssignment(operationProperty)
            && ts.isStringLiteralLike(operationProperty.initializer)
          ) {
            guardOperations.add(operationProperty.initializer.text);
          }
        }
      }
      if (name === 'consumeAttempt') {
        const positions = consumesByScope.get(scope) ?? [];
        positions.push(node.getStart(sourceFile));
        consumesByScope.set(scope, positions);
      }

      const transportText = name === 'fetch'
        ? sourceText(node.arguments[0], constants)
        : '';
      const isPaidFetch = name === 'fetch'
        && PAID_TRANSPORT_PATTERNS.some((pattern) => pattern.test(transportText));
      const isPaidProviderCall = PROVIDER_CALL_PATTERN.test(name);
      const isPaidImportedRun = importedPaidRunNames.has(name);
      if (isPaidFetch || isPaidProviderCall || isPaidImportedRun) {
        hasExecutablePaidSignal = true;
        let inlineBudgeted = false;
        for (const argument of node.arguments) {
          function findInlineBudget(candidate) {
            if (
              ts.isCallExpression(candidate)
              && callName(candidate) === 'consumeAttempt'
            ) {
              inlineBudgeted = true;
            }
            ts.forEachChild(candidate, findInlineBudget);
          }
          findInlineBudget(argument);
        }
        paidAttempts.push({
          position: node.getStart(sourceFile),
          scope,
          inlineBudgeted,
        });
      }

      const isAuthBoundary = name === 'fetch'
        && /\/auth\/v1\/token/i.test(transportText);
      const isMutation = MUTATION_CALLS.has(name)
        || ['delete', 'insert', 'update'].includes(name);
      const isClientBoundary = name === 'createClient' || name === 'Pool';
      if (isAuthBoundary || isMutation || isClientBoundary || isPaidFetch || isPaidProviderCall) {
        const positions = sensitivePositionsByScope.get(scope) ?? [];
        positions.push(node.getStart(sourceFile));
        sensitivePositionsByScope.set(scope, positions);
      }
    }

    if (
      ts.isPropertyAccessExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'process'
      && node.expression.name.text === 'env'
      && /(?:API_KEY|SERVICE_ROLE_KEY)$/.test(node.name.text)
    ) {
      const scope = functionScope(node, sourceFile);
      const positions = sensitivePositionsByScope.get(scope) ?? [];
      positions.push(node.getStart(sourceFile));
      sensitivePositionsByScope.set(scope, positions);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const directTopLevelPaidCall = paidAttempts.some(({ scope }) => scope === sourceFile);
  const invokesMain = sourceFile.statements.some((statement) => {
    let found = false;
    function findMainCall(node) {
      if (
        ts.isCallExpression(node)
        && callName(node) === 'main'
        && functionScope(node, sourceFile) === sourceFile
      ) {
        found = true;
      }
      ts.forEachChild(node, findMainCall);
    }
    findMainCall(statement);
    return found;
  });
  const executable = directTopLevelPaidCall || invokesMain;
  const paid = executable
    && (hasExecutablePaidSignal || paidImports.size > 0);
  const isAllowlistedHelper = NON_EXECUTABLE_PAID_HELPERS.has(file) && !executable;
  if (paid && !manifestTool && !isAllowlistedHelper) {
    violations.add(`${file}:unclassified-paid-ai-tool`);
    return;
  }
  if (!manifestTool || !manifestTool.policies.includes('paid-ai')) return;

  const allGuardPositions = [...guardPositionsByScope.values()].flat();
  if (allGuardPositions.length === 0) {
    violations.add(`${file}:paid-ai-approval-missing`);
  } else {
    if (!guardOperations.has(manifestTool.operations['paid-ai'])) {
      violations.add(`${file}:paid-ai-operation-mismatch`);
    }
    const topLevelGuards = guardPositionsByScope.get(sourceFile) ?? [];
    const firstMainCall = mainCallPositions.length > 0
      ? Math.min(...mainCallPositions)
      : Number.POSITIVE_INFINITY;
    let orderViolation = false;
    for (const [scope, sensitivePositions] of sensitivePositionsByScope) {
      const localGuards = guardPositionsByScope.get(scope) ?? [];
      for (const sensitivePosition of sensitivePositions) {
        const protectedLocally = localGuards.some(
          (guardPosition) => guardPosition < sensitivePosition,
        );
        const protectedByModuleGuard = scope !== sourceFile
          && topLevelGuards.some((guardPosition) => guardPosition < firstMainCall);
        if (!protectedLocally && !protectedByModuleGuard) {
          orderViolation = true;
        }
      }
    }
    if (orderViolation) {
      violations.add(`${file}:approval-after-sensitive-boundary`);
    }
  }
  for (const attempt of paidAttempts) {
    if (attempt.inlineBudgeted) continue;
    const priorConsumes = consumesByScope.get(attempt.scope) ?? [];
    if (!priorConsumes.some((position) => position < attempt.position)) {
      violations.add(`${file}:paid-attempt-not-budgeted`);
      break;
    }
  }
}

function analyzeShellSource(rootDir, absolute, manifestTool, violations) {
  const file = relativePath(rootDir, absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const meaningful = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
  const paidPosition = PAID_TRANSPORT_PATTERNS
    .map((pattern) => meaningful.search(pattern))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0];
  if (paidPosition === undefined) return;
  if (!manifestTool) {
    violations.add(`${file}:unclassified-paid-ai-tool`);
    return;
  }
  if (!manifestTool.policies.includes('paid-ai')) return;
  const guardPosition = meaningful.indexOf('safety/require-paid-ai-approval.ts');
  if (guardPosition < 0) {
    violations.add(`${file}:paid-ai-approval-missing`);
  } else if (guardPosition > paidPosition) {
    violations.add(`${file}:approval-after-sensitive-boundary`);
  }
  const expectedOperation = manifestTool.operations['paid-ai'];
  if (!meaningful.includes(`--operation=${expectedOperation}`)) {
    violations.add(`${file}:paid-ai-operation-mismatch`);
  }
}

export function scanPaidAiTools({ rootDir = process.cwd() } = {}) {
  const root = path.resolve(rootDir);
  const violations = new Set();
  const manifest = readManifest(root, violations);
  const manifestByPath = new Map(
    manifest.tools.map((tool) => [tool.entrypoint, tool]),
  );
  for (const absolute of walkSources(root)) {
    const file = relativePath(root, absolute);
    const tool = manifestByPath.get(file);
    if (absolute.endsWith('.sh')) {
      analyzeShellSource(root, absolute, tool, violations);
    } else {
      analyzeNodeSource(root, absolute, tool, violations);
    }
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
