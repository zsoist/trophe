import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const DEFAULT_SOURCE_DIRECTORIES = ['app', 'components', 'lib', 'agents'] as const;
const SOURCE_EXTENSION_PATTERN = /\.(?:[cm]?[jt]sx?)$/;

export interface ClientProviderImportViolation {
  entrypoint: string;
  target: string;
  importChain: string[];
}

export interface ClientProviderImportGraphOptions {
  rootDir: string;
  sourceDirectories?: readonly string[];
}

function isInsideRoot(rootDir: string, filename: string): boolean {
  const relative = path.relative(rootDir, filename);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function repoRelativePath(rootDir: string, filename: string): string {
  return path.relative(rootDir, filename).split(path.sep).join('/');
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];

  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(absolute);
      return SOURCE_EXTENSION_PATTERN.test(entry.name) ? [absolute] : [];
    });
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === 'use client') return true;
  }
  return false;
}

function importDeclarationHasRuntimeValue(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) return true;
  const elements = clause.namedBindings?.elements ?? [];
  return elements.length === 0 || elements.some((element) => !element.isTypeOnly);
}

function exportDeclarationHasRuntimeValue(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) return true;
  return node.exportClause.elements.length === 0
    || node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function localModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers = new Set<string>();

  const addStringLiteral = (node: ts.Expression | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) specifiers.add(node.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && importDeclarationHasRuntimeValue(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && exportDeclarationHasRuntimeValue(node)
    ) {
      addStringLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && !node.isTypeOnly
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      addStringLiteral(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node)
      && (
        (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length >= 1)
        || (
          ts.isIdentifier(node.expression)
          && node.expression.text === 'require'
          && node.arguments.length === 1
        )
      )
    ) {
      addStringLiteral(node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...specifiers].sort();
}

function resolveLocalModule(
  rootDir: string,
  importer: string,
  rawSpecifier: string,
): string | undefined {
  const specifier = rawSpecifier.split(/[?#]/, 1)[0];
  if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return undefined;

  const resolved = ts.resolveModuleName(
    specifier,
    importer,
    {
      allowJs: true,
      baseUrl: rootDir,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: { '@/*': ['*'] },
    },
    ts.sys,
  ).resolvedModule?.resolvedFileName;

  if (
    !resolved
    || !SOURCE_EXTENSION_PATTERN.test(resolved)
    || !isInsideRoot(rootDir, resolved)
  ) {
    return undefined;
  }
  return path.resolve(resolved);
}

function isPaidProviderModule(rootDir: string, filename: string): boolean {
  const relative = repoRelativePath(rootDir, filename).replace(SOURCE_EXTENSION_PATTERN, '');
  return relative === 'agents/runtime/provider-access'
    || relative.startsWith('agents/runtime/providers/')
    || relative === 'agents/clients/anthropic'
    || relative === 'agents/clients/google';
}

function parseSourceFile(filename: string): ts.SourceFile {
  const scriptKind = filename.endsWith('.tsx') || filename.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(
    filename,
    readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

export function findClientProviderImportViolations({
  rootDir: rawRootDir,
  sourceDirectories = DEFAULT_SOURCE_DIRECTORIES,
}: ClientProviderImportGraphOptions): ClientProviderImportViolation[] {
  const rootDir = path.resolve(rawRootDir);
  const parsedSources = new Map<string, ts.SourceFile>();
  const dependencies = new Map<string, string[]>();
  const source = (filename: string): ts.SourceFile => {
    const cached = parsedSources.get(filename);
    if (cached) return cached;
    const parsed = parseSourceFile(filename);
    parsedSources.set(filename, parsed);
    return parsed;
  };
  const imports = (filename: string): string[] => {
    const cached = dependencies.get(filename);
    if (cached) return cached;
    const resolved = localModuleSpecifiers(source(filename))
      .map((specifier) => resolveLocalModule(rootDir, filename, specifier))
      .filter((dependency): dependency is string => dependency != null);
    const unique = [...new Set(resolved)].sort((left, right) => (
      repoRelativePath(rootDir, left).localeCompare(repoRelativePath(rootDir, right))
    ));
    dependencies.set(filename, unique);
    return unique;
  };

  const entrypoints = sourceDirectories
    .flatMap((directory) => sourceFiles(path.resolve(rootDir, directory)))
    .filter((filename) => hasUseClientDirective(source(filename)))
    .sort((left, right) => (
      repoRelativePath(rootDir, left).localeCompare(repoRelativePath(rootDir, right))
    ));

  const violations: ClientProviderImportViolation[] = [];
  for (const entrypoint of entrypoints) {
    const visited = new Set<string>();

    const visit = (filename: string, chain: string[]): void => {
      if (visited.has(filename)) return;
      visited.add(filename);

      if (isPaidProviderModule(rootDir, filename)) {
        violations.push({
          entrypoint: repoRelativePath(rootDir, entrypoint),
          target: repoRelativePath(rootDir, filename),
          importChain: chain.map((item) => repoRelativePath(rootDir, item)),
        });
        return;
      }

      for (const dependency of imports(filename)) {
        visit(dependency, [...chain, dependency]);
      }
    };

    visit(entrypoint, [entrypoint]);
  }

  return violations;
}
