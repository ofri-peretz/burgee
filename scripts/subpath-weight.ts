/**
 * What every published subpath costs a consumer, after tree shaking — the whole surface, in
 * one table, generated.
 *
 * ## The question this answers that B4 does not
 *
 * B4 measures fifteen *pairs*: an entry point of ours against the package it replaces. That is
 * the right shape for a claim and the wrong shape for a reader, because it covers fifteen of
 * the **77 code subpaths this repository publishes**. A consumer choosing `flagstaff/progress`
 * or `caique/decide` or `seniority/find-up` had no number at all, and the weight locks inside
 * each package measure the *on-disk static graph*, which is a different quantity from what a
 * bundler puts in an application.
 *
 * ## Two numbers per subpath, because tree shaking makes it a range
 *
 * "What does this import cost" has no single answer: it depends on how much of the module the
 * caller uses. So each row carries both ends of the range.
 *
 *   - **one symbol** — the fixture imports a single export. The floor: what a consumer pays to
 *     reach into this subpath at all.
 *   - **everything** — the fixture re-exports the whole namespace, so nothing can be shaken
 *     away. The ceiling: what a consumer pays who uses the entire surface.
 *
 * A subpath whose two numbers are far apart is one that tree-shakes well and whose consumers
 * mostly pay the floor. A subpath where they are equal is one module that comes as a unit, and
 * that is worth knowing before importing it rather than after.
 *
 * Both are the **initial load**: the entry chunk plus the transitive closure of its `import`
 * statements, measured with `--splitting` so an `await import()` behind a branch costs nothing
 * until the branch runs. The same definition B4 uses, from the same function, because two
 * definitions of "bundled bytes" in one repository is how the two disagree.
 *
 * `--check` regenerates into memory and exits non-zero if the committed page differs anywhere
 * but its generation stamp, which is what makes "do not edit by hand" true rather than
 * aspirational. CI runs it after the build (compat.yml, `ratchet`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { initialBytes, type Metafile } from 'benchmarks/axes/weight.js';
import { resolvePackage } from 'benchmarks/resolve.js';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and `released` is the one place a package released ahead of its flip is decided
import { released } from '../apps/docs-chassis/src/packages';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BENCH_ROOT = join(REPO_ROOT, 'benchmarks');
const SCRATCH = join(BENCH_ROOT, '.subpaths');
const PAGE = join(REPO_ROOT, 'apps/docs/content/docs/weight.mdx');

interface Manifest {
  name: string;
  private?: boolean;
  exports?: Record<string, unknown>;
}

/** Every published package, and every code subpath it publishes. Data exports are not code. */
function surface(): { pkg: string; subpaths: string[] }[] {
  const out: { pkg: string; subpaths: string[] }[] = [];
  for (const dir of readdirSync(join(REPO_ROOT, 'packages')).sort()) {
    const manifestPath = join(REPO_ROOT, 'packages', dir, 'package.json');
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
    } catch {
      continue;
    }
    // Released, not merely published: a package whose pending docs app is built ahead of its flip
    // to `private: false` is priced already, so the flip changes nothing here.
    if (!released(manifest)) continue;
    const subpaths = Object.keys(manifest.exports ?? {}).filter((k) => !k.endsWith('.json'));
    if (subpaths.length > 0) out.push({ pkg: manifest.name, subpaths });
  }
  return out;
}

/**
 * The names a subpath exports, read in a child process.
 *
 * A child, not this one: importing every module in the repository means running every module's
 * top-level code, and `closeout` attaches nine process listeners, `paratext` registers seven
 * capabilities. None of that should happen inside a script that is only counting bytes, and a
 * child process is the seam that costs nothing to be sure about.
 */
/**
 * The child's program, a **constant**. The specifier travels in the environment rather than
 * being interpolated into it, so there is no string built from data on the way to a `-e`, and
 * the lint rule that would otherwise be disabled here has nothing to complain about — which is
 * a better outcome than an exemption with a paragraph attached. The names are ours, out of our
 * own `package.json`, and it is still not worth building a program out of them.
 */
// `'module.exports'` is dropped: Node adds it to every CommonJS namespace (closeout's
// `signal-exit` façade is one), and it is a key, not a name `import { … }` can spell.
const READ_EXPORTS = `import(process.env.SUBPATH_SPECIFIER).then((m) => { process.stdout.write(JSON.stringify(Object.keys(m).filter((k) => k !== 'module.exports'))); process.exit(0); }, () => { process.stdout.write('[]'); process.exit(0); });`;

/** How long a module gets to load before it is assumed to be hanging, in ms. */
const IMPORT_BUDGET = 30_000;

/**
 * The names a subpath exports, read in a child process.
 *
 * A child, not this one: importing every module in the repository means running every module's
 * top-level code, and `closeout` attaches nine process listeners while `paratext` registers
 * seven capabilities. None of that should happen inside a script that is only counting bytes.
 *
 * `process.exit(0)` after writing, and the status ignored on the way back. Both matter:
 * `burgee/cli` leaves the loop non-empty and the process leaving with a code of its own, and a
 * listener attached by `closeout` would keep a child alive indefinitely. The names are on
 * stdout by then either way.
 */
function exportsOf(specifier: string): string[] {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', READ_EXPORTS], {
    cwd: BENCH_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: IMPORT_BUDGET,
    env: { ...process.env, SUBPATH_SPECIFIER: specifier },
  });
  const out = (run.stdout ?? '').trim();
  if (out === '') throw new Error(`could not read the exports of ${specifier} — the child wrote nothing in ${String(IMPORT_BUDGET)} ms`);
  return JSON.parse(out) as string[];
}

function esbuildBin(): string {
  return join(resolvePackage('esbuild').dir, 'bin', 'esbuild');
}

/** Bundle one fixture and return its initial load: the entry chunk and everything it statically imports. */
function bundled(stem: string, source: string): number {
  mkdirSync(SCRATCH, { recursive: true });
  const file = join(SCRATCH, `${stem}.mjs`);
  writeFileSync(file, source);
  const outdir = join(SCRATCH, `${stem}.chunks`);
  rmSync(outdir, { recursive: true, force: true });
  const metafile = join(SCRATCH, `${stem}.meta.json`);
  execFileSync(esbuildBin(), [file, '--bundle', '--minify', '--format=esm', '--platform=node', '--splitting', `--outdir=${outdir}`, `--metafile=${metafile}`], {
    cwd: BENCH_ROOT,
    stdio: 'pipe',
  });
  return initialBytes(JSON.parse(readFileSync(metafile, 'utf8')) as Metafile, `${stem}.js`);
}

interface Row {
  pkg: string;
  specifier: string;
  names: number;
  /** The cheapest export to import, and its name. */
  cheapest: { name: string; bytes: number };
  /** The dearest, and its name — the one worth knowing about before you reach for it. */
  dearest: { name: string; bytes: number };
  /** Everything, so nothing can be shaken away. */
  all: number;
}

/**
 * Every export of every subpath, bundled on its own.
 *
 * The first draft measured *one* symbol — whichever sorted first — and the column it produced
 * said almost nothing: `bellpull`'s alphabetically-first export is a constant, so the row read
 * 38 bytes and a reader would have concluded the package is free. Bundling each export
 * separately costs about six hundred esbuild runs and thirty seconds, and turns the column into
 * the thing a reader wants: **which symbol is cheap, which is expensive, and by how much.**
 */
function measure(): Row[] {
  const rows: Row[] = [];
  for (const { pkg, subpaths } of surface()) {
    for (const subpath of subpaths) {
      const specifier = subpath === '.' ? pkg : `${pkg}/${subpath.slice(2)}`;
      const names = exportsOf(specifier);
      const stem = specifier.replaceAll('/', '__').replaceAll('@', '');
      if (names.length === 0) {
        // A side-effect entry — `seniority/dotenv/config`, as `dotenv/config` is — exports
        // nothing, and importing it is the whole of using it. Its one row is that import, so it
        // is priced rather than skipped: skipping is how it would have had no row at all.
        const bytes = bundled(`${stem}--import`, `import ${JSON.stringify(specifier)};\n`);
        rows.push({ pkg, specifier, names: 0, cheapest: { name: 'import', bytes }, dearest: { name: 'import', bytes }, all: bytes });
        continue;
      }
      const each = names.toSorted().map((name, i) => ({
        name,
        bytes: bundled(
          `${stem}--${String(i)}`,
          name === 'default'
            ? `import x from ${JSON.stringify(specifier)};\nexport default x;\n`
            : `import { ${name} } from ${JSON.stringify(specifier)};\nexport { ${name} };\n`,
        ),
      }));
      const sorted = each.toSorted((a, b) => a.bytes - b.bytes);
      rows.push({
        pkg,
        specifier,
        names: names.length,
        cheapest: sorted[0] as { name: string; bytes: number },
        dearest: sorted.at(-1) as { name: string; bytes: number },
        // `export *` does **not** re-export `default` — that is the spec, and it read
        // `burgee/meow` (whose only export is a default) as **0 bytes**. The default is named
        // explicitly when the module has one, or the ceiling is a hole exactly where a façade's
        // whole surface lives.
        all: bundled(
          `${stem}--all`,
          `export * from ${JSON.stringify(specifier)};\n${names.includes('default') ? `export { default } from ${JSON.stringify(specifier)};\n` : ''}`,
        ),
      });
    }
  }
  return rows;
}

const num = (n: number): string => n.toLocaleString('en-US');

/**
 * The date and commit the numbers were taken at, on the page.
 *
 * This page is generated from `dist/`, so a pull request that changes a byte of a published
 * entry changes the page, and has to commit it: `--check` runs after the build in compat.yml's
 * required `ratchet` job and compares every line but this one ({@link staleRows}). It was once
 * judged a gate nobody could keep green and run nowhere, and the page then printed #1139's
 * commander entries 5 B light while `OVER_INCUMBENT` read its ratchet from them. Completeness
 * (`subpath-weight-lock.test.ts`) and the age of this stamp are still checked as well.
 */
/** `YYYY-MM-DD`, the first ten characters of an ISO timestamp. */
const ISO_DATE = 10;

function stamp(): string {
  return new Date().toISOString().slice(0, ISO_DATE);
}

const GIT_ARGS = ['rev-parse', '--short', 'HEAD'];

function commit(): string {
  try {
    return execFileSync('git', GIT_ARGS, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function page(rows: Row[]): string {
  const byPackage = new Map<string, Row[]>();
  for (const row of rows) byPackage.set(row.pkg, [...(byPackage.get(row.pkg) ?? []), row]);
  const sections = [...byPackage]
    .map(([pkg, group]) => {
      const lines = group
        .toSorted((a, b) => a.all - b.all)
        .map(
          (r) =>
            `| \`${r.specifier}\` | ${String(r.names)} | \`${r.cheapest.name}\` ${num(r.cheapest.bytes)} | \`${r.dearest.name}\` ${num(r.dearest.bytes)} | ${num(r.all)} |`,
        );
      return `### \`${pkg}\`\n\n| Subpath | Exports | Cheapest | Dearest | Everything |\n| :--- | ---: | ---: | ---: | ---: |\n${lines.join('\n')}`;
    })
    .join('\n\n');
  return `---
title: Weight, per subpath
description: What every published entry point costs a consumer's bundle, at both ends of the tree-shaking range.
---

{/* Generated by \`npm run weight:page\`. Do not edit by hand. */}

Generated ${stamp()} at commit \`${commit()}\`.

Every entry point this repository publishes, and what it costs a consumer's bundle. **${num(rows.length)} subpaths across ${String(byPackage.size)} packages**, every export of every one of them bundled on its own.

Three numbers, because tree shaking makes this a range rather than a figure:

- **Cheapest** — the export that costs least to import, and its name.
- **Dearest** — the export that costs most. The one worth knowing about before you reach for it.
- **Everything** — the whole namespace re-exported, so nothing can be shaken away.

A wide spread means the subpath shakes well and most consumers pay near the left-hand number.
A narrow one means it arrives as a unit, which is worth knowing before importing it rather than
after.

All three are the **initial load**: the entry chunk plus the transitive closure of its \`import\`
statements, bundled with \`esbuild --bundle --minify --format=esm --platform=node --splitting\`.
A chunk reached only through \`await import()\` costs nothing until that branch runs, which is
what a real bundler does and what the figures on [/docs/benchmarks](/docs/benchmarks) mean too — the
same function produces both.

${sections}
`;
}

/** The one line that changes on every run without anything having been measured differently. */
const STAMP = /^Generated \d{4}-\d{2}-\d{2} at commit `[^`]*`\.$/m;

/**
 * Where the committed page and a fresh measurement disagree, line by line, the stamp aside.
 *
 * The stamp is the date and commit the numbers were taken at, so comparing it would fail every
 * run on a day after the page was written, and nothing could keep that gate green. Every other
 * line is a measurement or the prose around one, and is compared exactly: #1139 added 5 B to
 * all three commander entries, and the page went on printing the old numbers, because this
 * check compared the whole page and so ran nowhere.
 */
export function staleRows(committed: string, fresh: string): string[] {
  const a = committed.replace(STAMP, '').split('\n');
  const b = fresh.replace(STAMP, '').split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) out.push(`page: ${a[i] ?? '(nothing)'}\n  this build: ${b[i] ?? '(nothing)'}`);
  }
  return out;
}

function main(): void {
  const check = process.argv.includes('--check');
  rmSync(SCRATCH, { recursive: true, force: true });
  let text: string;
  try {
    text = page(measure());
  } finally {
    rmSync(SCRATCH, { recursive: true, force: true });
  }
  if (!check) {
    mkdirSync(dirname(PAGE), { recursive: true });
    writeFileSync(PAGE, text);
    process.stdout.write(`wrote ${PAGE.replace(`${REPO_ROOT}/`, '')}\n`);
    return;
  }
  const committed = statSync(PAGE, { throwIfNoEntry: false }) === undefined ? '' : readFileSync(PAGE, 'utf8');
  const stale = staleRows(committed, text);
  if (stale.length === 0) return;
  process.stderr.write(
    `✖ ${PAGE.replace(`${REPO_ROOT}/`, '')} is not what \`npm run weight:page\` produces from this build:\n  ${stale.join('\n  ')}\n` +
      `  Run it and commit the result — the page says "Do not edit by hand" and this is what makes that true.\n`,
  );
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
