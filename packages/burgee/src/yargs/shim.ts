/**
 * yargs' Node platform shim — the one object every yargs module reaches the platform
 * through — built from burgee's own ports of its dependencies (J9). Anything that
 * yargs 18 took from `cliui`, `escalade`, `get-caller-file`, `string-width`, `y18n`
 * and `yargs-parser` is served from here.
 */
 
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

import { Parser } from '../yargs-parser.js';

import { cliui, stringWidth } from './cliui.js';
import { getProcessArgvBin } from './utils.js';
import { y18n, type Y18N } from './y18n.js';

export interface PlatformShim {
  assert: { notStrictEqual: (a: any, b: any, m?: string) => void; strictEqual: (a: any, b: any, m?: string) => void };
  cliui: typeof cliui;
  findUp: (start: string, callback: (dir: string, names: string[]) => string | undefined) => string | undefined;
  getEnv: (key: string) => string | undefined;
  inspect: typeof inspect;
  getProcessArgvBin: () => string;
  mainFilename: string;
  Parser: typeof Parser;
  path: {
    basename: typeof basename;
    dirname: typeof dirname;
    extname: typeof extname;
    relative: typeof relative;
    resolve: typeof resolve;
    join: typeof join;
  };
  process: {
    argv: () => string[];
    cwd: () => string;
    emitWarning: (warning: string | Error, type?: string) => void;
    execPath: () => string;
    exit: (code: number) => void;
    nextTick: (cb: () => void) => void;
    stdColumns: number | null;
    /** burgee: the streams --mcp serves on, reached through the shim like everything else. */
    stdin: () => NodeJS.ReadableStream;
    stdout: () => { write: (s: string) => unknown };
  };
  readFileSync: typeof readFileSync;
  readdirSync: typeof readdirSync;
  require: NodeJS.Require;
  getCallerFile: () => string;
  stringWidth: (str: string) => number;
  y18n: Y18N;
}

const here = fileURLToPath(import.meta.url);
const mainFilename = here.substring(0, here.lastIndexOf('node_modules'));
const nodeRequire = createRequire(import.meta.url);

/** escalade/sync: walk up from `start`, asking `callback` at each directory. */
function findUp(start: string, callback: (dir: string, names: string[]) => string | undefined): string | undefined {
  let dir = resolve('.', start);
  let tmp: string | undefined;
  const stats = statSync(dir);
  if (!stats.isDirectory()) dir = dirname(dir);
  for (;;) {
    tmp = callback(dir, readdirSync(dir));
    if (tmp) return resolve(dir, tmp);
    tmp = dir;
    dir = dirname(dir);
    if (tmp === dir) break;
  }
  return undefined;
}

/** get-caller-file: the file that called the function that called this (v8 stack). */
function getCallerFile(position = 2): string | undefined {
  if (position >= Error.stackTraceLimit) {
    throw new TypeError(
      `getCallerFile(position) requires position be less then Error.stackTraceLimit but position was: \`${position}\` and Error.stackTraceLimit was: \`${Error.stackTraceLimit}\``,
    );
  }
  const oldPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  const stack = new Error().stack as unknown as NodeJS.CallSite[] | undefined;
  Error.prepareStackTrace = oldPrepareStackTrace;
  if (stack !== null && typeof stack === 'object') {
    const site = stack[position];
    return site ? (site.getFileName() ?? undefined) : undefined;
  }
  return undefined;
}

function notStrictEqual(actual: any, expected: any, message?: string): void {
  if (actual === expected) throw new Error(message ?? `Expected "actual" to be strictly unequal to: ${inspect(expected)}`);
}

function strictEqual(actual: any, expected: any, message?: string): void {
  if (actual !== expected) throw new Error(message ?? `Expected values to be strictly equal:\n\n${inspect(actual)} !== ${inspect(expected)}\n`);
}

/**
 * Where the 29 locale files live: the package root, not beside this file.
 *
 * This was `resolve(dirname(here), '../locales')`, which was right only while this file sat
 * directly in `dist/`. The first directory added under `src/` made it `dist/locales`, y18n
 * returned the key for every string, and 14 of yargs' own 804 tests failed. Walking up to
 * `package.json` resolves the same from `src/`, from `dist/`, and from
 * `node_modules/burgee/dist/` once published — so a later move cannot repeat it.
 */
const locales = resolve(
  dirname(findUp(here, (_dir, names) => (names.includes('package.json') ? 'package.json' : undefined)) ?? here),
  'locales',
);

export const shim: PlatformShim = {
  assert: { notStrictEqual, strictEqual },
  cliui,
  findUp,
  getEnv: (key) => process.env[key],
  inspect,
  getProcessArgvBin,
  mainFilename: mainFilename || process.cwd(),
  Parser,
  path: { basename, dirname, extname, relative, resolve, join },
  process: {
    argv: () => process.argv,
    cwd: process.cwd,
    emitWarning: (warning, type) => process.emitWarning(warning, type),
    execPath: () => process.execPath,
    exit: (code) => {
      process.exit(code);
    },
    nextTick: process.nextTick,
    stdColumns: typeof process.stdout.columns !== 'undefined' ? process.stdout.columns : null,
    stdin: () => process.stdin,
    stdout: () => process.stdout,
  },
  readFileSync,
  readdirSync,
  require: nodeRequire,
  getCallerFile: () => {
    const callerFile = getCallerFile(3) ?? '';
    return /^file:\/\//.exec(callerFile) ? fileURLToPath(callerFile) : callerFile;
  },
  stringWidth,
  y18n: y18n({ directory: locales, updateFiles: false }),
};
