/**
 * A package's capability matrix: what it does, against the packages it replaces, with the
 * evidence for every cell. The data is `packages/<pkg>/capabilities.json`, beside the
 * `competitors.json` that names what the package is measured against; this module reads it,
 * resolves every cell to a link, and renders the plain-Markdown twin the `.md` routes and
 * `/llms-full.txt` serve. `<CapabilityMatrix>` renders the same data as HTML.
 *
 * Nothing here decides whether a claim is true. `scripts/capabilities-lock.test.ts` does:
 * every "yes" of ours names a test that exists and contains the title it cites, or a
 * compat-oracle grade; every incumbent cell names a source at the version the oracle grades,
 * and a local source is checked for the text it quotes (or must lack). This module only
 * turns what the lock has already held into something a reader can follow.
 *
 * Files are read from `packages/` and `node_modules/` relative to the working directory, as
 * `packages.ts` does: `next build` and vitest run with `apps/<app>` as the cwd, and scripts
 * pass the repository root.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { REPO } from './site';

/** The repository root, from the app directory `next build` runs in. */
const ROOT = resolve(process.cwd(), '..', '..');

/**
 * What a cell says. `n/a` is not a softer `no`: it means the capability does not apply to
 * that package at all (a table library never hides the cursor), and it must say why.
 */
export type Status = 'yes' | 'partial' | 'no' | 'n/a';

/** Our side of a row: a test that proves it, or the incumbent's own suite grading us. */
export interface Ours {
  readonly status: 'yes' | 'partial' | 'no';
  /** A repo-relative test file. */
  readonly test?: string;
  /** A substring of a `describe`/`it`/`test` title in that file. */
  readonly title?: string;
  /** A compat-oracle baseline, `packages/compat-oracle/baseline/<host>.json`. */
  readonly grade?: string;
  /** What is missing, for `partial` and `no`. */
  readonly missing?: string;
}

/** An incumbent's side of a row. */
export interface Cell {
  readonly status: Status;
  /**
   * A pinned URL, or a repo-relative path into `node_modules/` (the version compat-oracle
   * grades) or `packages/compat-oracle/vendor/` (the incumbent's own suite at that version).
   */
  readonly source: string;
  /** Text the local source must contain. */
  readonly quote?: string;
  /** Text the local source must not contain. */
  readonly lacks?: string;
  /** What is missing, for `partial`. */
  readonly missing?: string;
  /** Why the row does not apply, for `n/a`; any other context otherwise. */
  readonly note?: string;
}

export interface Row {
  readonly capability: string;
  /** One sentence: what a user gets. */
  readonly why: string;
  readonly ours: Ours;
  readonly incumbents: Readonly<Record<string, Cell>>;
}

export interface Theme {
  readonly theme: string;
  readonly rows: readonly Row[];
}

export interface Capabilities {
  readonly $comment?: string;
  readonly package: string;
  /** Column order. Every row fills every one of these, and no other. */
  readonly incumbents: readonly string[];
  readonly themes: readonly Theme[];
}

/** `packages/<pkg>/capabilities.json`, relative to `root`. */
export const capabilitiesPath = (pkg: string, root: string = ROOT): string => join(root, 'packages', pkg, 'capabilities.json');

/** A package's matrix, or a build failure naming the file that is missing. */
export function readCapabilities(pkg: string, root: string = ROOT): Capabilities {
  const file = capabilitiesPath(pkg, root);
  if (!existsSync(file)) throw new Error(`<CapabilityMatrix pkg="${pkg}"> has no data: ${file} does not exist.`);
  return JSON.parse(readFileSync(file, 'utf8')) as Capabilities;
}

/** The themes a matrix renders: all of them, or only the one named. */
export function themesOf(caps: Capabilities, theme?: string): readonly Theme[] {
  if (theme === undefined) return caps.themes;
  const found = caps.themes.filter((t) => t.theme === theme);
  if (found.length === 0) throw new Error(`${caps.package} has no capability theme "${theme}". Known: ${caps.themes.map((t) => t.theme).join(', ')}`);
  return found;
}

/** A compat-oracle baseline: how many of the host's own tests we pass. */
export interface Grade {
  readonly passed: number;
  readonly reference: number;
}

export function readGrade(path: string, root: string = ROOT): Grade {
  const { passed, reference } = JSON.parse(readFileSync(join(root, path), 'utf8')) as Grade;
  return { passed, reference };
}

/** A file in this repository, on GitHub. */
export const blobUrl = (path: string): string => `${REPO}/blob/main/${path}`;

/**
 * The package a `node_modules/…` path belongs to: the last `node_modules` segment's package,
 * scoped or not, and the path inside it. `node_modules/ora/node_modules/chalk/source/x.js`
 * is chalk's `source/x.js`, installed under ora.
 */
export function packageOfPath(path: string): { readonly name: string; readonly dir: string; readonly rest: string } | undefined {
  const at = path.lastIndexOf('node_modules/');
  if (at === -1) return undefined;
  const after = path.slice(at + 'node_modules/'.length).split('/');
  const width = after[0]?.startsWith('@') === true ? 2 : 1;
  const name = after.slice(0, width).join('/');
  return { name, dir: path.slice(0, at + 'node_modules/'.length) + name, rest: after.slice(width).join('/') };
}

/**
 * Where a reader follows an incumbent cell. A URL is itself; a vendored suite is its file on
 * GitHub; an installed file is that file in the published tarball of the exact version
 * installed, on jsDelivr — `node_modules` means nothing on the web, the version does.
 */
export function sourceUrl(source: string, root: string = ROOT): string {
  if (/^https?:\/\//u.test(source)) return source;
  const pkg = packageOfPath(source);
  if (pkg === undefined) return blobUrl(source);
  const manifest = join(root, pkg.dir, 'package.json');
  const version = existsSync(manifest) ? (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version : 'latest';
  return `https://cdn.jsdelivr.net/npm/${pkg.name}@${version}/${pkg.rest}`;
}

/** Where a reader follows our cell. */
export function oursUrl(ours: Ours): string | undefined {
  if (ours.test !== undefined) return blobUrl(ours.test);
  if (ours.grade !== undefined) return blobUrl(ours.grade);
  return undefined;
}

export const SYMBOL: Readonly<Record<Status, string>> = { yes: '✓', partial: '◐', no: '✗', 'n/a': '—' };
export const LABEL: Readonly<Record<Status, string>> = { yes: 'yes', partial: 'partial', no: 'no', 'n/a': 'does not apply' };

/** The words a cell carries besides its symbol: a grade's count, or what is missing. */
export function oursDetail(ours: Ours, root: string = ROOT): string {
  if (ours.grade !== undefined) {
    const { passed, reference } = readGrade(ours.grade, root);
    return `${passed.toLocaleString('en-US')} / ${reference.toLocaleString('en-US')} of its own tests`;
  }
  return ours.missing ?? '';
}

/** An incumbent cell's words: what is missing when partial, otherwise its note, if any. */
export function cellDetail(cell: Cell): string {
  return cell.status === 'partial' ? (cell.missing ?? '') : (cell.note ?? '');
}

/** A Markdown table cell cannot hold a pipe or a newline. */
const md = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

/**
 * The matrix as plain Markdown: one table per theme, every cell a link to its evidence. This
 * is what `/llms-full.txt` and a page's `.md` twin carry in place of the component, so an
 * agent reads the same claims, and the same evidence, as a person does.
 */
export function capabilityMarkdown(pkg: string, options: { readonly theme?: string; readonly root?: string } = {}): string {
  const root = options.root ?? ROOT;
  const caps = readCapabilities(pkg, root);
  const head = `| Capability | **${caps.package}** | ${caps.incumbents.join(' | ')} |`;
  const rule = `| :-- | ${[caps.package, ...caps.incumbents].map(() => ':--').join(' | ')} |`;
  const sections = themesOf(caps, options.theme).map((theme) => {
    const rows = theme.rows.map((row) => {
      const oursHref = oursUrl(row.ours);
      const oursText = [SYMBOL[row.ours.status], oursDetail(row.ours, root)].filter((s) => s !== '').join(' ');
      const ours = oursHref === undefined ? oursText : `[${oursText}](${oursHref})`;
      const cells = caps.incumbents.map((name) => {
        const cell = row.incumbents[name];
        if (cell === undefined) return '';
        const text = [SYMBOL[cell.status], cellDetail(cell)].filter((s) => s !== '').join(' ');
        return `[${md(text)}](${sourceUrl(cell.source, root)})`;
      });
      return `| **${md(row.capability)}** — ${md(row.why)} | ${md(ours)} | ${cells.join(' | ')} |`;
    });
    return [`### ${theme.theme}`, '', head, rule, ...rows].join('\n');
  });
  const legend = '✓ yes · ◐ partial (what is missing is said) · ✗ no · — does not apply. Every cell links to its evidence: our test or grade, or the incumbent’s source at the version compat-oracle grades.';
  return [legend, '', ...sections.flatMap((s) => [s, ''])].join('\n').trimEnd();
}

/** `<CapabilityMatrix pkg="…" theme="…" />`, as it appears in MDX source. */
const TAG = /<CapabilityMatrix\b([^>]*?)\/>/gu;
const ATTR = /(\w+)="([^"]*)"/gu;

/**
 * Replace every `<CapabilityMatrix … />` in MDX source with its Markdown. The `.md` twin and
 * `/llms-full.txt` are built from the raw source, where a component is only a tag — an agent
 * reading `<CapabilityMatrix pkg="flagstaff" />` learns nothing about flagstaff.
 */
export function expandCapabilityMatrices(source: string, root: string = ROOT): string {
  return source.replace(TAG, (_tag, attrs: string) => {
    const props = Object.fromEntries([...attrs.matchAll(ATTR)].map((m) => [m[1], m[2]]));
    const pkg = props.pkg;
    if (pkg === undefined || pkg === '') throw new Error('<CapabilityMatrix> needs a pkg="…" attribute');
    return capabilityMarkdown(pkg, { theme: props.theme, root });
  });
}
