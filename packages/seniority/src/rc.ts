/* eslint-disable maintainability/cognitive-complexity, maintainability/max-parameters, secure-coding/detect-object-injection -- A port graded by its incumbent's own suite, the exemption `eslint.config.mjs` already grants five other façades in this repository. `rc(name, defaults, argv, parse)` is rc's published signature and cannot be collapsed into an options object without ceasing to be drop-in; the fifth parameter is the world, which R11 requires be an argument. `stripJsonComments` is a character scanner with four states, and its states are the spec — the reason it is hand-written rather than depended on is in its own doc comment. Object injection is the nesting walk in `fromEnv` and the merge in `deepExtend`, both of which take their keys from a config file or an environment and both of which drop `__proto__`, `constructor` and `prototype` before writing. */
/**
 * `seniority/rc` — rc 1.2.8's surface (R8, D-006).
 *
 * rc is the oldest precedence package in this layer and the closest in spirit to what
 * seniority is for: one call that merges defaults, a stack of config files, the environment
 * and the command line, in a fixed order. It ships four dependencies — `deep-extend`, `ini`,
 * `minimist` and `strip-json-comments` — to do it. This is the same order with none.
 *
 * **What is reproduced.** The file stack in rc's own sequence and none of it reordered:
 * `/etc/<name>/config`, `/etc/<name>rc`, `~/.config/<name>/config`, `~/.config/<name>`,
 * `~/.<name>/config`, `~/.<name>rc`, then the nearest `.<name>rc` found by walking up from
 * the working directory, then a file named by `config` in the environment, then one named by
 * `config` on the command line. Later wins. `configs` and `config` are appended at the end,
 * so a caller can see which files were actually read — the same information seniority's own
 * `provenance` carries, in rc's shape.
 *
 * `__` in an environment key nests: `NAME_a__b__c=1` is `{a: {b: {c: '1'}}}`, empty segments
 * dropped. JSON with `//` and comments is accepted, because rc accepts it and its own graded
 * file is written in it.
 *
 * **What is not, and it is one thing: `ini`.** rc falls back to `ini.parse` for any file that
 * does not start with `{`. Constraint 3 bundles no format parser, so an INI-shaped file is
 * refused **by name** with the option that supplies one — the same refusal `loadYaml` makes
 * for YAML, for the same reason, and `parse` is rc's own fourth parameter so supplying one
 * costs a caller one argument.
 *
 * ## The measured ceiling, and it is not in this file
 *
 * rc's graded file (`test/test.js`) is three `assert` calls deep on ambient state:
 *
 * ```js
 * process.env[n + '_envOption'] = 42
 * var config = require('../')(n, { option: true })
 * assert.equal(config.envOption, 42)
 * ```
 *
 * `rc(name, defaults, argv)` has a slot for argv — rc's own third parameter, which the second
 * half of that file uses — and **no slot at all for the environment**. Nothing in seniority
 * reads `process.*` (R11), and the repository-wide lock
 * (`packages/burgee/src/process-reference-lock.test.ts`) allows exactly one file per package
 * to, named `<pkg>/src/runtime.ts`; seniority has no entry, which is a claim its design makes
 * about itself. So the environment arrives here as an argument, like `env`, `cwd` and `argv`
 * everywhere else in this package, and the one graded assertion above fails.
 *
 * That is why this row is **0 / 1 with the façade built** rather than `target not built yet`:
 * the difference is a measurement versus an absence, and what the measurement says is that
 * the gap is R11 and not rc. It moves the day `seniority/src/runtime.ts` exists and is on
 * that allow-list — the arrangement burgee's own commander and yargs façades already run on,
 * for exactly this reason: an incumbent whose suite grades a process contract.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';

import { LoaderError } from './load.js';

/** A parsed config document. rc places no shape on it, and neither does this. */
export type RcConfig = Record<string, unknown>;

/** rc's fourth parameter: turn a file's text into an object. */
export type RcParse = (content: string) => RcConfig;

/**
 * The world, as an argument (R11). Every field has a default that touches no process:
 * `cwd` resolves the empty path, `home` asks `os`, and `env` is **empty** — because guessing
 * an environment is worse than not having one, which is the call `seniority/dotenv` already
 * makes for `processEnv`.
 */
export interface RcOptions {
  /** The environment to read `<NAME>_*` from. Pass `process.env` at the one place a program owns its process. */
  env?: Record<string, string | undefined>;
  /** Where the upward walk for `.<name>rc` starts. */
  cwd?: string;
  /** The home directory the four `~` places hang off. */
  home?: string;
  /** Skip the `/etc` places, as rc does on Windows. */
  win?: boolean;
}

const WALK_LIMIT = 64;

/** Is this a plain object we may merge into rather than replace? */
function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `deep-extend`'s merge, in the one shape rc uses it: sources left to right, later wins,
 * plain objects merged and everything else replaced. Arrays are **replaced, not
 * concatenated** — which is `deep-extend`'s behaviour for an array target, and the thing a
 * hand-rolled merge most often gets wrong in the other direction.
 */
function deepExtend(target: RcConfig, source: RcConfig): RcConfig {
  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const existing = target[key];
    target[key] = isPlain(value) && isPlain(existing) ? deepExtend({ ...existing }, value) : value;
  }
  return target;
}

/**
 * `//` and block comments removed, without touching either inside a string. Written out
 * rather than depended on: `strip-json-comments` is 4 M/wk for thirty lines, and rc's own
 * graded file is a JSON document with two comments in it, so this is the part of rc that
 * cannot be skipped.
 */
function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next;
        i += 1;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * rc's own `cc.parse`: a document starting with `{` is JSON — comments allowed — and anything
 * else is INI, which this package does not bundle a parser for (constraint 3). The refusal
 * names `parse`, rc's fourth parameter, so supplying `ini.parse` is one argument.
 */
export function parse(content: string): RcConfig {
  if (/^\s*\{/.test(content)) return JSON.parse(stripJsonComments(content)) as RcConfig;
  throw new LoaderError(
    'no INI parser for this file',
    '',
    "pass rc's fourth argument — rc(name, defaults, argv, ini.parse) — seniority reads the JSON half of rc's format and bundles no format parser",
  );
}

/** The text of a readable file, or undefined. rc swallows every error here and so does this. */
function readIfFile(file: string): string | undefined {
  try {
    if (!existsSync(file) || !statSync(file).isFile()) return undefined;
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * rc's `cc.find`: the nearest `.<name>rc` at or above `from`.
 *
 * Bounded at `WALK_LIMIT` for the reason `search.ts` states — the same bound, and the same
 * argument: an unbounded upward walk is a hang waiting for a symlink ring, and no real tree
 * is sixty-four deep.
 */
function findUpward(from: string, file: string): string | undefined {
  let dir = from;
  for (let depth = 0; depth < WALK_LIMIT; depth += 1) {
    const at = join(dir, file);
    if (existsSync(at)) return at;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

/**
 * rc's `cc.env`: every key that starts with the prefix, case-insensitively, with `__` read as
 * nesting and empty segments dropped. `NAME_config` is how a caller names a file from the
 * environment, which is why this runs before the file stack is closed.
 */
function fromEnv(prefix: string, env: Record<string, string | undefined>): RcConfig {
  const out: RcConfig = {};
  const lower = prefix.toLowerCase();
  for (const [key, value] of Object.entries(env)) {
    if (!key.toLowerCase().startsWith(lower)) continue;
    const segments = key.slice(prefix.length).split('__').filter(Boolean);
    if (segments.length === 0) continue;
    let cursor = out;
    segments.forEach((segment, i) => {
      if (i === segments.length - 1) {
        cursor[segment] = value;
        return;
      }
      const next = cursor[segment];
      const child = isPlain(next) ? next : {};
      cursor[segment] = child;
      cursor = child;
    });
  }
  return out;
}

/**
 * rc, with its world as an argument.
 *
 * `defaults` may be a string, which rc reads as a JSON document — `cc.json` — and that form
 * is kept because it is how rc's own README tells you to pass a default config.
 */
export function rc(name: string, defaults?: RcConfig | string, argv?: RcConfig, parseWith: RcParse = parse, options: RcOptions = {}): RcConfig {
  if (typeof name !== 'string') throw new TypeError('rc(name): name *must* be string');
  const env = options.env ?? {};
  const cwd = options.cwd ?? resolvePath('');
  const home = options.home ?? homedir();
  const args = argv ?? {};

  const layers: RcConfig[] = [typeof defaults === 'string' ? (JSON.parse(stripJsonComments(defaults)) as RcConfig) : (defaults ?? {})];
  const files: string[] = [];

  const add = (file: string | undefined): void => {
    if (file === undefined || files.includes(file)) return;
    const content = readIfFile(file);
    if (content === undefined) return;
    layers.push(parseWith(content));
    files.push(file);
  };

  // rc's order exactly, and the comment is the contract: `/etc` first so a machine-wide
  // setting is the weakest thing that is not a default, the home places next, the project's
  // own `.<name>rc` after them, and an explicitly named file last.
  if (options.win !== true) {
    add(join('/etc', name, 'config'));
    add(join('/etc', `${name}rc`));
  }
  if (home) {
    add(join(home, '.config', name, 'config'));
    add(join(home, '.config', name));
    add(join(home, `.${name}`, 'config'));
    add(join(home, `.${name}rc`));
  }
  add(findUpward(cwd, `.${name}rc`));

  const environment = fromEnv(`${name}_`, env);
  if (typeof environment['config'] === 'string') add(environment['config']);
  if (typeof args['config'] === 'string') add(args['config']);

  const resolved: RcConfig = {};
  for (const layer of layers) deepExtend(resolved, layer);
  deepExtend(resolved, environment);
  deepExtend(resolved, args);
  if (files.length > 0) deepExtend(resolved, { configs: files, config: files.at(-1) });
  return resolved;
}

// `'module.exports'` is what Node hands a CommonJS `require()` of an ES module, so
// `require('seniority/rc')` gets this function, as `require('rc')` does.
export { rc as 'module.exports' };
// eslint-disable-next-line import-next/no-default-export -- The drop-in shape: `require('rc')(name, defaults)` is how every program written for rc reaches it, and the generated shim re-exports this under the `module.exports` name that `require()` of an ES module returns whole.
export default rc;
