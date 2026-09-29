/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a package site's API reference is its shipped surface, all of it, as shipped.
 *
 * `scripts/api-reference.ts` writes `content/docs/api/<entry>.md` from the built `dist/*.d.ts`
 * of every package in `STANDARD_SITES`. A reference goes wrong in two ways, and both are
 * silent on the page: it falls behind the code (an export renamed, a signature changed, a doc
 * comment rewritten), or it misses part of the surface (an entry point added to `exports`
 * with no page, an export nobody listed). So:
 *
 *   1. every page is byte-identical to what the generator writes now, and nothing under
 *      `api/` is left that it no longer writes — the `--check` of `sync-package-docs.ts`;
 *   2. every entry point in `exports` with types has a page, and every export of it — read
 *      from the checker here, not from the generator's output — is named on that page, as a
 *      section of its own or a row pointing at the page that documents it;
 *   3. the site's nav lists the reference and the pages that exist.
 *
 * It reads `dist/`, so it needs the packages built — `turbo run build` before the root
 * suite, as `lefthook`'s pre-push and CI both run it. A missing `dist/` fails by name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read the app table through its one typed reader rather than re-parsing it
import { appForPackage } from '../apps/docs-chassis/src/config';

import { entriesOf, orphans, pages, prose, renderEntry, STANDARD_SITES, stale } from './api-reference.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every name an entry exports, as the checker sees it — independent of the generator. */
function exportedNames(types: string): string[] {
  const program = ts.createProgram([types], { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, noEmit: true, types: ['node'] });
  const sf = program.getSourceFile(types);
  const checker = program.getTypeChecker();
  const symbol = sf === undefined ? undefined : checker.getSymbolAtLocation(sf);
  if (sf === undefined || symbol === undefined) return [];
  const named = checker.getExportsOfModule(symbol).map((s) => s.name);
  // CommonJS `export = { … }`: an ES module importing it gets each property as a named export.
  const assigned = symbol.exports?.get(ts.InternalSymbolName.ExportEquals);
  if (named.length > 0 || assigned === undefined) return named;
  return checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(assigned, sf)).map((s) => s.name);
}

describe.each(STANDARD_SITES.map((pkg) => [pkg] as const))('%s: the API reference', (pkg) => {
  const app = appForPackage(pkg);
  if (app === undefined) throw new Error(`${pkg} is in STANDARD_SITES and has no app`);
  const owned = pages([pkg]);
  const entries = entriesOf(pkg);

  it('is what the generator writes from the built declarations, with nothing left over', () => {
    expect(stale(owned, [pkg]), 'run `npx tsx scripts/api-reference.ts` after building the packages').toEqual([]);
  });

  it.each(entries.map((e) => [e.specifier, e] as const))('%s has a page naming every export', (_specifier, entry) => {
    const file = join(ROOT, app.dir, 'content/docs/api', `${entry.slug}.md`);
    expect(existsSync(file), `no page for ${entry.specifier}`).toBe(true);
    const page = readFileSync(file, 'utf8');
    const names = exportedNames(entry.types);
    expect(names.length, `${entry.specifier} exports nothing the checker can see — is dist/ built?`).toBeGreaterThan(0);
    const unlisted = names.filter((name) => !page.includes(`### ${name}\n`) && !page.includes(`| \`${name}\` |`));
    expect(unlisted, `${entry.specifier} exports these and its page does not name them`).toEqual([]);
  });

  // `tsc` keeps a source file's licence header in its `.d.ts`, where it reads as the module's
  // doc, or as the doc of a first declaration that has none; neither is documentation.
  it('never prints a licence banner as a module intro or an export summary', () => {
    const leaked = [...owned].filter(([, text]) => text.includes('Copyright (c)')).map(([file]) => file);
    expect(leaked).toEqual([]);
  });

  it('lists the reference in the site nav, and every page of it in its own', () => {
    const meta = JSON.parse(readFileSync(join(ROOT, app.dir, 'content/docs/meta.json'), 'utf8')) as { pages: string[] };
    expect(meta.pages).toContain('api');
    const api = JSON.parse(readFileSync(join(ROOT, app.dir, 'content/docs/api/meta.json'), 'utf8')) as { pages: string[] };
    expect(api.pages.toSorted()).toEqual(entries.map((e) => e.slug).toSorted());
  });
});

describe('the lock refuses what it exists to refuse', () => {
  const [pkg] = STANDARD_SITES;
  if (pkg === undefined) throw new Error('STANDARD_SITES is empty');
  const owned = pages([pkg]);
  const [path, text] = [...owned].find(([file]) => file.endsWith('/loop.md')) ?? [];
  if (path === undefined || text === undefined) throw new Error(`${pkg} has no loop page to mutate`);

  it('a page edited by hand is stale', () => {
    const edited = new Map(owned);
    edited.set(path, text.replace('### hoist', '### hoisted'));
    // `stale` compares what the generator would write against the file; hand it a generator
    // output that differs from the committed file and it must name that file.
    const committed = readFileSync(join(ROOT, path), 'utf8');
    expect(committed).toBe(text);
    expect(stale(edited, [pkg])).toContain(path);
  });

  it('a page under api/ the generator does not write is an orphan', () => {
    const fewer = new Map([...owned].filter(([file]) => file !== path));
    expect(orphans(fewer, [pkg])).toContain(path);
  });

  it('an export dropped from a page is caught by the export check', () => {
    const [entry] = entriesOf(pkg).filter((e) => e.slug === 'loop');
    if (entry === undefined) throw new Error('no loop entry');
    const page = renderEntry({ pkg, entry, docs: [], intro: '', entries: entriesOf(pkg) });
    const names = exportedNames(entry.types);
    expect(names.filter((name) => !page.includes(`### ${name}\n`) && !page.includes(`| \`${name}\` |`))).toContain('hoist');
  });
});

describe('doc-comment prose is valid Markdown', () => {
  it('writes a code span holding an escaped backtick with a double-backtick fence', () => {
    expect(prose('the template literal (`chalk\\`{red x}\\``) went')).toBe('the template literal (`` chalk`{red x}` ``) went');
    expect(prose('`plain` and `other` stay as they are')).toBe('`plain` and `other` stay as they are');
  });

  it('moves a bulleted list the comment indents to the margin, continuation lines and all', () => {
    expect(prose('Two questions:\n\n  - **one**, which\n    wraps\n  - **two**\n\nAfter.')).toBe('Two questions:\n\n- **one**, which\n  wraps\n- **two**\n\nAfter.');
  });
});
