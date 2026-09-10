/**
 * The foundation tier's competitive baseline, measured rather than argued.
 *
 * `cli-foundation-stack` promises four packages that beat their incumbents. That promise
 * needs today's numbers next to it, or "beats" is a slogan (PRINCIPLES rule 4). This emits
 * the two metrics every one of the four competes on — **how many packages a caller installs**
 * and **how many bytes land on their disk** — plus the correctness rows for the width layer,
 * where the claim is not weight but rightness.
 *
 * Run: `npx tsx scripts/foundation-baseline.ts` (writes markdown to stdout).
 * The numbers come from this repo's own installed tree, so they are the trees a real
 * install produces, not the manifests' optimistic reading of themselves.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NM = join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'node_modules');

interface Manifest {
  version?: string;
  dependencies?: Record<string, string>;
}

const manifest = (name: string): Manifest | undefined => {
  try {
    return JSON.parse(readFileSync(join(NM, name, 'package.json'), 'utf8')) as Manifest;
  } catch {
    return undefined;
  }
};

/** Every package a caller ends up with, this one included. */
function closure(name: string, seen = new Set<string>()): Set<string> {
  if (seen.has(name)) return seen;
  const m = manifest(name);
  if (m === undefined) return seen;
  seen.add(name);
  for (const dep of Object.keys(m.dependencies ?? {})) closure(dep, seen);
  return seen;
}

/** Bytes on disk for one package, excluding its nested `node_modules`. */
function bytes(name: string): number {
  let total = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else total += statSync(path).size;
    }
  };
  try {
    walk(join(NM, name));
  } catch {
    return 0;
  }
  return total;
}

/**
 * The incumbents each foundation package replaces, from its own intent's "Replaces" table.
 * A name absent from this tree is reported as such rather than skipped — a competitor we
 * cannot measure is a hole in the baseline, not an absence of one.
 */
const LAYERS: Record<string, string[]> = {
  linegauge: ['string-width', 'wrap-ansi', 'strip-ansi', 'slice-ansi', 'cli-truncate', 'widest-line', 'wcwidth'],
  closeout: ['signal-exit', 'exit-hook', 'onetime', 'mimic-fn', 'cli-cursor', 'restore-cursor'],
  seniority: ['cosmiconfig', 'lilconfig', 'rc', 'dotenv', 'c12'],
  bellpull: ['execa', 'tinyexec', 'nano-spawn', 'which', 'isexe', 'npm-run-path', 'path-key'],
};

const KIB = 1024;
/** `YYYY-MM-DD` off the front of an ISO timestamp. */
const ISO_DATE = 10;
const kib = (n: number): string => `${Math.round(n / KIB)}`;

function weightTable(): string {
  const out: string[] = [];
  for (const [layer, names] of Object.entries(LAYERS)) {
    out.push(`\n#### ${layer}\n`, '| incumbent | version | packages installed | KiB on disk |', '| :-- | :-- | --: | --: |');
    const union = new Set<string>();
    for (const name of names) {
      const m = manifest(name);
      if (m === undefined) {
        out.push(`| \`${name}\` | — | *not in this tree* | — |`);
        continue;
      }
      const tree = closure(name);
      for (const p of tree) union.add(p);
      const size = [...tree].reduce((a, p) => a + bytes(p), 0);
      out.push(`| \`${name}\` | ${m.version ?? '?'} | ${tree.size} | ${kib(size)} |`);
    }
    const total = [...union].reduce((a, p) => a + bytes(p), 0);
    out.push(`| **all of them together** | | **${union.size}** | **${kib(total)}** |`);
    out.push(`| **\`${layer}\` must beat this** | | **1** | **< ${kib(total)}** |`);
  }
  return out.join('\n');
}

/**
 * The six rows from `linegauge/intent.md`. Every one is a single grapheme cluster whose
 * display width a naive implementation gets wrong; `expect` is the columns a terminal
 * actually advances.
 */
// Widths here are data, not arithmetic: each is the column count a terminal advances for
// that cluster, which is the whole point of the table.
/* eslint-disable conventions/no-magic-numbers */
const GRAPHEMES: [string, string, number][] = [
  ['family ZWJ', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}', 2],
  ['regional flag', '\u{1F1EE}\u{1F1F1}', 2],
  ['skin tone', '\u{1F44B}\u{1F3FD}', 2],
  ['keycap', '1️⃣', 2],
  ['combining', 'é', 1],
  ['CJK', '한국어', 6],
];
/* eslint-enable conventions/no-magic-numbers */

async function widthTable(): Promise<string> {
  const load = async (spec: string): Promise<((s: string) => number) | undefined> => {
    try {
      // The competitors are resolved by path on purpose: this file measures whichever
      // versions the tree actually installed, which a static import cannot express.
      // eslint-disable-next-line node-security/no-dynamic-dependency-loading
      const m = (await import(join(NM, spec))) as { default?: unknown };
      const d = m.default;
      if (typeof d === 'function') return d as (s: string) => number;
      // eastasianwidth exports an object whose `length` is a method calling `this`, so it
      // has to stay bound to its own module object.
      if (typeof d === 'object' && d !== null && 'length' in d) {
        const fn = (d as { length: unknown }).length;
        if (typeof fn === 'function') return (fn as (s: string) => number).bind(d);
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  const impls: [string, ((s: string) => number) | undefined][] = [
    ['string-width', await load('string-width/index.js')],
    ['wcwidth', await load('wcwidth/index.js')],
    ['eastasianwidth', await load('eastasianwidth/eastasianwidth.js')],
  ];

  const head = ['| row | a terminal advances |', '| :-- | --: |'];
  head[0] = `| row | a terminal advances | ${impls.map(([n]) => `\`${n}\``).join(' | ')} |`;
  head[1] = `| :-- | --: | ${impls.map(() => '--:').join(' | ')} |`;
  const rows = GRAPHEMES.map(([name, s, expect]) => {
    const cells = impls.map(([, fn]) => {
      if (fn === undefined) return '*absent*';
      const got = fn(s);
      return got === expect ? `${got}` : `**${got}** ✗`;
    });
    return `| ${name} | ${expect} | ${cells.join(' | ')} |`;
  });
  return [...head, ...rows].join('\n');
}

// The root package is CommonJS, so tsx compiles this to cjs and top-level await is out.
async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, ISO_DATE);
  process.stdout.write(
    [
      `<!-- generated by scripts/foundation-baseline.ts on ${today}; do not hand-edit the tables -->`,
      '',
      '### What a caller installs today',
      weightTable(),
      '',
      '### Width, where the claim is correctness rather than weight',
      '',
      await widthTable(),
      '',
    ].join('\n'),
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
