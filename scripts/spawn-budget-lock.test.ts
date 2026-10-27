/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * windows-lane-holds R5 — an `npm install` runs once per file, in `beforeAll`, never inside a case.
 *
 * An install is the most expensive spawn a suite makes: a process tree that resolves, extracts
 * and links, under an endpoint scanner that inspects every file it writes. Inside a case it is
 * paid once per case and against the case's own timeout, which is how a saturated runner turns
 * into a red cell that names the wrong test. Every root suite that installs does it in
 * `beforeAll` today (`independence-install-lock`, `ink-alias-lock`, `install-graph-lock`,
 * `readme-quick-start-lock`); this lock keeps it that way.
 *
 * Read from the AST, not the text: a case may assert on the words `npm install` (a README line,
 * a `fix:` hint) without running anything. An install is a call that hands `npm` an `install`,
 * `ci`, `i` or `add` argument, a shell call whose command starts `npm install`, or a call to a
 * function that does either — in the same file, or in `family-install.ts` or `install-graph.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));
const INSTALL_VERBS = new Set(['install', 'ci', 'i', 'add']);
const SPAWNERS = new Set(['npm', 'execFileSync', 'execFile', 'spawnSync', 'spawn', 'execa', 'run']);
const SHELLS = new Set(['execSync', 'exec']);
const CASES = new Set(['it', 'test']);

/** The last name in a callee: `npm`, `child.spawnSync`, `it.each(...)` → `npm`, `spawnSync`, `it`. */
function calleeName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return CASES.has(rootName(node) ?? '') ? rootName(node) : node.name.text;
  if (ts.isCallExpression(node)) return calleeName(node.expression);
  return undefined;
}
function rootName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) return rootName(node.expression);
  return undefined;
}

function literal(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  return undefined;
}
const namesNpm = (node: ts.Node): boolean => (literal(node) ?? (ts.isIdentifier(node) ? node.text : '')).toLowerCase().includes('npm');

/** A call that runs an install itself. */
function runsInstall(call: ts.CallExpression): boolean {
  const name = calleeName(call.expression) ?? '';
  if (SHELLS.has(name)) return /^npm\s+(?:install|ci|i|add)\b/u.test(literal(call.arguments[0] ?? call) ?? '');
  if (!SPAWNERS.has(name)) return false;
  if (name !== 'npm' && !call.arguments.some(namesNpm)) return false;
  return call.arguments.some((arg) => ts.isArrayLiteralExpression(arg) && INSTALL_VERBS.has(literal(arg.elements[0] ?? arg) ?? ''));
}

/** Every node under `root`, each once; a stack, not recursion, so a deep file cannot overflow it. */
function visit(root: ts.Node, each: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    each(node);
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => {
      children.push(child);
    });
    // Reversed onto the stack, so nodes come off in source order, as the recursive walk did.
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i] as ts.Node);
  }
}

/** The name a function is declared under: `function f`, `const f = () =>`, `const f = function`. */
function declaredName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node)) return node.name?.text;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
  return undefined;
}

/** Every function in `source` that installs, directly or through another one (to a fixpoint). */
export function installers(source: ts.SourceFile, known: ReadonlySet<string> = new Set()): Set<string> {
  const functions = new Map<string, ts.Node>();
  visit(source, (node) => {
    const name = declaredName(node);
    if (name !== undefined) functions.set(name, node);
  });
  const found = new Set(known);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, body] of functions) {
      if (found.has(name)) continue;
      let installs = false;
      visit(body, (node) => {
        if (ts.isCallExpression(node) && (runsInstall(node) || found.has(calleeName(node.expression) ?? ''))) installs = true;
      });
      if (installs) {
        found.add(name);
        grew = true;
      }
    }
  }
  return found;
}

const parse = (file: string, text: string): ts.SourceFile => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

/** Installers exported by a shared module, keyed by the module's stem (`family-install`). */
export type Shared = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The local names `source` imports from a shared module that are installers there. By the import,
 * not by the name: `changeset-lock.test.ts` calls its own `main`, and `install-graph.ts` has a
 * `main` that installs — the same word, a different function.
 */
function imported(source: ts.SourceFile, shared: Shared): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const from = shared.get(statement.moduleSpecifier.text.replace(/^\.\//u, '').replace(/\.[cm]?[jt]s$/u, ''));
    const bindings = statement.importClause?.namedBindings;
    if (from === undefined || bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const spec of bindings.elements) if (from.has((spec.propertyName ?? spec.name).text)) names.add(spec.name.text);
  }
  return names;
}

/** Every shared module's installers, each read with what it imports from the ones before it. */
export function sharedInstallers(modules: readonly { stem: string; text: string }[]): Shared {
  const shared = new Map<string, ReadonlySet<string>>();
  for (const { stem, text } of modules) {
    const source = parse(`${stem}.ts`, text);
    shared.set(stem, installers(source, imported(source, shared)));
  }
  return shared;
}

/** Where `text` installs inside an `it(…)` or `test(…)` body, as `file:line`. */
export function installsInCases(file: string, text: string, shared: Shared = new Map()): string[] {
  const source = parse(file, text);
  const helpers = installers(source, imported(source, shared));
  const hits: string[] = [];
  visit(source, (node) => {
    if (!ts.isCallExpression(node) || !CASES.has(calleeName(node.expression) ?? '')) return;
    for (const arg of node.arguments) {
      if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) continue;
      visit(arg.body, (inner) => {
        if (ts.isCallExpression(inner) && (runsInstall(inner) || helpers.has(calleeName(inner.expression) ?? ''))) {
          hits.push(`${file}:${String(source.getLineAndCharacterOfPosition(inner.getStart()).line + 1)}`);
        }
      });
    }
  });
  return hits;
}

/** Every call site in `text` that installs, anywhere — so the lock can show it reads what it guards. */
export function installSites(file: string, text: string, shared: Shared = new Map()): number {
  const source = parse(file, text);
  const helpers = installers(source, imported(source, shared));
  let n = 0;
  visit(source, (node) => {
    if (ts.isCallExpression(node) && (runsInstall(node) || helpers.has(calleeName(node.expression) ?? ''))) n += 1;
  });
  return n;
}

// install-graph imports family-install, so family-install is read first.
const SHARED = sharedInstallers(['family-install', 'install-graph'].map((stem) => ({ stem, text: readFileSync(join(SCRIPTS, `${stem}.ts`), 'utf8') })));
const TESTS = readdirSync(SCRIPTS)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(SCRIPTS, name), 'utf8') }));

describe('windows-lane-holds R5 — one npm install per file, never inside a case', () => {
  it('finds an install inside a case, directly, through a helper, or through family-install', () => {
    const file = `
      import { installTarballs } from './family-install.js';
      const setup = () => execFileSync('npm', ['ci'], { cwd });
      function deeper() { setup(); }
      it('direct', async () => { await npm(['install', '--silent'], dir); });
      it.each([1])('shell %s', () => { execSync(\`npm install \${pkg}\`); });
      test('helper', () => { deeper(); });
      it('shared', async () => { await installTarballs(dir, files); });
    `;
    expect(installsInCases('fixture.test.ts', file, SHARED)).toEqual(['fixture.test.ts:5', 'fixture.test.ts:6', 'fixture.test.ts:7', 'fixture.test.ts:8']);
  });

  it('does not count an install in beforeAll, a pack, the words `npm install` in an assertion, or a same-named function from elsewhere', () => {
    const file = `
      import { main } from './changeset-lock.mjs';
      it('own main', () => { main(); });
      beforeAll(async () => { await npm(['install'], dir); await installTarballs(dir, files); });
      it('reads', () => {
        expect(readme).toContain('npm install roundel');
        execFileSync('npm', ['pack', '--json']);
        execFileSync('git', ['add', '.']);
      });
    `;
    expect(installsInCases('fixture.test.ts', file, SHARED)).toEqual([]);
  });

  it('reads the installs it guards, so this cannot pass by reading nothing', () => {
    expect([...(SHARED.get('family-install') ?? [])]).toContain('installTarballs');
    expect([...(SHARED.get('install-graph') ?? [])]).toContain('installAlone');
    const installing = TESTS.filter(({ name, text }) => installSites(name, text, SHARED) > 0).map(({ name }) => name);
    expect(installing).toEqual(expect.arrayContaining(['independence-install-lock.test.ts', 'ink-alias-lock.test.ts', 'install-graph-lock.test.ts', 'readme-quick-start-lock.test.ts']));
  });

  it('R5 — no root suite runs `npm install` or `npm ci` inside a case', () => {
    expect(TESTS.flatMap(({ name, text }) => installsInCases(name, text, SHARED)), 'move the install into beforeAll, once for the file').toEqual([]);
  });
});
