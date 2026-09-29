/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a capability matrix cannot claim what nothing proves.
 *
 * `packages/<pkg>/capabilities.json` is what each package's "Why <pkg>" page and the
 * front door's comparison render: a row per capability, our cell and one cell per package we
 * replace. A table like that is the easiest place in a repository to over-claim, in both
 * directions — "we have it" because somebody meant to, "they lack it" because somebody
 * assumed — and the owner has already had unsourced figures taken off the vs pages once.
 * So every cell here is evidence or it is not published:
 *
 *   1. **ours.** A `yes` or `partial` names a repo-relative test file that exists and a
 *      substring of a `describe`/`it`/`test` title in it, or a compat-oracle baseline whose
 *      count agrees with the status (`yes` only at passed === reference). `partial` and `no`
 *      say what is missing.
 *   2. **theirs.** Every incumbent cell names a `source`: a URL pinned to a release (never a
 *      moving branch), or a local file under `node_modules/` or the incumbent's own vendored
 *      suite. A local source is read: it must contain what the cell `quote`s and must not
 *      contain what it says it `lacks`, and a `yes` must quote. An installed file must be the
 *      version compat-oracle grades (its vendored suite's PROVENANCE), or a direct dependency
 *      of it that resolves from its directory — not whatever else happens to be hoisted.
 *   3. **the columns.** The incumbents are the ones the package replaces — compat-oracle's
 *      `LAYERS`, all of them — plus any other package the oracle actually grades (a baseline
 *      exists). Every row fills every column and no other.
 *   4. `partial` says what is missing; `n/a` says why the row does not apply.
 *
 * The validator is a pure function of the file and the tree, so the cases at the bottom can
 * hand it one mutation each and watch it refuse — the lock is proven red on fixtures rather
 * than by a note saying somebody once tried.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read it through its one typed reader rather than re-parsing it
import { type Capabilities, type Cell, capabilityMarkdown, packageOfPath, type Row } from '../apps/docs-chassis/src/capabilities';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6)
import { LAYERS } from '../packages/compat-oracle/src/demand.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');
const VENDOR = 'packages/compat-oracle/vendor/';
const BASELINE = 'packages/compat-oracle/baseline/';

const OURS = new Set(['yes', 'partial', 'no']);
const THEIRS = new Set(['yes', 'partial', 'no', 'n/a']);

/** A title substring short enough to match by accident proves nothing. */
const MIN_TITLE = 12;

/**
 * A line that opens a test or a suite: `it(`, `it.each(…)(`, `describe.skipIf(…)(`, `test(` —
 * or the `])('title'` that closes a table spread over several lines by `it.each([`.
 */
const TEST_CALL = /\b(?:describe|it|test)\b(?:\.\w+)*(?:<[^>]*>)?\(|^\s*\]\)\(\s*['"`]/u;

/** A URL on a branch that moves — the page it points at is not the version we graded. */
const MOVING = /\/(?:blob|tree|raw)\/(?:main|master|HEAD)\/|raw\.githubusercontent\.com\/[^/]+\/[^/]+\/(?:main|master|HEAD)\//u;

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/** The version compat-oracle grades for `name`: its vendored suite's PROVENANCE, if it has one. */
function gradedVersion(name: string): string | undefined {
  const provenance = join(ROOT, VENDOR, name, 'PROVENANCE');
  if (!existsSync(provenance)) return undefined;
  return /^version:\s+(\S+)/mu.exec(readFileSync(provenance, 'utf8'))?.[1];
}

const installedVersion = (dir: string): string | undefined => {
  const manifest = join(ROOT, dir, 'package.json');
  return existsSync(manifest) ? (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }).version : undefined;
};

/** Where `dep` resolves from `node_modules/<incumbent>`: nested first, then the root. */
function resolvedFrom(incumbent: string, dep: string): string | undefined {
  return [`node_modules/${incumbent}/node_modules/${dep}`, `node_modules/${dep}`].find((dir) => existsSync(join(ROOT, dir, 'package.json')));
}

/** A problem list: `[]` when the check passes. */
type Found = string[];

/** Blank, or missing entirely. */
const blank = (text: string | undefined): boolean => (text ?? '').trim() === '';

/** A compat-oracle grade that agrees with the status it backs. */
function gradeProblems(at: string, status: string, grade: string): Found {
  if (!grade.startsWith(BASELINE) || !existsSync(join(ROOT, grade))) return [`${at}: grade ${grade} is not a compat-oracle baseline that exists`];
  const { passed, reference } = JSON.parse(read(grade)) as { passed: number; reference: number };
  const full = reference > 0 && passed === reference;
  const some = passed > 0 && passed < reference;
  if (status === 'yes' && !full) return [`${at}: ours is yes, but ${grade} passes ${passed} of ${reference}`];
  if (status === 'partial' && !some) return [`${at}: ours is partial, but ${grade} passes ${passed} of ${reference}`];
  return [];
}

/** A test file that exists and holds the title on a line that opens a test or a suite. */
function testProblems(at: string, test: string, title: string): Found {
  if (!/\.test\.[cm]?[jt]sx?$/u.test(test)) return [`${at}: ${test} is not a test file`];
  if (!existsSync(join(ROOT, test))) return [`${at}: test file ${test} does not exist`];
  if (title.length < MIN_TITLE) return [`${at}: title "${title}" is shorter than ${MIN_TITLE} characters`];
  const lines = read(test)
    .split('\n')
    .filter((line) => line.includes(title));
  if (lines.length === 0) return [`${at}: ${test} contains no "${title}"`];
  if (!lines.some((line) => TEST_CALL.test(line))) return [`${at}: "${title}" is in ${test}, but not on a describe/it/test line`];
  return [];
}

/** Everything wrong with our side of one row. */
function oursProblems(at: string, row: Row): Found {
  const { ours } = row;
  if (!OURS.has(ours.status)) return [`${at}: ours.status "${ours.status}" is not yes, partial or no`];
  const said: Found = ours.status !== 'yes' && blank(ours.missing) ? [`${at}: ours is ${ours.status} and does not say what is missing`] : [];
  if (ours.status === 'no') return said;
  if ((ours.test === undefined) === (ours.grade === undefined)) return [...said, `${at}: ours is ${ours.status} and must name exactly one of test+title or grade`];
  const evidence = ours.grade === undefined ? testProblems(at, ours.test ?? '', ours.title ?? '') : gradeProblems(at, ours.status, ours.grade);
  return [...said, ...evidence];
}

/** What a status obliges a cell to say. */
function statusProblems(at: string, cell: Cell): Found {
  if (!THEIRS.has(cell.status)) return [`${at}: status "${cell.status}" is not yes, partial, no or n/a`];
  if (cell.status === 'partial' && blank(cell.missing)) return [`${at}: partial, and does not say what is missing`];
  if (cell.status === 'n/a' && blank(cell.note)) return [`${at}: n/a, and does not say why`];
  return [];
}

/** A URL source: https, and pinned. */
const urlProblems = (at: string, source: string): Found => [
  ...(source.startsWith('https://') ? [] : [`${at}: ${source} is not https`]),
  ...(MOVING.test(source) ? [`${at}: ${source} is on a moving branch, not the pinned version`] : []),
];

/** A local source: it says what the cell quotes, and not what the cell says it lacks. */
function textProblems(at: string, source: string, cell: Cell): Found {
  const out: Found = [];
  if (cell.quote === undefined && cell.lacks === undefined) out.push(`${at}: a local source must quote the text it relies on or name the text it lacks`);
  if (cell.status === 'yes' && cell.quote === undefined) out.push(`${at}: yes, from a local source, must quote it`);
  const text = read(source);
  if (cell.quote !== undefined && !text.includes(cell.quote)) out.push(`${at}: ${source} does not contain ${JSON.stringify(cell.quote)}`);
  if (cell.lacks !== undefined && text.includes(cell.lacks)) out.push(`${at}: ${source} contains ${JSON.stringify(cell.lacks)}, which the cell says it lacks`);
  return out;
}

/** The direct dependencies an installed incumbent declares. */
function dependenciesOf(incumbent: string): string[] {
  const manifest = join(ROOT, 'node_modules', incumbent, 'package.json');
  if (!existsSync(manifest)) return [];
  return Object.keys((JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> }).dependencies ?? {});
}

/** An installed file: the incumbent at its graded version, or a dependency it actually resolves. */
function installedProblems(at: string, incumbent: string, source: string): Found {
  const pkg = packageOfPath(source);
  if (pkg === undefined) return [`${at}: ${source} names no package`];
  if (pkg.name === incumbent) {
    const graded = gradedVersion(incumbent);
    const installed = installedVersion(pkg.dir);
    return graded === undefined || installed === graded ? [] : [`${at}: ${pkg.dir} is ${installed ?? 'not installed'}, but compat-oracle grades ${incumbent} ${graded}`];
  }
  if (!dependenciesOf(incumbent).includes(pkg.name)) return [`${at}: ${pkg.name} is not a dependency of ${incumbent}, so its source says nothing about ${incumbent}`];
  const resolved = resolvedFrom(incumbent, pkg.name);
  return resolved === pkg.dir ? [] : [`${at}: ${incumbent} resolves ${pkg.name} to ${resolved ?? 'nothing'}, not ${pkg.dir}`];
}

/** A vendored suite: the incumbent's own. */
function vendorProblems(at: string, incumbent: string, source: string): Found {
  const dir = source.slice(VENDOR.length).split('/')[0];
  return dir === incumbent ? [] : [`${at}: ${source} is ${dir}'s vendored suite, not ${incumbent}'s`];
}

/** Where a cell's evidence is, and whether it holds. */
function sourceProblems(at: string, incumbent: string, cell: Cell): Found {
  const source = (cell.source ?? '').trim();
  if (source === '') return [`${at}: no source`];
  if (/^https?:/u.test(source)) return urlProblems(at, source);
  if (!source.startsWith('node_modules/') && !source.startsWith(VENDOR)) return [`${at}: ${source} is neither a URL nor a path under node_modules/ or ${VENDOR}`];
  if (!existsSync(join(ROOT, source))) return [`${at}: ${source} does not exist`];
  const origin = source.startsWith(VENDOR) ? vendorProblems(at, incumbent, source) : installedProblems(at, incumbent, source);
  return [...textProblems(at, source, cell), ...origin];
}

/** Everything wrong with one incumbent's cell. */
const cellProblems = (at: string, incumbent: string, cell: Cell): Found => [...statusProblems(at, cell), ...sourceProblems(at, incumbent, cell)];

/** The incumbents a package's matrix must carry: compat-oracle's LAYERS row for it. */
const replaced = (pkg: string): readonly string[] | undefined => LAYERS.find((layer) => layer.pkg === pkg)?.incumbents;

/** The columns: every incumbent LAYERS names for the package, and only graded extras. */
function columnProblems(dir: string, caps: Capabilities): Found {
  const required = replaced(caps.package);
  if (required === undefined) return [`${dir}: compat-oracle's LAYERS has no row for ${caps.package}`];
  const dropped = required.filter((inc) => !caps.incumbents.includes(inc)).map((inc) => `${dir}: ${inc} is in LAYERS for ${caps.package} and missing from "incumbents"`);
  const ungraded = caps.incumbents
    .filter((inc) => !required.includes(inc) && !existsSync(join(ROOT, BASELINE, `${inc}.json`)))
    .map((inc) => `${dir}: ${inc} is neither in LAYERS for ${caps.package} nor graded by compat-oracle (no ${BASELINE}${inc}.json)`);
  return [...dropped, ...ungraded];
}

/** One row: its words, our side, and a cell for exactly the columns. */
function rowProblems(at: string, caps: Capabilities, row: Row): Found {
  const cells = Object.keys(row.incumbents);
  return [
    ...(blank(row.capability) ? [`${at}: no capability`] : []),
    ...(/^[^\n]+[.]$/u.test(row.why.trim()) ? [] : [`${at}: "why" is not one sentence ending in a full stop`]),
    ...oursProblems(at, row),
    ...caps.incumbents.filter((inc) => !cells.includes(inc)).map((inc) => `${at}: no cell for ${inc}`),
    ...cells.filter((inc) => !caps.incumbents.includes(inc)).map((inc) => `${at}: a cell for ${inc}, which is not a column`),
    ...Object.entries(row.incumbents).flatMap(([inc, cell]) => cellProblems(`${at} · ${inc}`, inc, cell)),
  ];
}

/** The name in `packages/<dir>/package.json`. */
function packageName(dir: string): string {
  const manifest = join(PACKAGES, dir, 'package.json');
  return existsSync(manifest) ? (JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name : dir;
}

/** Everything wrong with one package's matrix. Empty is the only passing answer. */
export function problems(dir: string, caps: Capabilities): Found {
  const name = packageName(dir);
  return [
    ...(caps.package === name ? [] : [`${dir}: "package" is ${caps.package}, not ${name}`]),
    ...columnProblems(dir, caps),
    ...(caps.themes.length === 0 ? [`${dir}: no themes`] : []),
    ...caps.themes.flatMap((theme) => [
      ...(theme.rows.length === 0 ? [`${dir}: theme "${theme.theme}" has no rows`] : []),
      ...theme.rows.flatMap((row) => rowProblems(`${dir} · ${theme.theme} · ${row.capability}`, caps, row)),
    ]),
  ];
}

/** Every `packages/<dir>/capabilities.json`, parsed. */
function matrices(): { dir: string; caps: Capabilities }[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'capabilities.json')))
    .map((e) => ({ dir: e.name, caps: JSON.parse(readFileSync(join(PACKAGES, e.name, 'capabilities.json'), 'utf8')) as Capabilities }));
}

/** Every `.md` and `.mdx` under `dir`, skipping dependencies and dot-directories. */
function contentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : contentFiles(join(dir, e.name));
    return /\.mdx?$/u.test(e.name) ? [join(dir, e.name)] : [];
  });
}

/** Every `<CapabilityMatrix pkg="…">` written in any docs app. */
function usages(): { file: string; pkg: string }[] {
  const apps = readdirSync(join(ROOT, 'apps'), { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(ROOT, 'apps', e.name, 'content')));
  return apps.flatMap((app) => contentFiles(join(ROOT, 'apps', app.name, 'content')).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/<CapabilityMatrix\b[^>]*\bpkg="([^"]+)"/gu)].map((m) => ({ file, pkg: m[1] ?? '' }))));
}

const found = matrices();

describe('every capability matrix is evidence, cell by cell', () => {
  it('finds matrices at all — otherwise every case below asserts nothing', () => {
    expect(found.map((m) => m.dir)).toContain('flagstaff');
  });

  it.each(found.map((m) => [m.dir, m.caps] as const))('%s: every claim has its evidence', (dir, caps) => {
    expect(problems(dir, caps)).toEqual([]);
  });

  it.each(found.map((m) => [m.dir] as const))('%s: renders to Markdown with a link in every cell', (dir) => {
    const text = capabilityMarkdown(dir, { root: ROOT });
    const rows = text.split('\n').filter((line) => line.startsWith('| **'));
    expect(rows.length).toBeGreaterThan(0);
    for (const line of rows) expect(line.split(' | ').slice(1).every((cell) => cell.includes('](https://')), line).toBe(true);
  });

  it('every <CapabilityMatrix> in the docs names a package that has a matrix', () => {
    const missing = usages().filter((u) => !found.some((m) => m.caps.package === u.pkg));
    expect(missing).toEqual([]);
  });
});

/** The first row of the first theme, mutable. */
const first = (caps: Capabilities): Row & { ours: Record<string, unknown>; incumbents: Record<string, Record<string, unknown>> } => caps.themes[0]!.rows[0] as never;

/** `caps` is refused, and for the reason `pattern` names. */
function refused(caps: Capabilities, pattern: RegExp): void {
  const seen = problems('flagstaff', caps);
  expect(
    seen.some((p) => pattern.test(p)),
    `expected a problem matching ${pattern}, got ${JSON.stringify(seen)}`,
  ).toBe(true);
}

/**
 * The lock, red. Each case is the flagstaff matrix with one thing broken, and must be
 * refused for that thing — a validator that returns `[]` for everything passes the case
 * above and none of these.
 */
describe('the lock refuses what it exists to refuse', () => {
  const base = found.find((m) => m.dir === 'flagstaff');
  if (base === undefined) throw new Error('no flagstaff matrix to mutate');
  const clone = (): Capabilities => structuredClone(base.caps) as Capabilities;

  it('a test title the file does not contain', () => {
    const caps = clone();
    first(caps).ours.title = 'a title nobody ever wrote down';
    refused(caps, /contains no "a title nobody ever wrote down"/u);
  });

  it('a test file that does not exist', () => {
    const caps = clone();
    first(caps).ours.test = 'packages/flagstaff/src/imaginary.test.ts';
    refused(caps, /does not exist/u);
  });

  it('a title that is in the file but is not a test title', () => {
    const caps = clone();
    first(caps).ours.title = "import { hoist, manualClock, type Runtime } from './loop.js';";
    first(caps).ours.test = 'packages/flagstaff/src/builtins.test.ts';
    refused(caps, /not on a describe\/it\/test line/u);
  });

  it('a grade marked yes that is not a full pass', () => {
    const caps = clone();
    first(caps).ours = { status: 'yes', grade: 'packages/compat-oracle/baseline/meow.json' };
    refused(caps, /ours is yes, but .*meow\.json passes/u);
  });

  it('ours partial without what is missing', () => {
    const caps = clone();
    first(caps).ours.status = 'partial';
    refused(caps, /does not say what is missing/u);
  });

  it('an incumbent cell with no source', () => {
    const caps = clone();
    first(caps).incumbents.ora!.source = '';
    refused(caps, /ora: no source/u);
  });

  it('a local source that does not contain what it quotes', () => {
    const caps = clone();
    first(caps).incumbents.ora!.quote = 'this string is not in ora';
    refused(caps, /does not contain "this string is not in ora"/u);
  });

  it('a local source that contains what it says it lacks', () => {
    const caps = clone();
    first(caps).incumbents['log-update'] = { status: 'no', source: 'node_modules/log-update/index.js', lacks: 'eraseLines' };
    refused(caps, /contains "eraseLines", which the cell says it lacks/u);
  });

  it('a yes from a local source with nothing quoted', () => {
    const caps = clone();
    first(caps).incumbents.boxen = { status: 'yes', source: 'node_modules/boxen/index.js', lacks: 'isTTY' };
    refused(caps, /must quote it/u);
  });

  it('a URL on a moving branch', () => {
    const caps = clone();
    first(caps).incumbents.ora = { status: 'no', source: 'https://github.com/sindresorhus/ora/blob/main/index.js' };
    refused(caps, /moving branch/u);
  });

  it('a source outside node_modules and the vendored suites', () => {
    const caps = clone();
    first(caps).incumbents.ora = { status: 'no', source: 'packages/flagstaff/src/ora.ts', lacks: 'zzz' };
    refused(caps, /neither a URL nor a path/u);
  });

  it('another incumbent’s vendored suite as the source', () => {
    const caps = clone();
    first(caps).incumbents.ora = { status: 'yes', source: 'packages/compat-oracle/vendor/boxen/tests/main.js', quote: 'import boxen' };
    refused(caps, /boxen's vendored suite, not ora's/u);
  });

  it('a package the incumbent does not depend on', () => {
    const caps = clone();
    first(caps).incumbents.boxen = { status: 'yes', source: 'node_modules/cli-cursor/index.js', quote: 'restoreCursor();' };
    refused(caps, /cli-cursor is not a dependency of boxen/u);
  });

  it('partial without what is missing, n/a without why', () => {
    const caps = clone();
    first(caps).incumbents.ora!.missing = undefined;
    first(caps).incumbents.boxen!.note = undefined;
    refused(caps, /ora: partial, and does not say what is missing/u);
    refused(caps, /boxen: n\/a, and does not say why/u);
  });

  it('an incumbent LAYERS names, dropped', () => {
    const caps = clone();
    (caps as { incumbents: string[] }).incumbents = caps.incumbents.filter((i) => i !== 'boxen');
    refused(caps, /boxen is in LAYERS for flagstaff and missing/u);
  });

  it('an incumbent nothing grades, added', () => {
    const caps = clone();
    (caps as { incumbents: string[] }).incumbents = [...caps.incumbents, 'ink'];
    refused(caps, /ink is neither in LAYERS/u);
    refused(caps, /no cell for ink/u);
  });

  it('a row missing a column', () => {
    const caps = clone();
    delete first(caps).incumbents['cli-table3'];
    refused(caps, /no cell for cli-table3/u);
  });

  it('a why that is not a sentence', () => {
    const caps = clone();
    (first(caps) as { why: string }).why = 'no full stop';
    refused(caps, /not one sentence/u);
  });
});
