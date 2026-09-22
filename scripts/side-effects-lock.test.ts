/**
 * U10: every package tells a bundler the truth about side effects.
 *
 * `sideEffects` is a promise a bundler acts on: a module it names may be dropped when nothing
 * it exports is used. Until 2026-09-23 six packages declared nothing (so no bundler could drop
 * anything) and two declared `false` while shipping a `bin` that runs a program on load — a
 * false statement, and one the 2026-09-22 `check` commands made false for roundel.
 *
 * The rule, read from `dist/` because that is what a bundler sees:
 * 1. every package declares `sideEffects`;
 * 2. every file its `bin` names is listed — a program runs when it is loaded;
 * 3. every file whose top level calls a function **imported from another module** is listed —
 *    that call reaches state the file does not own (paratext's `registerBuiltins()`), and
 *    dropping the file would silently undo it. A call to the file's own function, or a
 *    method on the file's own binding, only touches what the file owns and goes when it goes;
 * 4. nothing listed is stale.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLISHED = ['bellpull', 'burgee', 'caique', 'closeout', 'flagstaff', 'linegauge', 'paratext', 'roundel', 'seniority'];

interface Manifest {
  sideEffects?: boolean | string[];
  bin?: Record<string, string>;
}

/** The names a module imports. */
function importedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const s of source.statements) {
    if (!ts.isImportDeclaration(s) || s.importClause === undefined) continue;
    const { name, namedBindings } = s.importClause;
    if (name !== undefined) names.add(name.text);
    if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) for (const e of namedBindings.elements) names.add(e.name.text);
    if (namedBindings !== undefined && ts.isNamespaceImport(namedBindings)) names.add(namedBindings.name.text);
  }
  return names;
}

/** Whether the module's top level calls something it imported — an effect on state it does not own. */
function reachesOutside(file: string): boolean {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imported = importedNames(source);
  return source.statements.some((s) => {
    if (!ts.isExpressionStatement(s)) return false;
    let e = s.expression;
    while (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
    // `f(...)`, and `f(...).then(...)` — the chain starts at the call that does the work.
    while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ts.isCallExpression(e.expression.expression)) e = e.expression.expression;
    return ts.isCallExpression(e) && ts.isIdentifier(e.expression) && imported.has(e.expression.text);
  });
}

const dist = (pkg: string): string[] =>
  (readdirSync(join(root, 'packages', pkg, 'dist'), { recursive: true }) as string[]).filter((f) => f.endsWith('.js')).map((f) => `./dist/${f.split('\\').join('/')}`);

const PACKAGES = PUBLISHED.map((pkg) => {
  const manifest = JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8')) as Manifest;
  return { pkg, manifest, files: dist(pkg) };
});

describe('sideEffects tells a bundler the truth (U10)', () => {
  it.each(PACKAGES)('$pkg declares sideEffects', ({ manifest }) => {
    expect(manifest.sideEffects, 'declare it — undeclared, no bundler may drop any module').toBeDefined();
  });

  it.each(PACKAGES)('$pkg lists every bin — a program runs when it is loaded', ({ manifest }) => {
    const listed = Array.isArray(manifest.sideEffects) ? manifest.sideEffects : [];
    for (const bin of Object.values(manifest.bin ?? {})) expect(listed, `${bin} runs on load and is not listed`).toContain(bin);
  });

  it.each(PACKAGES)('$pkg lists every module whose top level calls an import', ({ pkg, manifest, files }) => {
    const listed = new Set(Array.isArray(manifest.sideEffects) ? manifest.sideEffects : []);
    const unlisted = files.filter((f) => !listed.has(f) && reachesOutside(join(root, 'packages', pkg, f)));
    expect(unlisted, 'these call an imported function at load and would be dropped by a bundler that believed the declaration').toEqual([]);
  });

  it.each(PACKAGES)('$pkg lists nothing stale', ({ pkg, manifest }) => {
    const listed = Array.isArray(manifest.sideEffects) ? manifest.sideEffects : [];
    expect(listed.filter((f) => !existsSync(join(root, 'packages', pkg, f)))).toEqual([]);
  });
});
