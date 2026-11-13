/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * "Supports several TypeScript versions" as a check: every published declaration, type-checked by
 * the `tsc` of each supported TypeScript line (intent `typescript-matrix`).
 *
 * `declaration-reach.test.ts` already imports every typed subpath under five resolution setups,
 * but through the compiler API of the one TypeScript the repository builds with, and it reads the
 * resolution diagnostics only. An adopter runs their own compiler, so this runs each line's own
 * `tsc` binary over the same consumer (TypeScript 7 ships no compiler API to call), with
 * `skipLibCheck` off, and fails on any diagnostic at all: a declaration that 6.0 emits and 5.9
 * cannot read is a type error in the package, not a failed resolution.
 *
 * The three compilers are root devDependencies: `typescript` is the one the repository builds
 * with, `typescript-5.9` and `typescript-7.0` are npm aliases held to their minor line.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discard } from './scratch-dir.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Each supported line, and the package under `node_modules` whose `tsc` speaks for it. */
const COMPILERS = [
  { line: '5.9', dir: 'typescript-5.9' },
  { line: '6.0', dir: 'typescript' },
  { line: '7.0', dir: 'typescript-7.0' },
] as const;

type Line = (typeof COMPILERS)[number]['line'];

/** The consumer setups of spec `types-under-node10` R4, as a `tsconfig.json` spells them. */
const CONSUMERS: { name: string; esm: boolean; options: Record<string, string>; only?: readonly Line[] }[] = [
  { name: 'commonjs, no moduleResolution', esm: false, options: { module: 'commonjs' } },
  // 6.0 deprecates node10 (TS5107) and reads it only under `ignoreDeprecations`, which 5.9 rejects
  // (TS5103). 7.0 removed it (TS5108), so that line has no node10 consumer to hold.
  { name: 'node10', esm: false, options: { module: 'commonjs', moduleResolution: 'node10' }, only: ['5.9'] },
  { name: 'node10, deprecation silenced', esm: false, options: { module: 'commonjs', moduleResolution: 'node10', ignoreDeprecations: '6.0' }, only: ['6.0'] },
  { name: 'node16 (ESM consumer)', esm: true, options: { module: 'node16', moduleResolution: 'node16' } },
  { name: 'nodenext (ESM consumer)', esm: true, options: { module: 'nodenext', moduleResolution: 'nodenext' } },
  { name: 'bundler', esm: false, options: { module: 'esnext', moduleResolution: 'bundler' } },
];

/**
 * Diagnostics this lock reads past, each with the reason. A line of `tsc` output is excused when
 * it carries the code and names the file; the consumer's name must start with one of `consumers`.
 */
const KNOWN: readonly { code: string; file: string; consumers: readonly string[]; why: string }[] = [
  {
    code: 'TS2307',
    file: 'packages/oxmutate/dist/vite.d.ts',
    consumers: ['commonjs', 'node10'],
    why: "Vite 8 publishes its types through `exports` only, which node10 ignores for every program (`declaration-reach.test.ts` › EXPORTS_ONLY_PEERS)",
  },
  {
    code: 'TS1471',
    file: 'packages/closeout/dist/signal-exit.d.cts',
    consumers: ['node16'],
    why: '.sdlc/gaps/A-20261112-closeout-signal-exit-dcts-node16.md: the CommonJS declaration `require`s an ES module, which `module: node16` refuses on every line',
  },
];

/** Every published workspace package. */
const published = readdirSync(join(REPO_ROOT, 'packages'))
  .filter((dir) => existsSync(join(REPO_ROOT, 'packages', dir, 'package.json')))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf8')) as { name: string; private?: boolean; exports?: Record<string, unknown> } }))
  .filter(({ pkg }) => pkg.private !== true);

/** The root and every typed subpath of every published package — what an adopter can import. */
const specifiers = published.flatMap(({ pkg }) =>
  Object.entries(pkg.exports ?? {})
    .filter(([, value]) => value !== null && typeof value === 'object' && typeof (value as { types?: unknown }).types === 'string')
    .map(([key]) => (key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`)),
);

/** Runs the `tsc` of the compiler installed as `dir` with `args`, from `cwd`, and resolves to everything it printed. */
function tsc(dir: string, args: string[], cwd = REPO_ROOT): Promise<string> {
  return new Promise((done) => {
    execFile(process.execPath, [join(REPO_ROOT, 'node_modules', dir, 'bin', 'tsc'), ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      const text = `${stdout}${stderr}`;
      // A compiler that failed without naming a diagnostic (it could not start) must not read as clean.
      done(error !== null && !/error TS\d+/.test(text) ? `error TS0: tsc failed with no diagnostic: ${text.trim().split('\n')[0] ?? error.message}` : text);
    });
  });
}

/** One compiler over one consumer setup. */
const CELLS = COMPILERS.flatMap(({ line, dir }) => CONSUMERS.filter(({ only }) => only === undefined || only.includes(line)).map((consumer) => ({ line, dir, ...consumer })));

/** What each cell's `tsc` printed, by `<line> <consumer name>`. */
const printed = new Map<string, string>();
const consumers: string[] = [];

/**
 * How many cells compile at a time: one per core. A cell is one `tsc` process, so more than the
 * cores adds memory and no speed.
 *
 * All fourteen at once timed this hook out at 60 s on `Node 24 · macos-latest` (run 43482009402,
 * 2026-11-13; it took 50.6 s on a macOS run that passed, 32.5 s on Windows and 20.2 s on Ubuntu).
 * Measured alone (2026-11-13, 14 cores): each 5.9 or 6.0 `tsc` is about 1 s at 425–480 MB
 * resident and each 7.0 one 0.4 s at 240 MB. All at once, the `tsc` processes' summed resident
 * memory peaked at 2.8 GB (sampled every 100 ms); three at a time, 1.4 GB. macos-latest has three
 * cores and 7 GB, shared with the root suite's other files (ink-alias-lock's `npm install`s run
 * beside this one), so all at once is fourteen compilers time-slicing three cores, with the
 * memory of the whole matrix held until the slowest finishes.
 */
const AT_ONCE = Math.max(1, Math.min(CELLS.length, availableParallelism()));

/** Runs `task` over `items`, `limit` at a time: each worker takes the next item when its last one is done. */
async function inTurns<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    // eslint-disable-next-line reliability/no-await-in-loop -- one cell after another per worker, on purpose; the workers run side by side
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  };
  await Promise.all(Array.from({ length: limit }, worker));
}

// Every cell compiles here, before the cases: the fourteen compiles one after another were 29 s and
// up to 4.7 s a case, against a 5 s case budget (D-20261101-tests-under-5s). Each has its own
// consumer directory, since the setups differ in `package.json` and `tsconfig.json`.
beforeAll(async () => {
  await inTurns(CELLS, AT_ONCE, async ({ line, dir, name, esm, options }) => {
    const consumer = mkdtempSync(join(tmpdir(), 'typescript-matrix-'));
    consumers.push(consumer);
    mkdirSync(join(consumer, 'node_modules'));
    for (const { dir: from, pkg } of published) symlinkSync(join(REPO_ROOT, 'packages', from), join(consumer, 'node_modules', pkg.name), 'junction');
    writeFileSync(join(consumer, 'index.ts'), `${specifiers.map((spec, i) => `import type * as m${String(i)} from '${spec}';`).join('\n')}\nexport type All = [${specifiers.map((_, i) => `typeof m${String(i)}`).join(', ')}];\n`);
    writeFileSync(join(consumer, 'package.json'), JSON.stringify(esm ? { type: 'module' } : {}));
    writeFileSync(
      join(consumer, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { ...options, target: 'es2023', lib: ['es2023'], noEmit: true, strict: true, skipLibCheck: false, types: ['node'], typeRoots: [join(REPO_ROOT, 'node_modules', '@types')] },
        files: ['index.ts'],
      }),
    );
    printed.set(`${line} ${name}`, await tsc(dir, ['-p', '.', '--pretty', 'false'], consumer));
  });
});
afterAll(() => discard(...consumers));

it('imports the root and every typed subpath of every published package', () => {
  expect(specifiers).toContain('burgee/commander');
  expect(specifiers.length).toBeGreaterThan(published.length);
});

describe.each(COMPILERS)('TypeScript $line', ({ line, dir }) => {
  it('is the line its name says, so a bump cannot quietly stop grading one', async () => {
    expect((await tsc(dir, ['--version'])).trim()).toMatch(new RegExp(`^Version ${line.replace('.', '\\.')}\\.\\d+$`));
  });

  it.each(CELLS.filter((cell) => cell.line === line))('type-checks every published declaration: $name', ({ name }) => {
    const output = printed.get(`${line} ${name}`);
    expect(output).toBeDefined();
    const diagnostics = (output ?? '')
      .split('\n')
      .filter((text) => /error TS\d+/.test(text))
      .filter((text) => !KNOWN.some(({ code, file, consumers: excused }) => text.includes(`error ${code}:`) && text.replaceAll('\\', '/').includes(`${file}(`) && excused.some((prefix) => name.startsWith(prefix))));
    expect(diagnostics, `TypeScript ${line} reports ${String(diagnostics.length)} diagnostic(s) over ${String(specifiers.length)} specifiers`).toEqual([]);
  });
});
