/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a test's cleanup never waits for a directory tree to be unlinked.
 *
 * On the development machine, endpoint security inspects every file deletion. Under the pre-push
 * load a hook that ran `rmSync(dir, { recursive: true })` over a scratch tree took past vitest's
 * 60 s hook timeout and failed the run (2026-11-02: seniority, docs-seniority, docs-bellpull,
 * docs-flagstaff, docs-roundel and docs-linegauge `afterAll`s, and compat-oracle's `vendor-run`),
 * though each file passes alone in 1–2 s. #1137 moved two suites to a detached `rm`; the rest
 * still waited.
 *
 * The rule: inside a lifecycle hook (`beforeAll`, `beforeEach`, `afterAll`, `afterEach`,
 * `onTestFinished`, `onTestFailed`), a `finally` block, or a same-file function either of those
 * reaches, no recursive delete — `rmSync`/`rmdirSync`/`rm`/`rmdir` with `recursive`, or a
 * synchronous spawn of `rm -r`. Use `discard()` from `scratch-dir.ts` (the root's, `benchmarks/`'s,
 * each package's `src/__fixtures__/`, or `docs-chassis/scratch-dir` for an app): it renames the
 * tree away, which is one syscall, so the path is gone when the hook returns, and hands the
 * renamed tree to a detached `rm` it does not wait for.
 *
 * **Why a static lock and not a hook-duration budget.** The stall is the machine's, not the
 * suite's: every offender passes alone in 1–2 s, and only a loaded pre-push run crosses 60 s. A
 * duration gate that re-measures alone, as `vitest-case-budget-reporter.ts` must to stay
 * trustworthy, would acquit every one of them; one that does not would go red on load and get
 * re-run. The delete is the cause, and the cause is visible in the source, deterministically.
 *
 * A delete in the body of a case is not cleanup and is left alone: it is the scenario (a test
 * that removes `node_modules` to see what the grader does without it), and it runs once.
 *
 * Read with the TypeScript parser, not a regex, so a delete quoted inside a string is not one.
 * Fixture trees (`fixtures/` and `__fixtures__/`) are measured subjects and are not read.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every function a test runner calls around its cases rather than as one. */
const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach', 'onTestFinished', 'onTestFailed']);
const DELETES = new Set(['rmSync', 'rmdirSync', 'rm', 'rmdir']);
const SYNC_SPAWNS = new Set(['execSync', 'execFileSync', 'spawnSync']);

/** `foo(…)` and `a.b.foo(…)` alike: the name being called. */
function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** An object-literal argument sets `recursive` to anything but `false`. */
function recursiveOption(call: ts.CallExpression): boolean {
  return call.arguments.some(
    (arg) =>
      ts.isObjectLiteralExpression(arg) &&
      arg.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === 'recursive' && !(ts.isPropertyAssignment(p) && p.initializer.kind === ts.SyntaxKind.FalseKeyword)),
  );
}

const RM_R = /^-[a-zA-Z]*[rR]/u;
/** `execSync('rm -rf …')`, `execFileSync('rm', ['-rf', …])`, `spawnSync('rm', ['-r', …])`. */
function syncRm(call: ts.CallExpression): boolean {
  const [first, second] = call.arguments;
  if (first === undefined || !ts.isStringLiteralLike(first)) return false;
  if (/^rm\s+-[a-zA-Z]*[rR]/u.test(first.text)) return true;
  return first.text === 'rm' && second !== undefined && ts.isArrayLiteralExpression(second) && second.elements.some((e) => ts.isStringLiteralLike(e) && RM_R.test(e.text));
}

function isTreeDelete(call: ts.CallExpression): boolean {
  const name = calleeName(call);
  if (name === undefined) return false;
  if (DELETES.has(name)) return recursiveOption(call);
  return SYNC_SPAWNS.has(name) && syncRm(call);
}

export interface Finding {
  readonly line: number;
  readonly where: string;
  readonly text: string;
}

/** The function a call's argument, a variable's initializer, or a declaration names, if it is one. */
const isFunctionLike = (node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);

/** Every recursive delete that runs as cleanup in this source, with where it runs. */
export function cleanupDeletes(file: string, text: string): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  // Same-file named functions: `function f() {}` and `const f = () => {}`.
  const named = new Map<string, ts.Node>();
  const collect = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) named.set(node.name.text, node.body);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) named.set(node.name.text, node.initializer.body);
    ts.forEachChild(node, collect);
  };
  collect(source);

  // Cleanup regions: hook callbacks and `finally` blocks, then every named function they reach.
  const regions = new Map<ts.Node, string>();
  /** A hook's callback, inline or a same-file function passed by name. */
  const hookArgument = (arg: ts.Expression, hook: string): void => {
    if (isFunctionLike(arg) && arg.body) regions.set(arg.body, hook);
    else if (ts.isIdentifier(arg) && named.has(arg.text)) regions.set(named.get(arg.text)!, `${arg.text}(), run by ${hook}`);
  };
  const seed = (node: ts.Node): void => {
    const hook = ts.isCallExpression(node) ? calleeName(node) : undefined;
    if (hook !== undefined && HOOKS.has(hook)) for (const arg of (node as ts.CallExpression).arguments) hookArgument(arg, hook);
    if (ts.isTryStatement(node) && node.finallyBlock) regions.set(node.finallyBlock, 'finally');
    ts.forEachChild(node, seed);
  };
  seed(source);

  const queue = [...regions.keys()];
  while (queue.length > 0) {
    const region = queue.pop()!;
    const label = regions.get(region)!;
    const reach = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && named.has(node.text)) {
        const body = named.get(node.text)!;
        if (!regions.has(body) && body !== region) {
          regions.set(body, `${node.text}(), run by ${label}`);
          queue.push(body);
        }
      }
      ts.forEachChild(node, reach);
    };
    reach(region);
  }

  const findings: Finding[] = [];
  const seen = new Set<ts.Node>();
  for (const [region, where] of regions) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isTreeDelete(node) && !seen.has(node)) {
        seen.add(node);
        findings.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, where, text: node.getText().replace(/\s+/gu, ' ').slice(0, 80) });
      }
      ts.forEachChild(node, visit);
    };
    visit(region);
  }
  return findings.sort((a, b) => a.line - b.line);
}

const tracked = (...patterns: string[]): string[] =>
  execFileSync('git', ['ls-files', '-z', '--', ...patterns], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

const FIXTURE = /(?:^|\/)(?:__)?fixtures\//u;
const FILES = tracked('*.test.ts', '*.test.mts', '*.test.mjs', '*.test.cts', '*.test.js', '*.test.tsx').filter((file) => !FIXTURE.test(file));

describe('a test’s cleanup does not wait for a tree to be unlinked', () => {
  it('reads every test file outside the fixtures, so it cannot pass by reading nothing', () => {
    expect(FILES.length).toBeGreaterThan(500);
    expect(FILES).toContain('packages/compat-oracle/src/vendor-run.test.ts');
    expect(FILES).toContain('apps/docs-seniority/tests/examples.test.ts');
  });

  it('finds a delete in a hook, a finally, and a function a hook reaches, and none in a case body', () => {
    const sample = [
      "afterAll(() => rmSync(a, { recursive: true, force: true }));", // 1: hook
      'function clean() { fs.rmSync(b, { recursive: true }); }', //      2: reached from 3
      'afterEach(clean);', //                                             3
      "it('x', () => { try { run(); } finally { rmdirSync(c, { recursive: 1 }); } });", // 4: finally
      "beforeEach(() => { execFileSync('rm', ['-rf', d]); execSync(`rm -r ${e}`); });", // 5: sync rm (the template is not a string literal)
      "it('y', () => { rmSync(f, { recursive: true }); rmSync(g); });", // 6: the scenario, left alone
      "afterAll(() => { rmSync(h, { force: true }); rmSync(i, { recursive: false }); discard(j); });", // 7: one file, or detached
      "const z = 'afterAll(() => rmSync(k, { recursive: true }))';", //  8: a string, not code
      'afterAll(async () => { await rm(l, { recursive: true }); });', // 9: awaited async is a wait too
    ].join('\n');
    expect(cleanupDeletes('sample.test.ts', sample).map((f) => `${String(f.line)} ${f.where}`)).toEqual(['1 afterAll', '2 clean(), run by afterEach', '4 finally', '5 beforeEach', '9 afterAll']);
  });

  it('no test file deletes a tree in its cleanup (use discard() from scratch-dir.ts)', () => {
    const offenders = FILES.flatMap((file) => cleanupDeletes(file, readFileSync(resolve(ROOT, file), 'utf8')).map((f) => `${file}:${String(f.line)} (${f.where}) ${f.text}`));
    // Joined, so every offender is printed: vitest truncates a long array in its diff.
    expect(offenders.join('\n'), `${String(offenders.length)} recursive deletes run as cleanup`).toBe('');
  });
});
