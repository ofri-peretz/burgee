/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the rules switched off for runtime source only ever fall (burgee umbrella, criterion 4).
 *
 * The criterion asked for "≥9 Interlace plugins with zero disabled rules in the runtime packages".
 * The first half was true and the second false, and no check read either
 * (`.sdlc/intents/burgee/intent.md` § Restated 2026-10-18). A lock demanding zero today would
 * either fail or be edited to pass, so the design gate restated it to a ratchet
 * (D-20261025-burgee-umbrella-design-accepted), and this is that ratchet:
 *
 *   1. ESLint resolves its own config for every non-test file under `packages/*\/src/`, and the
 *      rules it leaves `off` for at least one of them are counted. That count is pinned as
 *      {@link CEILING}, and it may only fall. Resolved rather than grepped, because the root
 *      config computes its rule table (`everyRule`), and a textual count of `"off"` would miss
 *      every rule its `OFF` table switches off and count overrides that reach no runtime file.
 *   2. Every block that switches a rule off for runtime source says why, in a comment inside it;
 *      every entry of the `OFF` table carries its reason as its value.
 *   3. At least nine Interlace plugins are wired: `eslint-plugin-*` packages the config imports
 *      whose repository is `ofri-peretz/eslint`.
 *
 * Zero stays the target. Lowering {@link CEILING} in the change that removes an override is how
 * it gets there; raising it is a visible edit to this file, argued in review.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint, type Linter } from 'eslint';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONFIG = join(ROOT, 'eslint.config.mjs');

/**
 * The distinct rules ESLint leaves `off` for at least one runtime source file: 50 when this lock
 * was written, 2026-10-26, proven red from a ceiling of 0 first (D-20261026-disabled-rule-ceiling).
 * Only ever lowered.
 */
const CEILING = 50;

/** The criterion's first half. */
const MIN_INTERLACE_PLUGINS = 9;

/** A runtime source file: under a package's `src/`, not a test, a fixture or a declaration. */
const isRuntime = (file: string): boolean => /^packages\/[^/]+\/src\//.test(file) && !/\.test\.|\/__fixtures__\/|\.d\.[cm]?ts$/.test(file) && /\.(?:[cm]?[jt]s|tsx)$/.test(file);

/** Posix paths, as `git ls-files` prints them on every platform. */
const runtimeFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z', 'packages'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(isRuntime);

const isOff = (entry: Linter.RuleEntry | undefined): boolean => {
  const severity = Array.isArray(entry) ? entry[0] : entry;
  return severity === 0 || severity === 'off';
};

/** Rule id → how many runtime files it is off for. */
async function disabledRules(files: readonly string[]): Promise<Map<string, number>> {
  const eslint = new ESLint({ cwd: ROOT });
  const configs = (await Promise.all(files.map(async (file) => await eslint.calculateConfigForFile(join(ROOT, file))))) as (Linter.Config | undefined)[];
  const off = new Map<string, number>();
  for (const config of configs) for (const [id, entry] of Object.entries(config?.rules ?? {})) if (isOff(entry)) off.set(id, (off.get(id) ?? 0) + 1);
  return off;
}

// ── The source of eslint.config.mjs, read as a program ──────────────────────
const source = (): ts.SourceFile => ts.createSourceFile(CONFIG, readFileSync(CONFIG, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

const propertyNamed = (o: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined =>
  o.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name);

/** Does `text` hold a comment token? Scanned, so a `//` inside a string is not one. */
function holdsComment(text: string): boolean {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan())
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) return true;
  return false;
}

interface Block {
  line: number;
  files: string[];
  offs: string[];
  commented: boolean;
}

/** Every config block written as a literal: its `files` globs, the rules it sets `"off"`, and whether it says why. */
function blocks(sf: ts.SourceFile): Block[] {
  const out: Block[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const rules = propertyNamed(node, 'rules')?.initializer;
      const files = propertyNamed(node, 'files')?.initializer;
      if (rules !== undefined && ts.isObjectLiteralExpression(rules) && files !== undefined && ts.isArrayLiteralExpression(files)) {
        const offs = rules.properties.flatMap((p) => (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer) && p.initializer.text === 'off' && ts.isStringLiteral(p.name) ? [p.name.text] : []));
        const globs = files.elements.flatMap((e) => (ts.isStringLiteral(e) ? [e.text] : []));
        // The block's own text, with the comments that lead it: a reason above `{` counts.
        out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, files: globs, offs, commented: holdsComment(node.getFullText(sf)) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

interface OffEntry {
  rule: string;
  reason: string | undefined;
}

const unquoted = (name: ts.PropertyName, sf: ts.SourceFile): string => name.getText(sf).replaceAll('"', '');

/** One namespace of the `OFF` table: each rule, and the reason written as its value. */
function namespaceEntries(ns: ts.ObjectLiteralElementLike, sf: ts.SourceFile): OffEntry[] {
  if (!ts.isPropertyAssignment(ns) || !ts.isObjectLiteralExpression(ns.initializer)) return [];
  return ns.initializer.properties.filter(ts.isPropertyAssignment).map((r) => ({ rule: `${unquoted(ns.name, sf)}/${unquoted(r.name, sf)}`, reason: ts.isStringLiteralLike(r.initializer) ? r.initializer.text : undefined }));
}

/** The `OFF` table: namespace → rule → its reason, as written. */
function offTable(sf: ts.SourceFile): OffEntry[] {
  const out: OffEntry[] = [];
  const visit = (node: ts.Node): void => {
    const table = ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'OFF' ? node.initializer : undefined;
    if (table !== undefined && ts.isObjectLiteralExpression(table)) for (const ns of table.properties) out.push(...namespaceEntries(ns, sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The `eslint-plugin-*` packages the config imports whose repository is the Interlace ESLint monorepo. */
function interlacePlugins(sf: ts.SourceFile): string[] {
  const require = createRequire(CONFIG);
  const names = sf.statements.flatMap((s) => (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && /^eslint-plugin-[a-z0-9-]+$/.test(s.moduleSpecifier.text) ? [s.moduleSpecifier.text] : []));
  return names.filter((name) => {
    // Not `${name}/package.json`: a plugin whose `exports` omits it refuses that specifier.
    let dir = dirname(require.resolve(name));
    while (!existsSync(join(dir, 'package.json')) || (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string }).name !== name) {
      if (dirname(dir) === dir) throw new Error(`no package.json named ${name} above ${require.resolve(name)}`);
      dir = dirname(dir);
    }
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { repository?: string | { url?: string } };
    const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
    return /github\.com[/:]ofri-peretz\/eslint(?:\.git)?$/.test(url);
  });
}

describe('disabled rules in runtime source only fall (burgee criterion 4)', () => {
  const files = runtimeFiles();
  let off = new Map<string, number>();

  beforeAll(async () => {
    off = await disabledRules(files);
  }, 120_000);

  it('reads the runtime source it is about', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.every((f) => !f.includes('\\'))).toBe(true);
  });

  it(`leaves no more rules off for runtime source than the ceiling, ${String(CEILING)}`, () => {
    const listed = [...off.keys()].sort().join(', ');
    expect(off.size, `rules off for runtime source: ${listed}`).toBeLessThanOrEqual(CEILING);
  });

  it('pins the ceiling at the count, so a rule switched back on stays on', () => {
    expect(CEILING, `the count is ${String(off.size)}: when it falls, lower CEILING to it in the same change`).toBe(off.size);
  });

  it('says why in every block that switches a rule off for runtime source, and in every OFF entry', () => {
    const sf = source();
    const silent = blocks(sf)
      .filter((b) => b.offs.length > 0 && files.some((f) => b.files.some((g) => posix.matchesGlob(f, g))) && !b.commented)
      .map((b) => `eslint.config.mjs:${String(b.line)} turns off ${b.offs.join(', ')} with no comment saying why`);
    const unreasoned = offTable(sf)
      .filter((e) => (e.reason ?? '').trim() === '')
      .map((e) => `OFF › ${e.rule} has no reason`);
    expect([...silent, ...unreasoned]).toEqual([]);
  });

  it(`wires at least ${String(MIN_INTERLACE_PLUGINS)} Interlace plugins`, () => {
    expect(interlacePlugins(source()).length).toBeGreaterThanOrEqual(MIN_INTERLACE_PLUGINS);
  });
});

describe('how a reason is found', () => {
  it('takes a line or block comment, and not a // inside a string', () => {
    expect(holdsComment('{ // why\n files: ["a"] }')).toBe(true);
    expect(holdsComment('{ /* why */ files: ["a"] }')).toBe(true);
    expect(holdsComment('{ files: ["http://x"] }')).toBe(false);
  });
});
