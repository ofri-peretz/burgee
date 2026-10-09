/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a package site's API reference is its shipped surface, all of it, as shipped.
 *
 * `scripts/api-reference.ts` writes `content/docs/api/<entry>.md` from the built `dist/*.d.ts`
 * of every package in `STANDARD_SITES` and `FAMILY_SITE_REFERENCES` (together, `REFERENCED`). A reference goes wrong in two ways, and both are
 * silent on the page: it falls behind the code (an export renamed, a signature changed, a doc
 * comment rewritten), or it misses part of the surface (an entry point added to `exports`
 * with no page, an export nobody listed). So:
 *
 *   1. every page is byte-identical to what the generator writes now, and nothing under
 *      `api/` is left that it no longer writes — the `--check` of `sync-package-docs.ts`;
 *   2. every entry point in `exports` with types has a page, and every export of it — read
 *      from the checker here, not from the generator's output — is named on that page, as a
 *      section of its own or a row pointing at the page that documents it;
 *   3. the site's nav lists the reference and the pages that exist;
 *   4. on the family app, exactly the entries `DROP_INS` names link out to the incumbent's
 *      docs, at the release `GRADED_VERSIONS` grades, and every other entry is documented in
 *      full — so a native entry cannot slip into a bare list of names, nor a drop-in into a
 *      restatement of its incumbent's API.
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
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree, and `compat.ts` is not an export
import { DROP_INS, GRADED_VERSIONS } from '../packages/burgee/src/compat.js';

import { entriesOf, FAMILY_SITE_REFERENCES, incumbentDocs, incumbentPackage, LINKS_OUT, orphans, pages, prose, REFERENCED, renderEntry, renderLinkOut, SIDE_EFFECT_ONLY, spacedSpan, STANDARD_SITES, stale } from './api-reference.js';

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

/**
 * Whether the module behind `types` is listed in its package's `sideEffects`: the one way an entry
 * may export nothing. Anything else with no exports is an unbuilt `dist/`, and still fails.
 */
function sideEffectEntry(pkg: string, types: string): boolean {
  const dir = join(ROOT, 'packages', pkg);
  const listed = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { sideEffects?: boolean | string[] }).sideEffects;
  return Array.isArray(listed) && listed.some((file) => resolve(dir, file) === types.replace(/\.d\.ts$/, '.js'));
}

describe.each(REFERENCED.map((pkg) => [pkg] as const))('%s: the API reference', (pkg) => {
  const app = appForPackage(pkg);
  if (app === undefined) throw new Error(`${pkg} is in REFERENCED and has no app`);
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
    if (names.length === 0 && sideEffectEntry(pkg, entry.types)) {
      // `seniority/dotenv/config`, as `dotenv/config` is: declared a side effect in the manifest,
      // and its page says that importing it is the whole of its API.
      expect(page, `${entry.specifier} exports nothing and its page does not say so`).toContain(SIDE_EFFECT_ONLY);
      return;
    }
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

  it.each(entries.map((e) => [e.specifier, e] as const))('%s is documented in full, or is a graded drop-in that links to its incumbent', (_specifier, entry) => {
    const page = readFileSync(join(ROOT, app.dir, 'content/docs/api', `${entry.slug}.md`), 'utf8');
    // Which entries link out is read from DROP_INS here, not from the generator's `linksOut`.
    const dropIn = FAMILY_SITE_REFERENCES.includes(pkg) ? DROP_INS.find((d) => d.to === entry.specifier) : undefined;
    const why = dropIn === undefined ? `${entry.specifier} is not a graded drop-in on the family app, and its page only links out` : `${entry.specifier} is a drop-in for ${dropIn.from}, and its page restates the API`;
    expect(page.includes(LINKS_OUT), why).toBe(dropIn !== undefined);
    if (dropIn === undefined) return;
    const incumbent = incumbentPackage(dropIn.from);
    const version = GRADED_VERSIONS[incumbent];
    expect(version, `GRADED_VERSIONS has no release for ${incumbent}`).toBeDefined();
    expect(page).toContain(`](${incumbentDocs(incumbent, version ?? '')})`);
    expect(page).toContain('](/docs/compatibility)');
    expect(page, "a drop-in page states no signatures: they are the incumbent's").not.toContain('```ts');
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

  it('a drop-in page that loses a name is caught by the export check', () => {
    const [family] = FAMILY_SITE_REFERENCES;
    const entry = family === undefined ? undefined : entriesOf(family).find((e) => e.specifier === 'burgee/yargs/helpers');
    const dropIn = DROP_INS.find((d) => d.to === 'burgee/yargs/helpers');
    if (entry === undefined || dropIn === undefined) throw new Error('no burgee/yargs/helpers entry to mutate');
    const page = renderLinkOut({ entry, docs: [], dropIn });
    expect(page).toContain(LINKS_OUT);
    expect(exportedNames(entry.types).filter((name) => !page.includes(`### ${name}\n`) && !page.includes(`| \`${name}\` |`))).toContain('hideBin');
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

  it('says when a doc comment quotes a code span that opens or closes on a space', () => {
    expect(spacedSpan('because `Done: ` reads worse than `Done`')).toBe(true);
    expect(spacedSpan('`plain` and `` chalk`{red x}` `` are not')).toBe(false);
  });
});
