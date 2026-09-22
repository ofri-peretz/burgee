/**
 * compat-oracle R6: repository scripts reach the oracle by relative path, never by package name.
 *
 * `compat-oracle`'s exports map points at `dist/`. From a worktree with no `node_modules`, a bare
 * `compat-oracle/hosts` climbs out of the worktree and resolves from the **main checkout's**
 * `dist/`, while the script's output paths come from its own `import.meta.url` and stay here — so
 * `vendor-suite.ts` would write *this* tree's `vendor/` and `PROVENANCE` from *another* tree's
 * `HOSTS` table. Measured 2026-09-16; silent in exactly the direction that writes a wrong manifest.
 *
 * A relative path to `src/` cannot resolve anywhere but this tree, and needs no build first.
 * Import declarations are read with the TypeScript parser, not a regex over the text.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCANNED = ['scripts', 'benchmarks'];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'results' ? [] : sources(at);
    return /\.(?:ts|mts|mjs)$/.test(e.name) ? [at] : [];
  });
}

/** Every module specifier a file imports, statically or with `import()`. */
function specifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const FILES = SCANNED.flatMap((dir) => sources(join(root, dir)));

describe('repository scripts reach compat-oracle by path (R6)', () => {
  it('scans the scripts that vendor and grade, so this cannot pass by reading nothing', () => {
    const names = FILES.map((f) => relative(root, f));
    expect(names).toContain('scripts/vendor-suite.ts');
    expect(names).toContain('scripts/compat-page.ts');
  });

  it('no script imports compat-oracle by package name', () => {
    const bare = FILES.flatMap((file) => specifiers(file).filter((s) => s === 'compat-oracle' || s.startsWith('compat-oracle/')).map((s) => `${relative(root, file)}: ${s}`));
    expect(bare, 'import it as ../packages/compat-oracle/src/<module>.js — a bare name can resolve from another checkout').toEqual([]);
  });
});
