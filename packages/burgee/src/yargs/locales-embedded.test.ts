/**
 * A-20261028-yargs-locale-read-at-runtime: `burgee/yargs` reads no locale file to speak English,
 * and no locale read, of any locale, can fail a run (`yargs-compat` X9).
 *
 * `shim.ts` walked up from its own file to `package.json` **at module load**, to find
 * `locales/` for y18n, and y18n read `locales/en.json` on the first message and rethrew every
 * error but `ENOENT`. Found on emmercm/igir (`.sdlc/research/adoption/igir.md`): its
 * `bun build --compile` binary threw `ENOENT … scandir '/$bunfs'` from that walk on every
 * invocation, `--help` included, and under Node a locale read failing with `EUNKNOWN` — igir#2244,
 * a Windows `B:` drive — failed every invocation too. Every case below was red on `burgee@1.9.2`.
 *
 * Three ways in, each a child process over the built entry, which is the path a program takes:
 *
 * - **A failing filesystem.** A preload makes every `readdirSync` and every read of a
 *   `locales/*.json` throw, once with `EUNKNOWN` and once with `ENOENT`, and records each read
 *   of a locale file. English must read none, and German, whose file is unreadable, must still
 *   print help (in English) and exit 0.
 * - **One file and nothing beside it.** The program bundled by esbuild into a directory of its
 *   own, outside any package, which is what a single-file build ships. English must still be
 *   English: `Missing dependent arguments:` is the one string `en.json` does not keep as its key,
 *   so it is the one that tells the embedded table from no table.
 * - **A directory the program cannot list**, standing in for `/$bunfs`: the bundle's own
 *   directory made execute-only, so a walk up from the program fails at its first `readdirSync`.
 *
 * Then the string table in process, for what a child process cannot show: which reads happen.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';

import { scratchDirs } from '../__fixtures__/scratch-dir.js';

import { EN, SHIPPED } from './y18n-locales.js';
import { y18n } from './y18n.js';

const load = createRequire(fileURLToPath(new URL('../../package.json', import.meta.url)));
const scratch = scratchDirs();

/** A program in yargs syntax: one command whose `--input` implies `--output`. */
function program(dir: string, from: (spec: string) => string): string {
  const file = join(dir, 'prog.mjs');
  writeFileSync(
    file,
    [
      `import yargs from ${from('burgee/yargs')}; import { hideBin } from ${from('burgee/yargs/helpers')};`,
      'yargs(hideBin(process.argv)).scriptName("prog")',
      "  .command('copy', 'copy files', (b) => b.option('input', { type: 'string' }).option('output', { type: 'string' }).implies('input', 'output'), (argv) => console.log(`copy ${argv.input} -> ${argv.output}`))",
      '  .demandCommand(1).strict().parse();',
    ].join('\n'),
  );
  return file;
}

/** The built entry, as a file URL a program in any directory can import. */
const byUrl = (spec: string): string => JSON.stringify(pathToFileURL(load.resolve(spec)).href);
/** The built entry, as a path esbuild resolves. */
const byPath = (spec: string): string => JSON.stringify(load.resolve(spec));

/**
 * The failing filesystem: every `readdirSync` throws `FAIL_CODE`, as `/$bunfs` did, and so does
 * every read of a `locales/*.json`, as igir#2244's did. Each locale read is reported on exit.
 */
const PRELOAD = `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const code = process.env.FAIL_CODE;
const fail = (syscall, path) => Object.assign(new Error(code + ': failing on purpose, ' + syscall + " '" + path + "'"), { code, syscall, path });
const isLocale = (path) => /[\\\\/]locales[\\\\/][^\\\\/]+\\.json$/.test(String(path));
const { readFileSync } = fs;
const reads = [];
fs.readdirSync = (path) => { throw fail('scandir', path); };
fs.readFileSync = function (path, ...rest) {
  if (isLocale(path)) { reads.push(String(path)); throw fail('open', path); }
  return readFileSync.call(this, path, ...rest);
};
syncBuiltinESMExports();
process.on('exit', () => process.stderr.write('locale reads: ' + reads.length + '\\n'));
`;

interface Run {
  stdout: string;
  stderr: string;
  status: number | null;
}

/** English, whatever the machine's own locale is: `LANG=C` would select no table at all. */
const ENGLISH = { LC_ALL: 'en_US.UTF-8' };

function run(args: string[], options: { file: string; preload?: string; env?: Record<string, string>; cwd?: string }): Run {
  const flags = options.preload === undefined ? [] : ['--import', pathToFileURL(options.preload).href];
  const child = spawnSync(process.execPath, [...flags, options.file, ...args], {
    encoding: 'utf8',
    cwd: options.cwd,
    env: { ...process.env, FORCE_COLOR: '0', ...ENGLISH, ...options.env },
  });
  return { stdout: child.stdout, stderr: child.stderr, status: child.status };
}

const unpacked = program(scratch('burgee-locales-'), byUrl);
const preload = join(scratch('burgee-locales-preload-'), 'fail.mjs');
writeFileSync(preload, PRELOAD);

describe.each(['EUNKNOWN', 'ENOENT'])('with every readdirSync and locale read failing with %s', (code) => {
  const failing = (args: string[], env: Record<string, string> = {}): Run => run(args, { file: unpacked, preload, env: { FAIL_CODE: code, ...env } });

  it('loads, prints help and exits 0, reading no locale file', () => {
    const { stdout, stderr, status } = failing(['--help']);
    expect(stderr).toBe('locale reads: 0\n');
    expect(status).toBe(0);
    expect(stdout).toContain('Commands:');
    expect(stdout).toContain('copy files');
  });

  it('parses and runs a valid command', () => {
    const { stdout, status } = failing(['copy', '--input', 'a', '--output', 'b']);
    expect(status).toBe(0);
    expect(stdout).toBe('copy a -> b\n');
  });

  it("prints yargs' English validation error, from no file", () => {
    const { stderr, status } = failing(['copy', '--input', 'a']);
    expect(status).toBe(1);
    expect(stderr).toContain('Missing dependent arguments:\n input -> output');
    expect(stderr).toMatch(/locale reads: 0\n$/);
  });

  it('falls back to English when the locale asked for cannot be read, and still exits 0', () => {
    const { stdout, stderr, status } = failing(['--help'], { LC_ALL: 'de_DE.UTF-8' });
    expect(status).toBe(0);
    expect(stdout).toContain('Commands:');
    // Nothing printed but the preload's count: the failure is absorbed, not reported.
    expect(stderr).toMatch(/^locale reads: \d\n$/);
  });
});

describe('the same program as one file with nothing beside it', async () => {
  const dir = scratch('burgee-single-file-');
  const bundled = join(dir, 'prog.mjs');
  await build({ entryPoints: [program(scratch('burgee-single-file-src-'), byPath)], bundle: true, platform: 'node', format: 'esm', outfile: bundled, logLevel: 'silent' });

  it('prints help from an empty directory', () => {
    const { stdout, status } = run(['--help'], { file: bundled, cwd: scratch('burgee-empty-cwd-') });
    expect(status).toBe(0);
    expect(stdout).toContain('Commands:');
  });

  it('speaks English with no locales/ on disk', () => {
    const { stderr, status } = run(['copy', '--input', 'a'], { file: bundled });
    expect(status).toBe(1);
    expect(stderr).toContain('Missing dependent arguments:\n input -> output');
  });

  it('still reads German from disk when the package is installed', () => {
    const { stdout, status } = run(['--help'], { file: unpacked, env: { LC_ALL: 'de_DE.UTF-8' } });
    expect(status).toBe(0);
    expect(stdout).toContain('Kommandos:');
  });

  // Root reads any directory, and Windows has no execute-only directory to make.
  const canLock = process.platform !== 'win32' && process.getuid?.() !== 0;
  describe.runIf(canLock)('in a directory it cannot list, as a Bun binary is in /$bunfs', () => {
    afterAll(() => {
      chmodSync(dir, 0o755);
    });

    it('loads, prints help and exits 0', () => {
      chmodSync(dir, 0o111);
      const { stdout, stderr, status } = run(['--help'], { file: bundled, cwd: scratch('burgee-locked-cwd-') });
      expect(stderr).toBe('');
      expect(status).toBe(0);
      expect(stdout).toContain('Commands:');
    });
  });
});

describe('the embedded table is the one locales/ generates', () => {
  const dir = new URL('../../locales/', import.meta.url);

  // `generate-yargs-locales.mjs --check` holds the module's text, in the package's `build`, which
  // every test run follows. These hold its values, in process, so they also see a table changed
  // under a mutation run, where the instrumented source no longer matches any rendering.
  it('names every locale locales/ ships, and no other', () => {
    const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
    expect([...SHIPPED]).toEqual(files.map((name) => name.slice(0, -'.json'.length)).sort());
  });

  it('holds every entry of en.json that is not its own key, and nothing else', () => {
    const english = JSON.parse(readFileSync(new URL('en.json', dir), 'utf8')) as Record<string, unknown>;
    expect(EN).toEqual(Object.fromEntries(Object.entries(english).filter(([key, value]) => value !== key)));
  });
});

describe('the string table (y18n)', () => {
  /** A locale directory that throws when it is looked for: any read of it is visible. */
  const unreachable = (): string => {
    throw Object.assign(new Error('EUNKNOWN: unknown error'), { code: 'EUNKNOWN' });
  };

  it('serves English from the module graph, never asking where locales/ is', () => {
    const strings = y18n({ directory: unreachable });
    strings.setLocale('en_US');
    expect(strings.__('Implications failed:')).toBe('Missing dependent arguments:');
    expect(strings.__('Commands:')).toBe('Commands:');
    expect(strings.__n('Unknown argument: %s', 'Unknown arguments: %s', 2, 'a, b')).toBe('Unknown arguments: a, b');
  });

  it('falls back to English when a shipped locale cannot be read', () => {
    const strings = y18n({ directory: unreachable });
    strings.setLocale('de');
    expect(strings.__('Commands:')).toBe('Commands:');
    expect(strings.__('Implications failed:')).toBe('Missing dependent arguments:');
  });

  it('falls back to English when a shipped locale is not JSON', () => {
    const dir = scratch('burgee-bad-locale-');
    writeFileSync(join(dir, 'fr.json'), '{ not json');
    const strings = y18n({ directory: dir });
    strings.setLocale('fr_FR');
    expect(strings.__('Commands:')).toBe('Commands:');
  });

  it('reads a shipped locale through its language, and a string directory as given', () => {
    const strings = y18n({ directory: fileURLToPath(new URL('../../locales', import.meta.url)) });
    strings.setLocale('de_AT');
    expect(strings.__('Commands:')).toBe('Kommandos:');
  });

  it('leaves a locale it does not ship as its keys, without looking for a file, as y18n does', () => {
    const strings = y18n({ directory: unreachable });
    strings.setLocale('qq_XX');
    expect(strings.__('Implications failed:')).toBe('Implications failed:');
    const exact = y18n({ directory: unreachable, fallbackToLanguage: false });
    exact.setLocale('de_AT');
    expect(exact.__('Commands:')).toBe('Commands:');
  });

  it('gives each table its own copy of English, so updateStrings() on one leaves the next alone', () => {
    const first = y18n({ directory: unreachable });
    first.updateLocale({ 'Commands:': 'Things:' });
    expect(first.__('Commands:')).toBe('Things:');
    expect(y18n({ directory: unreachable }).__('Commands:')).toBe('Commands:');
    expect(y18n({ directory: unreachable }).__('Implications failed:')).toBe('Missing dependent arguments:');
  });
});
