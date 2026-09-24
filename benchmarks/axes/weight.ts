/**
 * B4 — weight, measured two ways, both against the package each entry point replaces.
 *
 * **Bundled** (design R7): a fixture importing exactly one entry point and using one
 * symbol, bundled and minified with esbuild. This is what a user's application grows by,
 * which is the number they act on; a tarball size answers a different question.
 *
 * **Installed**: the bytes `npm install` puts on disk for the package and everything it
 * drags with it. Ours drag nothing (U1), so the two columns diverge most here — yargs
 * brings yargs-parser, cliui, y18n, escalade and get-caller-file.
 *
 * The trap this axis is written around: **resolution**. The workspace root has commander
 * **8.3.0** hoisted (a transitive dependency of something else) while the version we grade
 * against is **15.0.0**, which lives in a nested tree. A measurement that resolved from the
 * root would quietly compare burgee's front-end against a commander from 2021. Every
 * package here goes through `resolvePackage` in `../resolve.ts` — the same guard B2 uses —
 * and the resolved path and version are written into every record so the reader can check.
 *
 * The second trap, and the one that made a published number 2.1x wrong: **whose directory
 * a transitive dependency is resolved from**. See `installedBytes`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { sync as crossSpawnSync } from 'bellpull/cross-spawn';

import { DEFAULT_EXPORT, fixtureSource, PAIRS, PARITY, stackFixtureSource, type EntryPair, type ParityStack } from '../fixtures/entry-points.js';
import { type BenchRecord } from '../record.js';
import { BENCH_ROOT, packageDir, relativeToRepo, resolvePackage } from '../resolve.js';
import { round } from '../stats.js';

const REPO_ROOT = resolve(BENCH_ROOT, '..');
/** Generated, gitignored: the fixtures are a projection of `entry-points.ts`. */
const SCRATCH = join(BENCH_ROOT, '.fixtures');
const RATIO_PLACES = 3;

/**
 * Bytes on disk under `dir`, excluding nested `node_modules` — those are counted
 * separately, by `installedBytes` reaching each nested package through the dependency
 * graph. Counting them here as well would double every nested copy.
 */
function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(full) : statSync(full).size;
  }
  return total;
}

/**
 * What `npm install` would put on disk for one package. For a registry package that is
 * the installed directory. For one of ours it is **not**: a workspace resolves to a
 * symlink into `packages/`, whose working directory carries `src/`, source maps and a
 * `.turbo` cache — 1.6 MB of things npm never publishes. `npm pack --dry-run` gives the
 * pack list's unpacked size, which is what a user's `node_modules` actually receives.
 */
function ownInstalledBytes(dir: string): number {
  if (!realpathSync(dir).startsWith(join(REPO_ROOT, 'packages'))) return dirBytes(dir);
  // Through `bellpull`, not `execFileSync('npm', …)`, because `npm` is `npm.cmd` on Windows
  // and neither `spawnSync` nor `execFileSync` searches `PATHEXT` — and since the fix for
  // CVE-2024-27980 Node refuses to spawn a `.cmd` without `shell: true`. This line read the
  // bare name until 2026-09-16 and nothing noticed, because nothing on the Windows leg
  // called it; the moment `docs.test.ts` started measuring the tree it was `spawnSync npm
  // ENOENT`. That is the exact defect bellpull was built for, and the repository's rule is
  // that a problem a package owns is not re-solved at the call site.
  const run = crossSpawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (run.error !== undefined) throw new Error(`npm pack could not run in ${dir}: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`npm pack exited ${String(run.status)} in ${dir}`);
  const stdout = typeof run.stdout === 'string' ? run.stdout : run.stdout.toString('utf8');
  return (JSON.parse(stdout) as { unpackedSize: number }[])[0]?.unpackedSize ?? 0;
}

/**
 * A package's own bytes plus every production dependency it drags in, transitively.
 *
 * Two things here were wrong, and between them they published `boxen`'s installed size as
 * 353,976 bytes where the tree on disk holds **747,463** — a number 2.1x out, in the PR
 * table and on the docs site.
 *
 * 1. **Every dependency was resolved from `benchmarks/`** rather than from the directory
 *    of the package that depends on it. npm nests a package under its depender exactly
 *    when the hoisted copy is the wrong version, so resolving from the top finds the
 *    hoisted copy and never sees the nested one. `boxen` is the extreme case: three
 *    separate installed copies of `string-width` — under `ansi-align`, under `boxen`,
 *    under `widest-line` — all collapsed onto whichever npm happened to hoist. `from` is
 *    now the depender's own directory, so the walk is the one Node itself does at runtime.
 * 2. **Deduplication was by package name**, which is the same mistake stated as a set:
 *    two legitimately distinct installed copies are two directories on disk, and a user
 *    pays for both. The key is the resolved real path.
 *
 * `dirBytes` still skips nested `node_modules`, and with (1) fixed that is exactly right
 * rather than lossy: every nested directory is reached through the dependency graph
 * instead, so each installed copy is counted once and only once. That invariant is not
 * an assumption — `weight.test.ts` walks all seven trees and fails if any nested package
 * is unreachable from the graph, which would mean bytes silently going missing again.
 */
export function installedBytes(name: string, from: string = BENCH_ROOT, seen = new Set<string>()): number {
  const { dir } = packageDir(name, from);
  const key = realpathSync(dir);
  if (seen.has(key)) return 0;
  seen.add(key);
  let total = ownInstalledBytes(dir);
  for (const dep of installedDependencies(dir)) total += installedBytes(dep, dir, seen);
  return total;
}

/**
 * What npm put on disk for a package: its `dependencies`, and each `optionalDependencies`
 * entry that is actually installed. npm installs optional dependencies by default, so leaving
 * them out under-counted every incumbent that has one — cli-table3's `@colors/colors` — which
 * `weight.test.ts`'s nested-install check caught when cli-table3 was first measured here.
 */
export function installedDependencies(dir: string): string[] {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const optional = Object.keys(manifest.optionalDependencies ?? {}).filter((dep) => {
    try {
      packageDir(dep, dir);
      return true;
    } catch {
      return false;
    }
  });
  return [...new Set([...Object.keys(manifest.dependencies ?? {}), ...optional])];
}

/** The package a specifier belongs to: `burgee/commander` is published by `burgee`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
}

/**
 * esbuild's own binary, wherever npm hoisted it — never a `.bin` shim that may not exist.
 *
 * On Windows `esbuild/bin/esbuild` is not something `execFileSync` can start: there is no
 * `.exe` on it, so the spawn is `ENOENT`. The native binary is `esbuild.exe` in the
 * `@esbuild/win32-<arch>` package esbuild installed beside itself, resolved from esbuild's own
 * directory so it is the build that matches. Nothing called this on Windows until
 * `readme-gates-lock.test.ts` put B4's bundle half in the root suite, and the first Windows
 * leg said so.
 */
function esbuildBin(): string {
  const { dir } = resolvePackage('esbuild');
  if (process.platform !== 'win32') return join(dir, 'bin', 'esbuild');
  return join(packageDir(`@esbuild/win32-${process.arch}`, dir).dir, 'esbuild.exe');
}

/**
 * What a user's application grows by, in the two numbers that answer different questions.
 *
 * **`bundled` is the initial load** — the entry chunk plus the transitive closure of every
 * chunk it reaches through an `import` *statement*. It is measured with `--splitting
 * --outdir`, which is what a real bundler does: a literal-specifier `await import()` becomes
 * a chunk fetched when the branch runs, not bytes on the startup path. **`whole` is every
 * chunk together**, the disk cost of the feature set.
 *
 * This used to be one number from `--outfile`, and `--outfile` has no chunks — it inlines
 * every dynamic import into the entry. So `completions.js` (7,662 B), `seniority/config`
 * (4,352 B) and `unknown-option.js` (1,514 B) were all counted as startup weight for a
 * program that reaches none of them unless a user types a completion, a config file exists,
 * or a flag is misspelled.
 *
 * **The closure is not a detail, and measuring the entry chunk alone was wrong.** esbuild puts
 * a module that is reachable both statically from the entry *and* dynamically from some branch
 * into a shared chunk, which the entry then imports with a plain `import` statement — loaded at
 * startup, in a separate file. Measured 2026-09-21 on `burgee/commander`: entry chunk 51,257 B,
 * initial load **59,157 B**, because `schema`, `plugin`, `definition` and `manifest` sit in a
 * 7,681-byte shared chunk that the entry statically imports. Counting the entry chunk alone
 * understated the startup cost of every row that has one, in our favour. `initialBytes` walks
 * `import-statement` edges only, so a `dynamic-import` edge still costs nothing until it runs.
 *
 * **Both numbers are published, and that is the point.** D-074 refused a metric change while
 * the axis was failing — "changing a measurement while it is failing is the one move this
 * repository has the most scar tissue about" — and the way to make it honestly is to add the
 * number that matches the axis's own words rather than to swap one for the other, and to take
 * the correction when it goes against us. Nothing is hidden: the whole-bundle figure stays on
 * every row.
 */
export interface Metafile {
  outputs: Record<string, { bytes: number; entryPoint?: string; imports?: { path: string; kind: string }[] }>;
}

/**
 * The entry chunk plus every chunk reachable from it through `import` statements.
 *
 * A `dynamic-import` edge is deliberately not followed: that chunk is fetched when the branch
 * runs, which is the whole reason `--splitting` is the right command here.
 */
export function initialBytes(meta: Metafile, entryFile: string): number {
  const entry = Object.keys(meta.outputs).find((out) => out.endsWith(`/${entryFile}`));
  if (entry === undefined) throw new Error(`esbuild metafile names no output for ${entryFile}`);
  const seen = new Set<string>();
  const walk = (path: string): void => {
    const output = meta.outputs[path];
    if (output === undefined || seen.has(path)) return;
    seen.add(path);
    for (const edge of output.imports ?? []) if (edge.kind === 'import-statement') walk(edge.path);
  };
  walk(entry);
  let total = 0;
  for (const path of seen) total += meta.outputs[path]?.bytes ?? 0;
  return total;
}

function bundle(side: { specifier: string; symbol: string }, id: string, scratch: string): { initial: number; whole: number } {
  mkdirSync(scratch, { recursive: true });
  const stem = id.replaceAll('/', '__');
  const file = join(scratch, `${stem}.mjs`);
  writeFileSync(file, fixtureSource(side));
  const outdir = join(scratch, `${stem}.chunks`);
  rmSync(outdir, { recursive: true, force: true });
  const metafile = join(scratch, `${stem}.meta.json`);
  // esbuild from the CLI, not the API: one fewer import in a suite that measures imports,
  // and the exact command is quotable in the results file.
  execFileSync(esbuildBin(), [file, '--bundle', '--minify', '--format=esm', '--platform=node', '--splitting', `--outdir=${outdir}`, `--metafile=${metafile}`], {
    cwd: BENCH_ROOT,
    stdio: 'pipe',
  });
  const meta = JSON.parse(readFileSync(metafile, 'utf8')) as Metafile;
  const whole = readdirSync(outdir)
    .filter((f) => f.endsWith('.js'))
    .reduce((sum, f) => sum + statSync(join(outdir, f)).size, 0);
  return { initial: initialBytes(meta, `${stem}.js`), whole };
}

export interface Measured {
  /** The initial load: the entry chunk and every chunk it statically imports. */
  bundled: number;
  /** Every chunk together: the disk cost of the feature set. */
  whole: number;
  installed: number;
  version: string;
  dir: string;
}

/**
 * `installed` is false only for `bundledRecords`, which drops the installed rows: it is the one
 * call that must stay cheap, and `npm pack` over a workspace is the slow half of this axis.
 */
function measure(side: { specifier: string; symbol: string }, id: string, scratch: string = SCRATCH, installed = true): Measured {
  const pkg = packageOf(side.specifier);
  const { dir, version } = resolvePackage(pkg);
  const { initial, whole } = bundle(side, id, scratch);
  return { bundled: initial, whole, installed: installed ? installedBytes(pkg) : Number.NaN, version, dir: relativeToRepo(dir) };
}

/**
 * The incumbent plus everything a user of it installs to reach our capability set, bundled
 * as one program. See `PARITY` in `fixtures/entry-points.ts` for the rule that decides what
 * may be in it — and, more importantly, what may not.
 *
 * One fixture over several packages rather than the sum of several fixtures, because the sum
 * would double-count: `cosmiconfig` and `restore-cursor` share transitive dependencies with
 * each other and with the incumbent, and a user installing all three pays for each shared
 * module once. Bundling them together is what a user's bundler does, so it is what this does.
 */
function stackBytes(stack: ParityStack, incumbent: { specifier: string; symbol: string }, id: string, scratch: string): { initial: number; whole: number } {
  const sides = [incumbent, ...stack.adds.map((a) => ({ specifier: a.specifier, symbol: a.symbol }))];
  mkdirSync(scratch, { recursive: true });
  const stem = `stack-${id.replaceAll('/', '__')}`;
  const file = join(scratch, `${stem}.mjs`);
  writeFileSync(file, stackFixtureSource(sides));
  const outdir = join(scratch, `${stem}.chunks`);
  rmSync(outdir, { recursive: true, force: true });
  const metafile = join(scratch, `${stem}.meta.json`);
  execFileSync(esbuildBin(), [file, '--bundle', '--minify', '--format=esm', '--platform=node', '--splitting', `--outdir=${outdir}`, `--metafile=${metafile}`], {
    cwd: BENCH_ROOT,
    stdio: 'pipe',
  });
  const meta = JSON.parse(readFileSync(metafile, 'utf8')) as Metafile;
  const whole = readdirSync(outdir)
    .filter((f) => f.endsWith('.js'))
    .reduce((sum, f) => sum + statSync(join(outdir, f)).size, 0);
  return { initial: initialBytes(meta, `${stem}.js`), whole };
}

interface BytesRow {
  variant: string;
  metric: string;
  value: number;
  measured: Measured;
  note: string;
  gate?: BenchRecord['gate'];
}

const bytesRecord = ({ variant, metric, value, measured, note, gate }: BytesRow): BenchRecord => ({
  axis: 'weight',
  variant,
  metric,
  unit: 'bytes',
  samples: 1,
  median: value,
  p95: value,
  ...(gate === undefined ? {} : { gate }),
  note,
  detail: { version: measured.version, resolvedFrom: measured.dir },
});

/** How the fixture reaches the entry point, for the note beside the number. */
const symbolNote = (side: { symbol: string }): string => (side.symbol === DEFAULT_EXPORT ? 'its default export' : `\`${side.symbol}\``);

/**
 * Ceilings for the three banded entry points. They are ratchets in the same spirit as
 * `packages/burgee/src/weight.test.ts`: raising one is a decision written in a PR, and
 * `ratchet.test.ts` proves each fails one byte over.
 */
export const BUNDLED_CEILING: Readonly<Record<string, number>> = {
  // The published target is 52 KB (`replacement-parser` #3). Measured 34,841 on
  // 2026-09-09, so the ratchet sits at 40,000: it goes red long before the public
  // claim does, which is the only useful place for a ceiling to sit.
  // 41,000 from 40,000 on 2026-09-15, and the raise is the smaller half of the story.
  //
  // PLAN 3.2 built seniority's cosmiconfig-compatible surface and the package grew 182%.
  // burgee imports it, so the engine's bundle went to **54,986 bytes** — 37% over this
  // ceiling — and the gate caught it, which is what it is for.
  //
  // Most of that came back without touching the ceiling. Two imports were reaching through
  // seniority's root barrel: a static one, and `await import('seniority')` for `discover`,
  // which no bundler can tree-shake. Pointed at `seniority/precedence` and `seniority/config`
  // — subpaths that now exist because the package's own doc comment already promised the
  // filesystem half was "a separate import for exactly that reason" — the engine measures
  // **40,562**, a 26% cut.
  //
  // The 562 bytes left are seniority's config discovery, which esbuild bundles because the
  // dynamic import names a known specifier. The real fix is code splitting, which is a build
  // change and not this PR's; until then the number is honest and the ceiling moves once,
  // deliberately, to sit just above it rather than the measurement sitting above the ceiling.
  //
  // **Down, on 2026-09-21, for the first time.** Two things happened at once: the metric
  // started counting the whole startup graph rather than the entry chunk (D-100, which made
  // every number bigger), and the root barrel stopped holding five optional modules open
  // (D-101, which made this one much smaller). The engine measures **28,637** and the three
  // ceilings follow the measurements down — a ratchet that stays where the number used to be
  // is not a ratchet, it is headroom nobody decided to grant.
  //
  // 28,800 on 2026-09-23 for **59 bytes**, D-118 (E7): the engine reads a `defineError` class's
  // declared code off `Symbol.for('burgee.exitCode')` on every failure path, so the read is on
  // the startup graph even though `define-error.js` is not. Inlined rather than a helper, which
  // took it from 113 over to 59. Measured 28,759.
  //
  // 29,150 on 2026-09-23 for **316 bytes**, D-122: the `parse` and `shutdown` plugin stages.
  // What stays on the startup path is `Manifest.declares`, the `parse` call-in (its loop is
  // `parse-hooks.js`, imported only when a plugin declares one) and the shutdown registration
  // behind `declares('shutdown')`. Measured 29,116.
  //
  // 29,250 on 2026-09-23 for **93 bytes**, D-113 (S4): `-` on a `type: 'file'` positional is
  // stdin. The check itself is `stdin-dash.js`, imported only when a positional is `-`; what
  // stays on the startup path is that test and the spread into the handler's context.
  // Measured 29,209.
  // 29,450 on 2026-09-23 for **303 bytes**, D-117 (V8): `config explain`. The command is
  // `config-explain.js`, imported only on that path; what stays on the startup path is the
  // test that recognises it and the `resolution` step a run and the command share.
  // Measured 29,419.
  // 29,550 with V8 on top of S4, after merging main. Measured 29,512.
  // 29,200 on 2026-09-23 for **68 bytes**, D-123 (F1): `--schema` carries the exit-code table,
  // so the schema surface reaches `exit-code.js`. Measured 29,184.
  // 29,650 with F1 on top of S4 and V8, after merging main. Measured 29,580.
  // 29,750 on 2026-09-23: D-140 and #521 on top of main (72a810352e). Measured 29,702.
  // 29,300 on 2026-09-23 for **135 bytes**, D-119 (D3): dynamic completion. The callback is
  // `complete-dynamic.js`, imported only when argv starts with `__complete`; what stays on the
  // startup path is that one test. Measured 29,251.
  // 29,800 with D3 on top of S4, V8 and F1, after merging main. Measured 29,719 here and 29,751
  // on CI's ubuntu and macOS runners, which read 32 bytes more; the ceiling covers both.
  // 29,950 with D3 on top of S4, V8, F1 and D-140, after merging main. Measured 29,841.
  // 30,200 on 2026-09-23: P2/P3 on top of D3 (#478) and D-140. Measured 30,107.
  // 30,260 on 2026-09-24 for N15: `--format=agent` rides the lazy `fields.js` load `--json=` already had, so the startup path gains one alternative in the test that loads it (`readsLazily`) and a `lines?.()` in `emit` — 71 B; the formatter is its own chunk. Measured 30,178.
  burgee: 30_260,
  // 29,650 on 2026-09-23: D-140 and #521 on top of V8 (#481). Measured 29,634.
  // 29,200 on 2026-09-23 for **56 bytes**, the MCP stdout capture (#521): measured 29,172 on
  // top of D-122's 29,116. The capture lives in the lazily loaded MCP chunk; what reaches the
  // startup graph is the `host` seam it shares with the entry.
  // 29,250 on 2026-09-23 for **66 bytes**, D-140: the `--json` failure path classifies a
  // thrown error once for every front end. Measured 29,238 on top of #521's 29,172.
  // 29,350 on 2026-09-23: D-140's 66 bytes and #521 on top of S4's 93 (29,238 + 93). Measured 29,331.
  // 59,250 on 2026-09-22 for **61 bytes**: the `.catch` that fires `onError`. A plugin's
  // lifecycle closes on every front end now — `preRun` opens and exactly one of `postRun` or
  // `onError` closes — where before a handler that threw left a plugin with no closing hook.
  //
  // 59,450 on 2026-09-22 for **171 bytes**, D-109: D1's refusal of a deprecation that names no
  // replacement. The front end never declares one, but a plugin registered through it passes the
  // same definition door as a first-party command, and that door is what carries the check.
  //
  // 59,600 on 2026-09-23 for **171 bytes**, D-134: the manifest projection publishes each
  // option under the flag commander accepts (a lone `--no-x` as `noX`, a pair folded, which
  // booleans negate), so `--mcp` and completions stop offering flags commander refuses.
  // 59,850 on 2026-09-23 for **208 bytes**, D-122 — the same stages through the engine the
  // façade runs on. Measured 59,808.
  //
  // The MCP stdout capture (#521) adds **15 bytes** here (59,808 -> 59,823 with D-122), none new code on the
  // startup path: the lazily-loaded MCP chunk now reads stdout through the `host` seam to keep
  // a tool call's prints off the JSON-RPC stream, so `host` is shared between the entry and
  // that chunk, esbuild moves it into the shared chunk the entry already imports, and the 14
  // are the cross-chunk export and import names.
  //
  // 60,500 on 2026-09-23 for **897 bytes**, D-140 (59,586 -> 60,483): a commander program run
  // the commander way — `parseAsync(process.argv)`, nothing injected — let an action that threw
  // under `--json` escape as a stack trace instead of the envelope and an E1 exit code, and
  // filed an `AuthError` as exit 1 where E6 says 5. The bytes are the unseamed `--json` catch,
  // `AuthError`/`UsageError` (which the façade never reached before) and the one
  // classification both façades share. None of it is on a path a passing command takes.
  // Merged 2026-09-23: D-140's 897 bytes on top of D-122 and #521 measure 60,713.
  // 60,850 on 2026-09-23: P2/P3 on top of D3 (#478) and D-140, with 80 B for CI reading ~32 B over local. Measured 60,738.
  'burgee/commander': 60_850,
  'burgee/yargs': 107_700,
  // The foundation layers, first measured 2026-09-16 when they got B4 pairs at all. Each
  // ceiling is the measurement rounded up to the next fifty — a ratchet on what a user's
  // bundle grows by, set where the number actually is, so the next byte is a decision.
  //
  // **Four of these move up by between 22 and 74 bytes, and D-096 is why.** #389 made
  // linegauge's five Unicode property classes lazy; #400 recovered thirty of the bytes that
  // cost, and the remaining ~111 an entry are **not recoverable by engineering** — writing
  // the two joined source strings out literally to drop the array and its `.join()` calls
  // measures **+73 bytes**, not fewer. What they buy is `width.js` importing in 5.95 ms
  // rather than 15.30. `paratext`'s 22 are an older breach that measures the same at every
  // commit around it. D-096 defaulted to "the trade stands and the ceilings move" and left it
  // to the integrator; D-099 established that this loop owns a band breach the machinery was
  // built to route, so the ceilings move here, at the measurement, with the trade named.
  //
  // **+68 on each of the three, 2026-09-22, and it is the seam linegauge's plugin host needs.**
  // The first cut put the whole override table in `width.ts` and cost **+182** on every entry —
  // the note beside it claimed a program without a plugin paid one empty-list check per cluster,
  // which was true of runtime and false of bytes, and B4 said so on the first CI run. The table
  // moved into `plugin.ts`; `width.ts` keeps one nullable slot and one optional call, which is
  // the 68. That is the floor for an override that has to be consulted inside `measure`.
  linegauge: 6_400,
  'linegauge/wrap': 11_350,
  'linegauge/slice': 9_000,
  'linegauge/strip': 1_000,
  //
  // **Down from 11,150 to 6,800, and the reason is the most useful thing this block records.**
  // paratext imported the whole family plugin schema to validate against one definition in it,
  // `$defs.capability` — 2,121 of 8,141 minified bytes. So every host's definitions rode in
  // every paratext user's bundle, and making linegauge the ninth host added 1,343 more
  // (12,465 measured). It imports a generated fragment of exactly that definition now
  // (`scripts/schema-sync.mjs`, locked by `plugin-schema-lock.test.ts`) and ships the full
  // contract as data it does not import. **6,736 measured** — below the 11,122 it read before
  // tonight, not just below the regression. D-108.
  //
  // 8,450 on 2026-09-23 for **1,630 bytes**, D-138: paratext took `ansi-escapes`' CSI half, so
  // the entry now carries what the incumbent carries. The ceiling below it was set against an
  // entry with none of it. Measured 8,430.
  paratext: 8_450,
};

/**
 * One budget, by id, from the release-budget file. Throws rather than defaulting: a missing
 * budget must fail loudly here, because the alternative is a gate quietly running at
 * `Infinity` and passing everything.
 */
function releaseBudget(id: string): number {
  const file = join(REPO_ROOT, '.sdlc/bands/release-budgets.json');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { budgets: Record<string, { value: number }> };
  const budget = doc.budgets[id];
  if (budget === undefined) throw new Error(`no release budget "${id}" in .sdlc/bands/release-budgets.json — a gate with no ceiling is not a gate`);
  return budget.value;
}

/**
 * The like-for-like ratio ceiling per pair, from the first measured run.
 *
 * Five of the seven are below 1.0 — the entry point is genuinely lighter in a user's
 * bundle than the package it replaces, so the gate is 1.0 and it fails the day that stops
 * being true. Two are not, and are gated as ratchets against their measured value with the
 * fact stated rather than smoothed: `burgee/commander` bundles 1.50x commander, and core
 * bundles 3.33x cac. Neither breaks a published claim — those are written against the
 * incumbent's *installed* size (commander 232 KB, yargs 376 KB) and against 52 KB
 * absolute, and both are met — but "lighter than what it replaces" is not true of these
 * two on a bundled basis, and a suite that only published the five would be lying by
 * selection.
 */
export const RATIO_CEILING: Readonly<Record<string, number>> = {
  // 3.5 was set when core measured 3.33x cac, leaving 0.17 of headroom. By 2026-09-09 the
  // measurement was **3.492** before anything in that PR was written: 0.16 of the 0.17 had
  // been spent, unremarked, by whatever grew core between the two runs. The `--version` fix
  // then cost 0.010 and the gate fired — correctly, and on the wrong commit. Raised to the
  // measurement plus a hair rather than to a comfortable round number, so the next byte of
  // core is a decision again rather than the twentieth quiet withdrawal from a balance
  // nobody was reading. **The drift from 3.33 to 3.49 is the finding here**, and it is not
  // this ceiling's to explain.
  //
  // 3.51 → 3.54 the same day, for boolean negation (3.502 → 3.531), then → 3.55 for the
  // negation completions (3.531 → 3.549).
  //
  // **Three raises in one session means this stopped being a ratchet.** A ceiling moved per
  // PR is a record of what happened, not a limit on it, and core now bundles 3.55x cac
  // against the 3.33x it was written for. The three changes were each correct and each
  // priced; the sum was nobody's decision, which is precisely the failure a ratchet exists
  // to prevent. It wants a budget somebody sets for a release rather than a number that
  // follows the last commit.
  //
  // The last of the three also shows the two weight rules disagreeing again: `execute.ts`
  // reaches completions through `await import('./completions.js')`, so burgee's own weight
  // lock — which walks *static* imports on disk — does not count it and stayed green, while
  // esbuild inlines it into a single-file bundle and this ratio moved. A dynamic import
  // defers the load; it does not shrink the bundle.
  //
  // 3.55 → 3.56 on 2026-09-09 for `agent-headroom` R1 (3.549 → 3.559). **This is the fourth
  // raise in one session, which is the failure the paragraph above already named**, and it
  // is recorded here rather than quietly taken: the leanest possible R1 — no shared helper,
  // the ternary inlined at each call site, the string literal duplicated — was measured at
  // 3.557 and still did not fit, so the choice was between this raise and not shipping a
  // 42% cut to the document an agent reads first. It is not a close call, and it is also
  // not a ratchet working.
  //
  // What this number needs is a budget set once for a release, against which a PR either
  // fits or is refused, instead of a ceiling that follows the last commit. That is an
  // owner's decision and it is not this PR's to make; what this PR owes is to say so at the
  // point where the drift is visible rather than to leave the fifth raise to find it.
  // Read from `.sdlc/bands/release-budgets.json` rather than written here, which is the
  // whole point: this entry is what four raises in one session turned into a number that
  // followed the last commit. It is now 3.7, derived from `core-bundled-bytes` at mean + 3
  // sigma over 41 observations, and `scripts/release-budget-lock.test.ts` refuses to let it
  // move unless the release moves with it in the same commit.
  burgee: releaseBudget('bundled-bytes-ratio:burgee\u00F7cac'),
  // 1.52 from 1.6 on 2026-09-21: measured 1.514 under the corrected metric (D-100). The
  // front-end's residual over commander is `commander/command.js` at 33,487 bundled against
  // commander's 27,226, plus `bellpull/cross-spawn` at 5,060 — and the spawn cannot go lazy
  // without giving up `parse()`'s synchronous contract and the ~23 `executableSubcommand`
  // cases in commander's own suite that mock it, which is what the 1360 / 1360 row rests on.
  // D-102 records that, and that ≤ 1 is not reachable while the façade also carries a
  // manifest, a schema and an MCP server. 1.53 on 2026-09-23 for the same 171 bytes as the
  // bundled ceiling above (D-134): measured 1.524. 1.54 on 2026-09-23 for F1 (D-123), the
  // exit-code table the façade's `--schema` now carries: measured 1.531.
  // 1.555 on 2026-09-23: D-140 and #521 on top of main (72a810352e). Measured 1.554.
  // 1.56 on 2026-09-23: P2/P3 on top of D3 (#478) and D-140. Measured 1.554 locally, ~1.555 in CI.
  'burgee/commander': 1.56,
  // bundled ceiling above (D-134): measured 1.524.
  // 1.535 on 2026-09-23: D-122 left the façade at 59,808 (1.530, on the ceiling) and the MCP
  // stdout capture (#521) adds 15 bytes of cross-chunk names — 59,823, measured 1.531.
  // bundled ceiling above (D-134): measured 1.524. 1.55 on 2026-09-23 for the 897 bytes of
  // D-140 beside it: measured 1.548.
  // Merged 2026-09-23 with D-122 and #521: measured 1.553.
  'burgee/yargs': 1,
  'roundel/chalk': 1,
  'flagstaff/ora': 1,
  'flagstaff/boxen': 1,
  'flagstaff/log-update': 1,
  // ── the foundation layers ─────────────────────────────────────────────────────────────
  //
  // Four of these five are above 1 and stay above it, and that is not a gate being loosened
  // — it is the first time the number has existed. `linegauge`'s R9 and `paratext`'s R11
  // both read `Not built` for the same reason, in the same words: this file had no pair for
  // them, and `benchmarks/**` is not a package lane's to write.
  //
  // **The bar these rows do not carry is the requirement.** A bundled ratio compares our
  // entry against ONE tree-shaken incumbent package; `string-width` does not ship alone — it
  // drags `strip-ansi`, `ansi-regex` and `get-east-asian-width`, and what a user removes by
  // switching is the tree. `.sdlc/PLAN.md` D1 decided that for the whole foundation tier,
  // and `.sdlc/bands/foundation-ceilings.json` is where it is measured: against it
  // `linegauge` reads 0.4904 and five of six layers hold. So these are ratchets at the
  // measured value, exactly as `burgee/commander`'s 1.6 is, and not claims that we are
  // lighter.
  //
  // `linegauge/wrap` is the one set at 1, because 0.774 earns it.
  // 1.04 and 2.56 on 2026-09-21, with the four byte ceilings above and for the same reason
  // (D-096): 111 bytes an entry that measurement says are not recoverable, against 9 ms of
  // import time.
  // 1.05 and 1.51 with the +68 seam above.
  linegauge: 1.05,
  'linegauge/wrap': 1,
  'linegauge/slice': 1.51,
  'linegauge/strip': 2.25,
  // The layer that is over its D1 ceiling too — 66,305 against ansi-escapes' tree at 30,912,
  // a ratio of 2.145. That breach is real, it is recorded in the ceilings file, and this
  // ratchet exists so the bundled half cannot grow while it is being dealt with.
  // 1.55 from 2.56 — see the byte ceiling above for why this is the largest single fall a
  // foundation row has had.
  // 1.94 on 2026-09-23, D-138: until today this ratio set paratext *without* CSI against
  // `ansi-escapes` *with* it. Both sides now carry the same thirty-one members, so 1.937 is the
  // first like-for-like figure — what is left over is the capability registry that makes the
  // OSC half degrade on a pipe. Measured 1.937.
  paratext: 1.94,
};

/**
 * Pure, given two measurements: this is where a gate is attached to a number, so
 * `ratchet.test.ts` drives it directly with synthetic bytes and proves each gate fires
 * one byte over. A gate that only exists on a machine with esbuild installed is a gate
 * nobody has seen go red.
 */
export function pairRecords(pair: EntryPair, ours: Measured, theirs: Measured): BenchRecord[] {
  const ceiling = BUNDLED_CEILING[pair.id];
  const ratioMax = RATIO_CEILING[pair.id] ?? 1;
  const ratio = round(ours.bundled / theirs.bundled, RATIO_PLACES);
  return [
    bytesRecord({
      variant: pair.id,
      metric: 'bundled-bytes',
      value: ours.bundled,
      measured: ours,
      note: `esbuild --bundle --minify --format=esm --platform=node over a fixture importing ${symbolNote(pair.ours)} from \`${pair.ours.specifier}\``,
      ...(ceiling === undefined ? {} : { gate: { max: ceiling, why: "a ratchet on what a user's bundle grows by; raising it is a decision, not a drift" } }),
    }),
    bytesRecord({
      variant: pair.incumbent.specifier,
      metric: 'bundled-bytes',
      value: theirs.bundled,
      measured: theirs,
      note: `the same fixture over \`${pair.incumbent.specifier}\` — ${pair.why}`,
    }),
    bytesRecord({
      variant: pair.id,
      metric: 'installed-bytes',
      value: ours.installed,
      measured: ours,
      note: `\`npm pack\` unpacked size of ${packageOf(pair.ours.specifier)} plus its same-repo dependencies. One package serves every entry point it publishes, so this number is not per-entry-point and is reported, never gated — bundled bytes is the per-entry-point question`,
    }),
    bytesRecord({
      variant: pair.incumbent.specifier,
      metric: 'installed-bytes',
      value: theirs.installed,
      measured: theirs,
      note: 'bytes on disk for it and every production dependency it drags in',
    }),
    {
      axis: 'weight',
      variant: `${pair.id} ÷ ${pair.incumbent.specifier}`,
      metric: 'bundled-bytes-ratio',
      unit: 'ratio',
      samples: 1,
      median: ratio,
      p95: ratio,
      gate: {
        max: ratioMax,
        why:
          ratioMax <= 1
            ? "U5, stated as a check: this entry point is no heavier in a user's bundle than the package it replaces"
            : 'a ratchet at the measured value, not the claim: this entry point is currently heavier than what it replaces on a bundled basis, and the gate exists to stop that growing',
      },
      note: `${pair.why}; both sides bundled by the same command, both resolved from benchmarks/`,
      detail: { ours: `${pair.ours.specifier}@${ours.version}`, incumbent: `${pair.incumbent.specifier}@${theirs.version}` },
    },
  ];
}

/**
 * The premium, as two rows: what the incumbent stack costs, and our ratio against it.
 *
 * Reported, never gated. A gate here would be a gate on somebody else's dependency tree —
 * `cosmiconfig` shipping a smaller YAML parser would turn our build red for nothing — and the
 * number's job is to say what a reader is actually choosing between, not to ratchet.
 */
function parityRecords(pair: EntryPair, stack: ParityStack, { ours, theirs }: { ours: Measured; theirs: Measured }, scratch: string = SCRATCH): BenchRecord[] {
  const { initial } = stackBytes(stack, pair.incumbent, pair.id, scratch);
  const ratio = round(ours.bundled / initial, RATIO_PLACES);
  const added = stack.adds.map((a) => a.specifier).join(' + ');
  const common = { axis: 'weight' as const, samples: 1 };
  return [
    {
      ...common,
      variant: `${pair.incumbent.specifier} + ${added}`,
      metric: 'bundled-bytes',
      unit: 'bytes',
      median: initial,
      p95: initial,
      note: `the capability-parity stack for \`${pair.id}\`: ${pair.incumbent.specifier} plus ${String(stack.adds.length)} package(s) a user of it installs to reach the same capability set — ${stack.adds.map((a) => `\`${a.specifier}\` for ${a.capability}`).join('; ')}. Each addition is a package this repository publishes a graded drop-in for (${stack.adds.map((a) => `\`${a.gradedBy}\``).join(', ')}), which is the rule that decides what may be in this stack`,
    },
    {
      ...common,
      variant: `${pair.id} ÷ (${pair.incumbent.specifier} + ${added})`,
      metric: 'bundled-bytes-ratio-parity',
      unit: 'ratio',
      median: ratio,
      p95: ratio,
      note: `${theirs.bundled} bytes for \`${pair.incumbent.specifier}\` alone, ${initial} for the stack. Reported, never gated — a ceiling here would be a ceiling on somebody else's dependency tree. ${String(stack.unmatched.length)} of our capabilities have no incumbent to add and cost this stack nothing: ${stack.unmatched.join('; ')}`,
      detail: { bare: theirs.bundled, stack: initial, unmatched: stack.unmatched.length },
    },
  ];
}

/**
 * One record per variant and metric. Two pairs against one incumbent each emit that incumbent's
 * rows; a results document holding them twice would let a reader — or `findRecord` — pick either.
 */
export function uniqueRecords(records: readonly BenchRecord[]): BenchRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.variant}\u0000${r.metric}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function run(): BenchRecord[] {
  rmSync(SCRATCH, { recursive: true, force: true });
  try {
    // An incumbent may stand against two of our entry points — flagstaff's `ora` façade and its
    // native `spinner` both answer to ora — and is measured once, not once per pair.
    const incumbents = new Map<string, Measured>();
    return uniqueRecords(
      PAIRS.flatMap((pair) => {
        const ours = measure(pair.ours, `ours-${pair.id}`);
        const theirs = incumbents.get(pair.incumbent.specifier) ?? measure(pair.incumbent, `theirs-${pair.id}`);
        incumbents.set(pair.incumbent.specifier, theirs);
        const stack = PARITY.find((p) => p.id === pair.id);
        return [...pairRecords(pair, ours, theirs), ...(stack === undefined ? [] : parityRecords(pair, stack, { ours, theirs }))];
      }),
    );
  } finally {
    rmSync(SCRATCH, { recursive: true, force: true });
  }
}

/**
 * The bundled half of `run()` for the pairs named: every `bundled-bytes`, ratio and parity
 * record, built by the same `pairRecords`/`parityRecords` and so named, rounded and gated
 * exactly as the full run names them — without `npm pack` or the installed walk.
 *
 * It exists for the root README's gate rows (`scripts/readme-gates.ts`). Those rows are the
 * figures the project quotes most, and they were a hand-copied snapshot of a run: D-134 moved
 * `burgee/commander` by 171 bytes, raised the ceiling above in the same PR, and left the
 * README saying 1.514 where the build measured 1.524 — which a published article then quoted.
 * Bundling is a second or two; this is cheap enough to run on every push.
 *
 * A private scratch directory under `benchmarks/` rather than `SCRATCH`: the fixtures have to
 * resolve from here, and `run()` deletes `SCRATCH` wholesale.
 */
export function bundledRecords(ids: readonly string[]): BenchRecord[] {
  const scratch = mkdtempSync(join(BENCH_ROOT, '.fixtures-'));
  try {
    return uniqueRecords(
      ids.flatMap((id) => {
        const pair = PAIRS.find((p) => p.id === id);
        if (pair === undefined) throw new Error(`no B4 pair "${id}" in fixtures/entry-points.ts`);
        const ours = measure(pair.ours, `ours-${pair.id}`, scratch, false);
        const theirs = measure(pair.incumbent, `theirs-${pair.id}`, scratch, false);
        const stack = PARITY.find((p) => p.id === pair.id);
        return [...pairRecords(pair, ours, theirs), ...(stack === undefined ? [] : parityRecords(pair, stack, { ours, theirs }, scratch))].filter(
          (r) => r.metric !== 'installed-bytes',
        );
      }),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export const method =
  'Each entry point is bundled with `esbuild --bundle --minify --format=esm --platform=node` over a fixture that imports it and re-exports one symbol; the incumbent is bundled by the same command over the same fixture shape. Installed bytes are the package directory plus every production dependency, transitively — each dependency resolved from the directory of the package that depends on it, and deduplicated by resolved path, so a nested copy is counted where npm actually put it. Every top-level package is resolved from `benchmarks/`, whose package.json pins the versions — the workspace root has an older commander hoisted, and resolving from there would compare against the wrong package.';
