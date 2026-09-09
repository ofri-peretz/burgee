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
import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DEFAULT_EXPORT, fixtureSource, PAIRS, type EntryPair } from '../fixtures/entry-points.js';
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
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return (JSON.parse(out) as { unpackedSize: number }[])[0]?.unpackedSize ?? 0;
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
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  let total = ownInstalledBytes(dir);
  for (const dep of Object.keys(manifest.dependencies ?? {})) total += installedBytes(dep, dir, seen);
  return total;
}

/** The package a specifier belongs to: `burgee/commander` is published by `burgee`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
}

/** esbuild's own binary, wherever npm hoisted it — never a `.bin` shim that may not exist. */
function esbuildBin(): string {
  return join(resolvePackage('esbuild').dir, 'bin', 'esbuild');
}

function bundle(side: { specifier: string; symbol: string }, id: string): number {
  mkdirSync(SCRATCH, { recursive: true });
  const file = join(SCRATCH, `${id.replaceAll('/', '__')}.mjs`);
  writeFileSync(file, fixtureSource(side));
  const out = `${file}.bundle.mjs`;
  // esbuild from the CLI, not the API: one fewer import in a suite that measures imports,
  // and the exact command is quotable in the results file.
  execFileSync(esbuildBin(), [file, '--bundle', '--minify', '--format=esm', '--platform=node', `--outfile=${out}`], {
    cwd: BENCH_ROOT,
    stdio: 'pipe',
  });
  const bytes = statSync(out).size;
  return bytes;
}

export interface Measured {
  bundled: number;
  installed: number;
  version: string;
  dir: string;
}

function measure(side: { specifier: string; symbol: string }, id: string): Measured {
  const pkg = packageOf(side.specifier);
  const { dir, version } = resolvePackage(pkg);
  return { bundled: bundle(side, id), installed: installedBytes(pkg), version, dir: relativeToRepo(dir) };
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
  burgee: 40_000,
  'burgee/commander': 64_000,
  'burgee/yargs': 112_000,
};

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
  burgee: 3.5,
  'burgee/commander': 1.6,
  'burgee/yargs': 1,
  'roundel/chalk': 1,
  'flagstaff/ora': 1,
  'flagstaff/boxen': 1,
  'flagstaff/log-update': 1,
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

export function run(): BenchRecord[] {
  rmSync(SCRATCH, { recursive: true, force: true });
  try {
    return PAIRS.flatMap((pair) => pairRecords(pair, measure(pair.ours, `ours-${pair.id}`), measure(pair.incumbent, `theirs-${pair.id}`)));
  } finally {
    rmSync(SCRATCH, { recursive: true, force: true });
  }
}

export const method =
  'Each entry point is bundled with `esbuild --bundle --minify --format=esm --platform=node` over a fixture that imports it and re-exports one symbol; the incumbent is bundled by the same command over the same fixture shape. Installed bytes are the package directory plus every production dependency, transitively — each dependency resolved from the directory of the package that depends on it, and deduplicated by resolved path, so a nested copy is counted where npm actually put it. Every top-level package is resolved from `benchmarks/`, whose package.json pins the versions — the workspace root has an older commander hoisted, and resolving from there would compare against the wrong package.';
