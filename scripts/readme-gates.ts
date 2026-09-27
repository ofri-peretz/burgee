/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The bundle figures the project quotes in public — the README's gate rows and every page that
 * repeats them — written from a fresh bundle of the current build.
 *
 * They were typed in by hand from a run, and they rotted the way hand-copied numbers do: D-134
 * moved `burgee/commander` by 171 bytes, raised its ceiling in `benchmarks/axes/weight.ts` with
 * the new measurement in the comment beside it, and left the README saying **1.514×** where the
 * build measured **1.524×**. A published article quoted the README and had to be corrected. The
 * ceiling moved in the PR that moved the bytes; the figure a reader sees did not, because
 * nothing tied the two together.
 *
 * So the figures are measured here — `bundledRecords`, the bundled half of B4, same fixtures,
 * same esbuild command, same rounding — and `readme-gates-lock.test.ts` runs the same thing on
 * every push. A change that moves a bundled byte of `burgee`, `burgee/commander` or
 * `burgee/yargs` now regenerates these figures in the same PR, or the push is refused.
 *
 * Two kinds of place, both declared rather than searched for:
 *
 *   - **Gate rows** — `| <claim> | \`<gate id>\` | <measured> | <verdict> |` in README.md, found
 *     by gate id exactly as `claim-table-lock.test.ts` finds them. The measured cell *and* the
 *     verdict are written, so a figure that crosses its bar cannot keep its old tick.
 *   - **Quotes** — a sentence elsewhere that repeats a figure. Each is a pattern whose capture
 *     groups are the figures, and each must match exactly once: reword the sentence and this
 *     fails naming it, rather than silently no longer keeping it honest.
 *
 *   npm run readme:gates             # measure and write
 *   npm run readme:gates -- --check  # measure, exit 1 on drift
 *
 * Needs a build: the fixtures import what `dist/` holds, never what `src/` says
 * (`npx turbo run build`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundledRecords } from 'benchmarks/axes/weight.js';
import { CLAIMS } from 'benchmarks/claims.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const COMMAND = 'npm run readme:gates';

/** The three framework entries — the only pairs whose figures the README quotes. */
const PAIRS = ['burgee', 'burgee/commander', 'burgee/yargs'] as const;
const RATIO_PLACES = 3;

type BenchRecord = ReturnType<typeof bundledRecords>[number];
/** One measured figure: `<variant>|<metric>`, exactly as the results document keys a record. */
export type Figures = ReadonlyMap<string, BenchRecord>;

const key = (variant: string, metric: string): string => `${variant}|${metric}`;

export function measure(): Figures {
  return new Map(bundledRecords(PAIRS).map((r) => [key(r.variant, r.metric), r]));
}

function figure(figures: Figures, variant: string, metric: string): BenchRecord {
  const found = figures.get(key(variant, metric));
  if (found === undefined) throw new Error(`the bundle measurement has no "${variant}" ${metric} record — did a variant name in weight.ts change?`);
  return found;
}

/** `28,275` for bytes, `1.525` for a ratio: how every quoted figure is written. */
const plain = (r: BenchRecord): string => (r.unit === 'bytes' ? r.median.toLocaleString('en-US') : r.median.toFixed(RATIO_PLACES));

// ── gate rows ───────────────────────────────────────────────────────────────────────────

/** The same four-column row `claim-table-lock.test.ts` reads. */
const ROW = /^\| ([^|]+) \| `([a-z0-9-]+)` \| ([^|]+) \| ([^|]*) \|$/gm;
const MET = '✅ met';
const NOT_MET = '❌ **not met**';

/** Every declared claim this measurement settles — the weight claims on the three framework pairs. */
function gateClaims(figures: Figures): typeof CLAIMS {
  return CLAIMS.filter((c) => c.from.axis === 'weight' && figures.has(key(c.from.variant, c.from.metric)));
}

function gateRows(text: string, figures: Figures): string {
  const claims = gateClaims(figures);
  return text.replace(ROW, (row, claim: string, id: string) => {
    const spec = claims.find((c) => c.id === id);
    if (spec === undefined) return row;
    const r = figure(figures, spec.from.variant, spec.from.metric);
    const { max, min } = spec.test;
    const met = (max === undefined || r.median <= max) && (min === undefined || r.median >= min);
    const cell = r.unit === 'bytes' ? `${plain(r)} bytes` : `${plain(r)}×`;
    return `| ${claim} | \`${id}\` | ${cell} | ${met ? MET : NOT_MET} |`;
  });
}

// ── quotes ──────────────────────────────────────────────────────────────────────────────

interface Quote {
  file: string;
  /** Capture groups are the figures, in the order `figures` names them. Must match once; flags `dg`. */
  pattern: RegExp;
  figures: readonly (readonly [variant: string, metric: string])[];
}

const STACK = 'cosmiconfig + exit-hook + restore-cursor';
const bytes = (variant: string): readonly [string, string] => [variant, 'bundled-bytes'];
const ratio = (ours: string, incumbent: string): readonly [string, string] => [`${ours} ÷ ${incumbent}`, 'bundled-bytes-ratio'];
const parity = (ours: string, incumbent: string): readonly [string, string] => [`${ours} ÷ (${incumbent} + ${STACK})`, 'bundled-bytes-ratio-parity'];
const stack = (incumbent: string): readonly [string, string] => [`${incumbent} + ${STACK}`, 'bundled-bytes'];

/**
 * Literals, one per quote: every capture group is `([\d,.]+)`, a figure and nothing else. The
 * `g` is for counting matches — a quote must match exactly once — and `d` gives the offsets.
 */
const q = (file: string, pattern: RegExp, ...figures: (readonly [string, string])[]): Quote => ({ file, pattern, figures });

export const QUOTES: readonly Quote[] = [
  q('README.md', /`burgee` is ([\d,.]+) bundled bytes and `cac` is ([\d,.]+), so the bare row reads \*\*([\d,.]+)× and/dg, bytes('burgee'), bytes('cac'), ratio('burgee', 'cac')),
  q('README.md', /^\| `cac` \| ([\d,.]+) B \| \*\*([\d,.]+) B\*\* \| ([\d,.]+) B \|$/dgm, bytes('cac'), stack('cac'), bytes('burgee')),
  q('README.md', /^\| `commander` \| ([\d,.]+) B \| \*\*([\d,.]+) B\*\* \| ([\d,.]+) B \|$/dgm, bytes('commander'), stack('commander'), bytes('burgee/commander')),
  q('README.md', /^\| `yargs` \| ([\d,.]+) B \| \*\*([\d,.]+) B\*\* \| ([\d,.]+) B \|$/dgm, bytes('yargs'), stack('yargs'), bytes('burgee/yargs')),
  q('README.md', /`cac` is ([\d,.]+) bytes of\s+parser and help renderer; burgee's ([\d,.]+) is that plus/dg, bytes('cac'), bytes('burgee')),
  q('apps/docs/content/docs/vs/commander.mdx', /alone — is \*\*not met\*\* \(([\d,.]+)×\)/dg, ratio('burgee/commander', 'commander')),
  q('apps/docs/content/docs/vs/commander.mdx', /cursor handling, it is met \(([\d,.]+)×\)/dg, parity('burgee/commander', 'commander')),
  q('apps/docs/content/docs/vs/yargs.mdx', /lighter in a bundle than yargs — is met\s+\(([\d,.]+)×\)/dg, ratio('burgee/yargs', 'yargs')),
  q('apps/docs/content/docs/vs/cac.mdx', /cac alone —\s+is \*\*not met\*\* \(([\d,.]+)×\): burgee's core bundles to ([\d,.]+) bytes and cac to ([\d,.]+)\./dg, ratio('burgee', 'cac'), bytes('burgee'), bytes('cac')),
  q('apps/docs/content/docs/vs/cac.mdx', /`lighter-than-cac-at-parity` gate is met \(([\d,.]+)×\): ([\d,.]+) bytes against ([\d,.]+)\./dg, parity('burgee', 'cac'), bytes('burgee'), stack('cac')),
  q('.sdlc/roadmap/launch-kit.md', /`burgee\/commander` is\s+([\d,.]+)× the bundle; against commander alone it is ([\d,.]+)×/dg, parity('burgee/commander', 'commander'), ratio('burgee/commander', 'commander')),
];

function quote(text: string, at: Quote, figures: Figures): string {
  const all = [...text.matchAll(at.pattern)];
  if (all.length !== 1) {
    throw new Error(
      `${at.file}: expected the quote /${at.pattern.source}/ exactly once, found ${String(all.length)}. If the sentence was reworded, update QUOTES in scripts/readme-gates.ts to match it — a figure nothing regenerates is the drift this script exists to stop.`,
    );
  }
  const match = all[0] as RegExpExecArray;
  const spans = match.indices ?? [];
  let out = text;
  // Right to left, so an earlier splice does not move a later group's offsets.
  for (let g = at.figures.length; g >= 1; g--) {
    const span = spans[g];
    const [variant, metric] = at.figures[g - 1] as readonly [string, string];
    if (span === undefined) throw new Error(`${at.file}: quote group ${String(g)} did not capture`);
    out = out.slice(0, span[0]) + plain(figure(figures, variant, metric)) + out.slice(span[1]);
  }
  return out;
}

// ── files ───────────────────────────────────────────────────────────────────────────────

/** Every file this script owns figures in: the README for its gate rows, plus every quote's. */
export const FILES: readonly string[] = [...new Set(['README.md', ...QUOTES.map((x) => x.file)])];

export function rewrite(file: string, text: string, figures: Figures): string {
  let out = file === 'README.md' ? gateRows(text, figures) : text;
  for (const at of QUOTES.filter((x) => x.file === file)) out = quote(out, at, figures);
  return out;
}

/** The gate ids README.md publishes that this measurement settles — so a lock can see it found them. */
export function gateIds(text: string, figures: Figures): string[] {
  const ids = new Set(gateClaims(figures).map((c) => c.id));
  return [...text.matchAll(ROW)].map((m) => m[2] ?? '').filter((id) => ids.has(id));
}

/** Fails early and plainly when there is nothing built to bundle. */
export function assertBuilt(): void {
  for (const pkg of ['burgee']) {
    if (!existsSync(join(ROOT, 'packages', pkg, 'dist'))) throw new Error(`packages/${pkg}/dist does not exist — these figures are bundled from the build. Run \`npx turbo run build\` first.`);
  }
}

if (process.argv[1]?.endsWith('readme-gates.ts') === true) {
  const check = process.argv.slice(2).includes('--check');
  assertBuilt();
  const figures = measure();
  const drifted: string[] = [];
  for (const file of FILES) {
    const at = join(ROOT, file);
    const before = readFileSync(at, 'utf8');
    const after = rewrite(file, before, figures);
    if (before === after) continue;
    drifted.push(file);
    if (!check) writeFileSync(at, after);
  }
  if (check && drifted.length > 0) {
    process.stderr.write(`✖ these files quote bundle figures the current build does not measure:\n${drifted.map((d) => `  ${d}`).join('\n')}\nRun \`${COMMAND}\` and commit the result.\n`);
    process.exitCode = 1;
  } else if (check) process.stdout.write('✓ every quoted bundle figure is the measured one\n');
  else process.stdout.write(drifted.length === 0 ? 'nothing to write — every figure is current\n' : `wrote ${drifted.join(', ')}\n`);
}
