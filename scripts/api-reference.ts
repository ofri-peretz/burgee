/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The API reference of a package's site, generated from what the package actually ships.
 *
 * One page per entry point in `exports` — `.` and every subpath with `types` — under the
 * package's own app at `content/docs/api/<entry>.md`, each listing every export of that entry
 * with its signature, its doc comment, its parameters and any `@example`. It reads the built
 * `dist/**\/*.d.ts` through the TypeScript checker, not the source: the declarations are the
 * surface a user's editor sees, `export *` chains resolved and nothing internal leaking in.
 *
 * An export whose declaration lives in *another* entry's file is not documented twice: its
 * row links to the page that owns it, so `flagstaff` (which re-exports every subpath) is a map
 * rather than a copy. `scripts/api-reference-lock.test.ts` fails when a page is stale, when
 * an export has no entry, and when a file under `api/` is no longer owned.
 *
 * Output is `.md`, not `.mdx`, for the reason `sync-package-docs.ts` gives: doc comments are
 * full of `{`, `<T>` and `a | b` that MDX would parse as JSX.
 *
 *   npx tsx scripts/api-reference.ts [--check]     (build the packages first)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read the app table through its one typed reader rather than re-parsing it
import { appForPackage } from '../apps/docs-chassis/src/config';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The packages whose sites carry the standard page set — getting started, guides, why,
 * compatibility, API reference, recipes, FAQ, changelog. flagstaff is the model; a package
 * joins by being added here once its hand-written pages exist, and the lock then holds its
 * reference and changelog in sync.
 */
export const STANDARD_SITES: readonly string[] = ['flagstaff', 'seniority'];

type ExportTarget = string | { types?: string; import?: string; default?: string };
interface Manifest {
  name: string;
  exports?: Record<string, ExportTarget>;
}

/** One entry point: its specifier, its page slug, and the declaration file behind it. */
export interface Entry {
  readonly specifier: string;
  readonly slug: string;
  readonly types: string;
}

/** The declaration file an `exports` target names, if it names one. */
function typesOf(target: ExportTarget): string | undefined {
  if (typeof target !== 'string') return target.types;
  return target.endsWith('.d.ts') ? target : undefined;
}

/** Every entry point with a declaration file, in `exports` order. `.` is the `index` page. */
export function entriesOf(pkg: string): Entry[] {
  const dir = join(REPO_ROOT, 'packages', pkg);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;
  return Object.entries(manifest.exports ?? {}).flatMap(([key, target]) => {
    const types = typesOf(target);
    if (types === undefined) return [];
    const subpath = key === '.' ? '' : key.slice('./'.length);
    return [{ specifier: subpath === '' ? manifest.name : `${manifest.name}/${subpath}`, slug: subpath === '' ? 'index' : subpath, types: resolve(dir, types) }];
  });
}

type Kind = 'function' | 'class' | 'const' | 'interface' | 'type' | 'enum' | 'namespace';
const KIND_ORDER: readonly Kind[] = ['function', 'class', 'const', 'enum', 'namespace', 'interface', 'type'];
const KIND_HEADING: Readonly<Record<Kind, string>> = { function: 'Functions', class: 'Classes', const: 'Constants', enum: 'Enums', namespace: 'Namespaces', interface: 'Interfaces', type: 'Types' };

/** One export of one entry, as its page states it. */
export interface Documented {
  readonly name: string;
  /** For the default export: the name it is declared under, which is what an import calls it. */
  readonly local?: string;
  readonly kind: Kind;
  /** Set when another entry's page owns the declaration: that entry's slug. */
  readonly owner?: string;
  readonly signatures: readonly string[];
  readonly summary: string;
  readonly params: readonly { name: string; type: string; optional: boolean; doc: string }[];
  readonly returns?: { type: string; doc: string };
  readonly examples: readonly string[];
  readonly deprecated?: string;
}

function kindOf(decl: ts.Declaration): Kind | undefined {
  if (ts.isFunctionDeclaration(decl)) return 'function';
  if (ts.isClassDeclaration(decl)) return 'class';
  if (ts.isVariableDeclaration(decl)) return 'const';
  if (ts.isInterfaceDeclaration(decl)) return 'interface';
  if (ts.isTypeAliasDeclaration(decl)) return 'type';
  if (ts.isEnumDeclaration(decl)) return 'enum';
  if (ts.isModuleDeclaration(decl)) return 'namespace';
  // A member of a CommonJS `export = { … }` object, which is what a named import reaches.
  if (ts.isPropertySignature(decl)) return decl.type !== undefined && ts.isFunctionTypeNode(decl.type) ? 'function' : 'const';
  return undefined;
}

/** A declaration's own text — its members' comments kept, its leading doc comment not. */
function signatureOf(decl: ts.Declaration): string {
  const node = ts.isVariableDeclaration(decl) ? decl.parent.parent : decl;
  return node
    .getText()
    .replace(/^export\s+(?:default\s+)?/u, '')
    .replace(/^declare\s+/u, '');
}

/** A tag's text, whether the compiler hands back a string or display parts. */
const tagText = (tag: ts.JSDocTagInfo): string => (tag.text === undefined ? '' : ts.displayPartsToString(tag.text)).trim();

/** An `@example` as a fenced block: kept as written when it already fences itself. */
function exampleOf(text: string): string {
  return /^```/mu.test(text) ? text : ['```ts', text, '```'].join('\n');
}

/** An export, followed through `export … from` to the symbol it names. */
const resolveExport = (checker: ts.TypeChecker, exported: ts.Symbol): ts.Symbol => (exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported);

/** Every export of an entry's declaration file, unresolved, in the checker's order. */
function exportsOf(checker: ts.TypeChecker, sf: ts.SourceFile): ts.Symbol[] {
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (moduleSymbol === undefined) return [];
  const named = checker.getExportsOfModule(moduleSymbol);
  // A CommonJS `export = { … }` has no named exports to the checker, but Node's CommonJS lexer
  // hands an ES module each property as one, so the properties are the surface.
  const assigned = moduleSymbol.exports?.get(ts.InternalSymbolName.ExportEquals);
  return named.length > 0 || assigned === undefined ? named : checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(assigned, sf));
}

/**
 * Every export of the entry `self`, documented. `owners` says which entry's page documents
 * each declaration, so a re-export of it anywhere else becomes a link rather than a copy.
 */
function documentModule(checker: ts.TypeChecker, sf: ts.SourceFile, self: string, owners: ReadonlyMap<ts.Symbol, string>): Documented[] {
  return exportsOf(checker, sf).flatMap((exported): Documented[] => {
    const target = resolveExport(checker, exported);
    const decls = (target.declarations ?? []).filter((d) => kindOf(d) !== undefined);
    const [first] = decls;
    if (first === undefined) return [];
    const kind = kindOf(first) ?? 'const';
    const name = exported.name;
    const declared = (first as ts.NamedDeclaration).name?.getText();
    const local = name === 'default' && declared !== undefined ? { local: declared } : {};
    const owner = owners.get(target);
    if (owner !== undefined && owner !== self) return [{ name, ...local, kind, owner, signatures: [], summary: '', params: [], examples: [] }];
    const summary = flushLists(ts.displayPartsToString(target.getDocumentationComment(checker)).trim());
    const tags = target.getJsDocTags(checker);
    const paramDocs = new Map(
      tags
        .filter((t) => t.name === 'param')
        .map((t) => {
          const text = tagText(t);
          const [param = '', ...rest] = text.split(/\s+/u);
          return [param, rest.join(' ').replace(/^-\s*/u, '')] as const;
        }),
    );
    const fn = decls.find((d): d is ts.FunctionDeclaration => ts.isFunctionDeclaration(d));
    const params = (fn?.parameters ?? []).map((p) => ({
      name: p.name.getText(),
      type: p.type?.getText() ?? 'unknown',
      optional: p.questionToken !== undefined || p.initializer !== undefined,
      doc: ts.isIdentifier(p.name) ? (paramDocs.get(p.name.text) ?? '') : '',
    }));
    const returnsTag = tags.find((t) => t.name === 'returns' || t.name === 'return');
    const deprecated = tags.find((t) => t.name === 'deprecated');
    return [
      {
        name,
        ...local,
        kind,
        signatures: decls.map(signatureOf),
        summary,
        params,
        ...returnsOf(fn, returnsTag),
        examples: tags.filter((t) => t.name === 'example').map((t) => exampleOf(tagText(t))),
        ...(deprecated === undefined ? {} : { deprecated: tagText(deprecated) || 'Deprecated.' }),
      },
    ];
  });
}

/** A function's declared return type, and what its `@returns` says; nothing for a non-function. */
function returnsOf(fn: ts.FunctionDeclaration | undefined, tag: ts.JSDocTagInfo | undefined): { returns?: { type: string; doc: string } } {
  const type = fn?.type?.getText();
  if (type === undefined) return {};
  return { returns: { type, doc: tag === undefined ? '' : tagText(tag) } };
}

/**
 * A list a doc comment indents under its paragraph (`  - a`), moved flush left: after a blank
 * line it is a top-level list, and Markdown — and the docs' markdownlint — read it as one only
 * at column 0. A list nested under a bullet is left where it is.
 */
function flushLists(text: string): string {
  const lines = text.split('\n');
  let indent = 0;
  return lines
    .map((line, i) => {
      const bullet = /^( +)[-*] /u.exec(line);
      if (bullet !== null && (lines[i - 1] ?? '').trim() === '') indent = bullet[1]?.length ?? 0;
      else if (line.trim() === '') indent = 0;
      return indent > 0 && line.startsWith(' '.repeat(indent)) ? line.slice(indent) : line;
    })
    .join('\n');
}

/** The file's own doc comment: the one before its first statement when that is an import or re-export. */
function moduleDoc(sf: ts.SourceFile): string {
  const [first] = sf.statements;
  if (first === undefined) return '';
  const docs = ts.getLeadingCommentRanges(sf.text, 0) ?? [];
  // A licence header is the file's legal notice, not its documentation, so it is skipped.
  const blocks = docs
    .filter((r) => sf.text.startsWith('/**', r.pos))
    .map((r) => sf.text.slice(r.pos, r.end))
    .filter((block) => !/^\/\*\*\n \* Copyright /u.test(block));
  // The file's own comment is the first one when the first statement is an import or a
  // re-export (which carry no doc of their own), or when a second comment follows it.
  const opensWithImport = ts.isImportDeclaration(first) || ts.isExportDeclaration(first);
  const own = opensWithImport || blocks.length > 1 ? blocks[0] : undefined;
  if (own === undefined) return '';
  return flushLists(
    own
      .replace(/^\/\*\*\s?/u, '')
      .replace(/\s*\*\/$/u, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\* ?/u, ''))
      .join('\n')
      .trim(),
  );
}

/** A Markdown table cell: pipes escaped, one line. */
const cell = (text: string): string => text.replaceAll('|', '\\|').replace(/\s*\n\s*/gu, ' ');

/** A heading id as fumadocs derives it, for links to another entry's section. */
const anchor = (name: string): string => name.toLowerCase().replace(/[^a-z0-9_-]/gu, '');

/** A link to the section of another entry's page that documents `doc`. */
function ownerLink(pkg: string, doc: Documented, entries: readonly Entry[]): string {
  const owner = entries.find((e) => e.slug === doc.owner);
  return `[\`${owner?.specifier ?? pkg}\`](/docs/api${doc.owner === 'index' ? '' : `/${doc.owner}`}#${anchor(doc.name)})`;
}

/** A function's parameters as a table, with a description column only when one is written. */
function paramTable(params: Documented['params']): string[] {
  if (params.length === 0) return [];
  const described = params.some((p) => p.doc !== '');
  const head = described ? ['| Parameter | Type | Description |', '| :-- | :-- | :-- |'] : ['| Parameter | Type |', '| :-- | :-- |'];
  const rows = params.map((p) => {
    const name = `\`${cell(p.name)}\`${p.optional ? ' (optional)' : ''}`;
    const tail = described ? ` ${cell(p.doc)} |` : '';
    return `| ${name} | \`${cell(p.type)}\` |${tail}`;
  });
  return [...head, ...rows, ''];
}

/** `**Returns** \`T\` — what the doc says it is. */
function returnsLine(returns: Documented['returns']): string[] {
  if (returns === undefined) return [];
  const doc = returns.doc === '' ? '' : ` — ${returns.doc}`;
  return [`**Returns** \`${cell(returns.type)}\`${doc}`, ''];
}

/** Overloads, one block, a blank line between them. */
const signatureBlock = (signatures: readonly string[]): string[] => ['```ts', ...signatures.flatMap((sig, i) => (i === 0 ? [sig] : ['', sig])), '```', ''];

/** One export documented on its own page: heading, notes, summary, signature, params, returns, examples. */
function renderExport(doc: Documented): string[] {
  return [
    `### ${doc.name}`,
    '',
    ...(doc.local === undefined ? [] : [`The default export, declared as \`${doc.local}\`.`, '']),
    ...(doc.deprecated === undefined ? [] : [`> **Deprecated.** ${doc.deprecated}`, '']),
    ...(doc.summary === '' ? [] : [doc.summary, '']),
    ...signatureBlock(doc.signatures),
    ...paramTable(doc.params),
    ...returnsLine(doc.returns),
    ...doc.examples.flatMap((example) => ['**Example**', '', example, '']),
  ];
}

/** Types are documented after values, and counted apart in a page's description. */
const isType = (d: Documented): boolean => d.kind === 'interface' || d.kind === 'type';

/** How many value names a description lists before it says "and N more". */
const LISTED = 6;
/** How many names an import line shows before `…`. */
const IMPORTED = 3;

/** `a, b, c, …` — the first few names of an import line. */
const importList = (names: readonly string[]): string => `${names.slice(0, IMPORTED).join(', ')}${names.length > IMPORTED ? ', …' : ''}`;

/** The page's description: the entry, then its values by name and its types by count. */
function describeEntry(entry: Entry, docs: readonly Documented[]): string {
  const values = docs.filter((d) => !isType(d)).map((d) => (d.name === 'default' ? (d.local ?? 'default') : d.name));
  const types = docs.filter(isType).length;
  const listed = values.length > LISTED ? `${values.slice(0, LISTED).join(', ')} and ${values.length - LISTED} more` : values.join(', ');
  const plural = types === 1 ? '' : 's';
  const typeWords = types === 0 ? '' : `${types} type${plural}`;
  const joiner = values.length > 0 && types > 0 ? ', plus ' : '';
  const summary = [listed, typeWords].filter((part) => part !== '').join(joiner);
  return `Every export of ${entry.specifier}, with its signature and doc comment${summary === '' ? '' : `: ${summary}`}.`;
}

/** How a caller imports from the entry: the default, a few values, or the types alone. */
function importLines(entry: Entry, docs: readonly Documented[]): string[] {
  const named = docs.filter((d) => d.name !== 'default' && !isType(d)).map((d) => d.name);
  const typeNames = docs.filter(isType).map((d) => d.name);
  const fallback = docs.find((d) => d.name === 'default');
  const lines = [
    ...(fallback === undefined ? [] : [`import ${fallback.local ?? 'value'} from '${entry.specifier}';`]),
    ...(named.length === 0 ? [] : [`import { ${importList(named)} } from '${entry.specifier}';`]),
    ...(named.length > 0 || typeNames.length === 0 ? [] : [`import type { ${importList(typeNames)} } from '${entry.specifier}';`]),
  ];
  return lines.length === 0 ? [] : ['```ts', ...lines, '```', ''];
}

/** The exports this page documents in full, grouped by kind, the default first in its group. */
function ownSections(docs: readonly Documented[]): string[] {
  const own = docs.filter((d) => d.owner === undefined);
  return KIND_ORDER.flatMap((kind) => {
    const group = own.filter((d) => d.kind === kind).toSorted((a, b) => Number(b.name === 'default') - Number(a.name === 'default') || a.name.localeCompare(b.name));
    return group.length === 0 ? [] : [`## ${KIND_HEADING[kind]}`, '', ...group.flatMap(renderExport)];
  });
}

/** The exports another entry's page documents: a row each, linking there. */
function borrowedSection(pkg: string, docs: readonly Documented[], entries: readonly Entry[]): string[] {
  const borrowed = docs.filter((d) => d.owner !== undefined).toSorted((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
  if (borrowed.length === 0) return [];
  const heading = docs.some((d) => d.owner === undefined) ? '## Re-exported' : '## Exports';
  return [heading, '', 'Documented on the page of the entry point that declares them.', '', '| Export | Kind | Documented in |', '| :-- | :-- | :-- |', ...borrowed.map((doc) => `| \`${doc.name}\` | ${doc.kind} | ${ownerLink(pkg, doc, entries)} |`), ''];
}

/** What one entry's page is made from. */
export interface EntryPage {
  readonly pkg: string;
  readonly entry: Entry;
  readonly docs: readonly Documented[];
  readonly intro: string;
  readonly entries: readonly Entry[];
}

/** One entry's page. */
export function renderEntry({ pkg, entry, docs, intro, entries }: EntryPage): string {
  const body = [
    '---',
    `title: ${entry.specifier}`,
    `description: ${JSON.stringify(describeEntry(entry, docs))}`,
    '---',
    '',
    '<!-- Generated by scripts/api-reference.ts from the built dist/*.d.ts. Do not edit; run `npx tsx scripts/api-reference.ts`. -->',
    '',
    ...(intro === '' ? [] : [intro, '']),
    ...importLines(entry, docs),
    ...ownSections(docs),
    ...borrowedSection(pkg, docs, entries),
  ];
  return `${body.join('\n').trimEnd()}\n`;
}

/** The documented exports of every entry of `pkg`, keyed by slug. Throws when `dist` is missing. */
export function documentPackage(pkg: string): Map<Entry, { docs: Documented[]; intro: string }> {
  const entries = entriesOf(pkg);
  const missing = entries.filter((e) => !existsSync(e.types));
  if (missing.length > 0) throw new Error(`${pkg}: no ${missing.map((e) => relative(REPO_ROOT, e.types)).join(', ')} — build it first (npx turbo run build --filter=${pkg}).`);
  const options: ts.CompilerOptions = { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, noEmit: true, types: ['node'] };
  const program = ts.createProgram(
    entries.map((e) => e.types),
    options,
  );
  const checker = program.getTypeChecker();
  const loaded = entries.map((entry) => {
    const sf = program.getSourceFile(entry.types);
    if (sf === undefined) throw new Error(`${pkg}: the compiler could not load ${entry.types}`);
    return { entry, sf, targets: exportsOf(checker, sf).map((e) => resolveExport(checker, e)) };
  });
  // Who documents each declaration: the entry whose own file declares it; else the first
  // subpath that exports it (a type from an internal file, re-exported); else the root. The
  // root re-exports every subpath, so it documents only what no subpath carries.
  const owners = new Map<ts.Symbol, string>();
  for (const { entry, sf, targets } of loaded) for (const t of targets) if (t.declarations?.[0]?.getSourceFile() === sf) owners.set(t, entry.slug);
  for (const { entry, targets } of [...loaded.filter((l) => l.entry.slug !== 'index'), ...loaded.filter((l) => l.entry.slug === 'index')]) for (const t of targets) if (!owners.has(t)) owners.set(t, entry.slug);
  return new Map(loaded.map(({ entry, sf }) => [entry, { docs: documentModule(checker, sf, entry.slug, owners), intro: moduleDoc(sf) }]));
}

/** Every file this script owns, as `repo-relative path → contents`. */
export function pages(packages: readonly string[] = STANDARD_SITES): Map<string, string> {
  const out = new Map<string, string>();
  for (const pkg of packages) {
    const app = appForPackage(pkg);
    if (app === undefined || app.familyPages) throw new Error(`${pkg} has no site of its own to carry an API reference`);
    const documented = documentPackage(pkg);
    const entries = [...documented.keys()];
    for (const [entry, { docs, intro }] of documented) out.set(`${app.dir}/content/docs/api/${entry.slug}.md`, renderEntry({ pkg, entry, docs, intro, entries }));
    const meta = { title: 'API reference', pages: entries.map((e) => e.slug) };
    out.set(`${app.dir}/content/docs/api/meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
  }
  return out;
}

/** Files under an owned `api/` directory that this script no longer writes. */
export function orphans(owned: ReadonlyMap<string, string>, packages: readonly string[] = STANDARD_SITES): string[] {
  const walk = (dir: string): string[] => (existsSync(join(REPO_ROOT, dir)) ? readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : []);
  return packages.flatMap((pkg) => {
    const app = appForPackage(pkg);
    return app === undefined ? [] : walk(`${app.dir}/content/docs/api`).filter((path) => !owned.has(path));
  });
}

/** The files that differ from what this script would write, and the orphans. */
export function stale(owned: ReadonlyMap<string, string>, packages: readonly string[] = STANDARD_SITES): string[] {
  const differ = [...owned].filter(([file, text]) => {
    const path = join(REPO_ROOT, file);
    return !existsSync(path) || readFileSync(path, 'utf8') !== text;
  });
  return [...differ.map(([file]) => file), ...orphans(owned, packages).map((o) => `${o} (no longer owned)`)];
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const check = process.argv.includes('--check');
  const owned = pages();
  const out = stale(owned);
  if (check) {
    if (out.length > 0) {
      console.error(`Out of date: ${out.join(', ')}. Run \`npx tsx scripts/api-reference.ts\` after building the packages.`);
      process.exit(1);
    }
    console.log('API reference pages are in sync.');
  } else {
    for (const [file, text] of owned) {
      const path = join(REPO_ROOT, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
    for (const orphan of orphans(owned)) rmSync(join(REPO_ROOT, orphan));
    console.log(`Wrote ${out.length} file(s).`);
  }
}
