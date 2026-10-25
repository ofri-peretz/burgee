/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * absorption-probe.ts — has the platform absorbed a foundation layer yet? (`cli-foundation-stack` Y4)
 *
 *   npx tsx scripts/absorption-probe.ts            # a table, one row per layer
 *   npx tsx scripts/absorption-probe.ts --json     # the same counts as one JSON line
 *
 * Each foundation layer composes a Node builtin and adds what the builtin does not do. The
 * research behind the tier killed two candidates by exactly this question (`candidate-layers.md`):
 * the platform already did their job. So the question is asked again on every Node line the
 * `compat.yml` floor job runs. Each layer has a set of vectors, and each vector has one right
 * answer. The layer must pass every one (`scripts/absorption-probe.test.ts` holds that); the
 * probe reports how many the builtin passes **alone**.
 *
 * Reported, never gated. A count that rises on a new LTS is the signal to open an intent and
 * deprecate that layer on purpose, rather than find out from a user.
 *
 * Reads the packages' built `dist`, which is what a user runs and what the floor job builds.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseEnv, stripVTControlCharacters } from 'node:util';

// eslint-disable-next-line import-next/no-relative-packages -- by path, the built dist: what a user runs and what the floor job builds, and the root manifest depends on none of the layers
import crossSpawn from '../packages/bellpull/dist/cross-spawn.js';
// eslint-disable-next-line import-next/no-relative-packages -- as above
import { strip, width } from '../packages/linegauge/dist/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- as above
import { parse as parseDotenv } from '../packages/seniority/dist/dotenv.js';

const ESC = '\u001B';
const BEL = '\u0007';

export interface Vector<I, O> {
  readonly input: I;
  readonly expected: O;
}

export interface Probe<I, O> {
  /** The package and the part of it this row measures. */
  readonly layer: string;
  /** The builtin the layer composes, which is what the README names (Y4). */
  readonly builtin: string;
  readonly vectors: readonly Vector<I, O>[];
  readonly viaLayer: (input: I) => O;
  /** The builtin pointed at the same job with nothing added. */
  readonly viaBuiltin: (input: I) => O;
}

const STRIP: Probe<string, string> = {
  layer: 'linegauge · strip',
  builtin: 'util.stripVTControlCharacters',
  vectors: [
    { input: `${ESC}[31mred${ESC}[39m`, expected: 'red' },
    { input: `${ESC}[1;38;2;255;0;0mbold${ESC}[0m`, expected: 'bold' },
    { input: `${ESC}]8;;https://x.y${ESC}\\link${ESC}]8;;${ESC}\\`, expected: 'link' },
    { input: `${ESC}]8;;https://x.y${BEL}link${ESC}]8;;${BEL}`, expected: 'link' },
    { input: `a${ESC}[2Kb`, expected: 'ab' },
    { input: '\u009B31mc1\u009B0m', expected: 'c1' },
    { input: `${ESC}[?25lhide${ESC}[?25h`, expected: 'hide' },
    { input: `${ESC}]0;title${BEL}after`, expected: 'after' },
    // The colon form of an SGR parameter (ITU T.416), which the builtin left half-stripped before Node 26.
    { input: `${ESC}[38:2::255:0:0mred${ESC}[39m`, expected: 'red' },
    { input: `${ESC}[4:3mcurly${ESC}[24m`, expected: 'curly' },
    { input: `${ESC}[58:5:196mul${ESC}[59m`, expected: 'ul' },
  ],
  viaLayer: strip,
  viaBuiltin: stripVTControlCharacters,
};

const segmenter = new Intl.Segmenter();

const WIDTH: Probe<string, number> = {
  layer: 'linegauge · width',
  builtin: 'Intl.Segmenter',
  vectors: [
    { input: 'abc', expected: 3 },
    { input: '古池や', expected: 6 },
    { input: '👍', expected: 2 },
    { input: '👨‍👩‍👧', expected: 2 },
    { input: 'é', expected: 1 },
    { input: `${ESC}[31m古${ESC}[0m`, expected: 2 },
    { input: 'ｱｲｳ', expected: 3 },
    { input: '\u200B', expected: 0 },
    { input: '🇮🇱', expected: 2 },
  ],
  viaLayer: (s) => width(s),
  // A grapheme is one column: the most the builtins say about width with nothing added.
  viaBuiltin: (s) => [...segmenter.segment(stripVTControlCharacters(s))].length,
};

const DOTENV: Probe<string, Record<string, string>> = {
  layer: 'seniority · dotenv',
  builtin: 'util.parseEnv',
  vectors: [
    { input: 'A=1', expected: { A: '1' } },
    { input: 'B="two words"', expected: { B: 'two words' } },
    { input: 'D=x # comment', expected: { D: 'x' } },
    { input: 'export E=5', expected: { E: '5' } },
    { input: 'F="line1\\nline2"', expected: { F: 'line1\nline2' } },
    { input: 'K="multi\nline"', expected: { K: 'multi\nline' } },
    { input: 'M="a\\"b"', expected: { M: 'a\\"b' } },
    { input: 'R=1\nR=2', expected: { R: '2' } },
    { input: 'V=a\r\nW=b', expected: { V: 'a', W: 'b' } },
    { input: 'AA="unterminated', expected: { AA: '"unterminated' } },
  ],
  viaLayer: (s) => parseDotenv(s),
  viaBuiltin: (s) => ({ ...parseEnv(s) }),
};

/** Started with no shell, by name: `npm` is a `.cmd` shim on Windows, which `spawn` alone cannot start. */
const STARTS: Probe<string, boolean> = {
  layer: 'bellpull · cross-spawn',
  builtin: 'child_process',
  vectors: ['node', 'npm', 'npx'].map((input) => ({ input, expected: true })),
  viaLayer: (name) => {
    const r = crossSpawn.sync(name, ['--version'], { stdio: 'ignore' });
    return r.error === undefined && r.status === 0;
  },
  viaBuiltin: (name) => {
    const r = spawnSync(name, ['--version'], { stdio: 'ignore' });
    return r.error === undefined && r.status === 0;
  },
};

const CLOSEOUT = new URL('../packages/closeout/dist/index.js', import.meta.url).href;

/** How a child process ends. The signals are POSIX: on Windows a signal ends a process with no handler run. */
const EXIT_PATHS: Record<string, string> = {
  'the loop empties': '',
  'process.exit(3)': 'process.exit(3);',
  'an uncaught throw': "setTimeout(() => { throw new Error('boom'); });",
  'an unhandled rejection': "Promise.reject(new Error('boom'));",
  ...(process.platform === 'win32'
    ? {}
    : {
        SIGTERM: "process.kill(process.pid, 'SIGTERM'); setTimeout(() => {}, 2000);",
        SIGINT: "process.kill(process.pid, 'SIGINT'); setTimeout(() => {}, 2000);",
        SIGHUP: "process.kill(process.pid, 'SIGHUP'); setTimeout(() => {}, 2000);",
      }),
};

/** How many times the exit handler ran, in a child that registers it `how` and then ends `path`'s way. */
function handlerRuns(how: 'layer' | 'builtin', path: string): number {
  const register =
    how === 'layer'
      ? `const { onExit } = await import(${JSON.stringify(CLOSEOUT)}); onExit(handler);`
      : "process.on('exit', handler);";
  const code = `const handler = () => { process.stdout.write('ran\\n'); }; ${register} ${EXIT_PATHS[path] ?? ''}`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 });
  return (r.stdout.match(/^ran$/gm) ?? []).length;
}

const EXACTLY_ONCE: Probe<string, number> = {
  layer: 'closeout · exactly once',
  builtin: 'process.on(signal)',
  vectors: Object.keys(EXIT_PATHS).map((input) => ({ input, expected: 1 })),
  viaLayer: (path) => handlerRuns('layer', path),
  // `process.on('exit')` is the builtin's whole answer: it fires on a code, never on a signal.
  viaBuiltin: (path) => handlerRuns('builtin', path),
};

export const PROBES = [STRIP, WIDTH, DOTENV, STARTS, EXACTLY_ONCE] as readonly Probe<unknown, unknown>[];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface Row {
  layer: string;
  builtin: string;
  vectors: number;
  /** Vectors the layer answers right. Anything short of `vectors` is a wrong vector or a broken layer. */
  layerPasses: number;
  /** Vectors the builtin answers right, alone. */
  builtinPasses: number;
  /** The inputs the builtin gets wrong — what the layer still adds. */
  builtinMisses: string[];
}

/** Ask one probe: how many vectors does each side answer right? */
export function ask<I, O>(probe: Probe<I, O>): Row {
  const passes = (via: (input: I) => O) => probe.vectors.filter((v) => same(via(v.input), v.expected));
  const builtin = passes(probe.viaBuiltin);
  return {
    layer: probe.layer,
    builtin: probe.builtin,
    vectors: probe.vectors.length,
    layerPasses: passes(probe.viaLayer).length,
    builtinPasses: builtin.length,
    builtinMisses: probe.vectors.filter((v) => !builtin.includes(v)).map((v) => JSON.stringify(v.input)),
  };
}

function main(): void {
  const rows = PROBES.map((p) => ask(p));
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ node: process.version, platform: process.platform, rows })}\n`);
    return;
  }
  const lines = [
    `Absorption probe — Node ${process.version} on ${process.platform}. Reported, never gated (cli-foundation-stack Y4).`,
    '',
    '| Layer | Builtin | Layer passes | Builtin alone passes | What the builtin still misses |',
    '| :--- | :--- | ---: | ---: | :--- |',
    ...rows.map((r) => `| ${r.layer} | \`${r.builtin}\` | ${r.layerPasses} / ${r.vectors} | ${r.builtinPasses} / ${r.vectors} | ${r.builtinMisses.join(' · ').replace(/\|/g, '\\|') || '—'} |`),
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
