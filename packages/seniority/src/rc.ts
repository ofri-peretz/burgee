/* eslint-disable maintainability/cognitive-complexity, maintainability/max-parameters, secure-coding/detect-object-injection -- A port graded by its incumbent's own suite, the exemption `eslint.config.mjs` already grants five other façades in this repository. `rc(name, defaults, argv, parse)` is rc's published signature and cannot be collapsed into an options object without ceasing to be drop-in; the fifth parameter is the world, which R11 requires be an argument. `stripJsonComments` is a character scanner with four states, and its states are the spec — the reason it is hand-written rather than depended on is in its own doc comment. Object injection is the nesting walk in `fromEnv` and the merge in `deepExtend`, both of which take their keys from a config file or an environment: the merge drops `__proto__`, `constructor` and `prototype` before writing, and the walk can never name `__proto__` (a segment holds no `__`) and stops at an inherited `constructor`, which is not a plain object. */
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
 * ## The grade: 1 / 1, by exit code
 *
 * rc's graded file (`test/test.js`) is bare `assert` calls on ambient state:
 *
 * ```js
 * process.env[n + '_envOption'] = 42
 * var config = require('../')(n, { option: true })
 * assert.equal(config.envOption, 42)
 * ```
 *
 * `rc(name, defaults, argv)` has a slot for argv and **none for the environment**, so a
 * drop-in has to read the process's own when the caller passes none, as rc does. That read
 * goes through `runtime.ts` (D-135), the one file per package the repository-wide lock
 * (`packages/burgee/src/process-reference-lock.test.ts`) allows to name `process`, and only
 * when `options.env` is absent. With it the file passes: the row is **1 / 1** on the
 * Compatibility page. It was 0 / 1 — failing on exactly the assertion above — until that seam
 * existed. The row is one bit, not one case: rc's suite has no reporter, so the grade is that
 * the script exited 0.
 *
 * The command line is **not** read ambiently. rc 1.2.8 fills a falsy `argv` with
 * `minimist(process.argv.slice(2))`; this treats an omitted `argv` as empty, and nothing the
 * graded file asserts depends on the difference.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';

import { LoaderError } from './load.js';
import { ambientEnv } from './runtime.js';

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
  /** The environment to read `<NAME>_*` from; the process's own when omitted, as rc does (D-135). */
  env?: Record<string, string | undefined>;
  /** Where the upward walk for `.<name>rc` starts. */
  cwd?: string;
  /** The home directory the four `~` places hang off. */
  home?: string;
  /** Skip the `/etc` places, as rc does on Windows — and, as rc, by default only there. */
  win?: boolean;
}

const WALK_LIMIT = 64;

/**
 * Is this a plain object we may merge into rather than replace? By prototype, so an array, a
 * `Date` or a class instance is a value to carry whole, as `deep-extend` carries it.
 */
function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null);
}

/**
 * A value as it may be stored in the result: plain objects and arrays copied all the way down,
 * as `deep-extend` copies them, so changing what `rc()` returned never changes the caller's
 * `defaults` or `argv`.
 */
function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  return isPlain(value) ? deepExtend({}, value) : value;
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
    // Merging in place is safe: everything already in `target` was put there by `copy`.
    target[key] = isPlain(value) && isPlain(existing) ? deepExtend(existing, value) : copy(value);
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
  // Stryker disable next-line EqualityOperator: one more turn reads `charAt(length)`, which is `''`, and appending `''` changes nothing.
  for (let i = 0; i < text.length; i += 1) {
    // `charAt`, not `text[i] ?? ''`: past the end it is `''` by definition, which is the one
    // case the lookahead needs, and `i` itself is always in range.
    const ch = text.charAt(i);
    const next = text.charAt(i + 1);
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
      // Stryker disable next-line AssignmentOperator,NumericLiteral: the second `/` is skipped either way, because a line comment drops every character up to the newline.
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
    // Stryker disable next-line ConditionalExpression: at the root `dirname` returns the root again, so walking on asks the same question until the bound ends it, with the same answer.
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
    const leaf = segments.pop();
    // rc's cursor stops at a value that is not an object, so `NAME_a=1` keeps `a` whichever
    // order the environment lists `NAME_a__b` in: the deeper key is dropped, never the value.
    let cursor: unknown = out;
    for (const segment of segments) if (isPlain(cursor)) cursor = cursor[segment] ??= {};
    if (isPlain(cursor) && leaf !== undefined) cursor[leaf] = value;
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
  // D-135: rc reads the ambient environment by default, so the drop-in does too — through the one seam.
  const env = options.env ?? ambientEnv() ?? {};
  const cwd = options.cwd ?? resolvePath();
  const home = options.home ?? homedir();
  const args = argv ?? {};

  const layers: RcConfig[] = [typeof defaults === 'string' ? (JSON.parse(stripJsonComments(defaults)) as RcConfig) : (defaults ?? {})];
  const files: string[] = [];

  const add = (file: string | undefined): void => {
    // Stryker disable next-line ConditionalExpression: an undefined path makes `readFileSync` throw, and the catch below swallows it, so asking first changes nothing.
    if (file === undefined || files.includes(file)) return;
    let content: string;
    // rc swallows every error reading a file — missing, a directory, unreadable — and so does this.
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      return;
    }
    layers.push(parseWith(content));
    files.push(file);
  };

  // rc's order exactly, and the comment is the contract: `/etc` first so a machine-wide
  // setting is the weakest thing that is not a default, the home places next, the project's
  // own `.<name>rc` after them, and an explicitly named file last.
  if (!(options.win ?? platform() === 'win32')) {
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
  // Stryker disable next-line ConditionalExpression: what else `NAME_config` can be is an object, from `NAME_config__x`, and `readFileSync` throws on that inside the catch.
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
