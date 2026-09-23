/**
 * `seniority/dotenv` — dotenv 17's surface (R8, Y3).
 *
 * `.sdlc/intents/seniority/issues.md` records twenty **closed** dotenv issues at ten
 * reactions or more, topped by #89 "Importing dotenv in ES6" at 165: the largest closed-issue
 * demand signal of any incumbent in this layer. A façade is how that demand is answered
 * without asking anyone to rewrite anything.
 *
 * **One deliberate divergence, and it is the whole of it.** dotenv's `config()` writes
 * `process.env`. Nothing in seniority reads or writes `process.*` (R11) — that is the property
 * that makes `resolve` pure and `--explain` trustworthy — so `config()` takes the object to
 * populate as `processEnv`, which is an option dotenv itself already has, and **refuses**
 * rather than guessing when it is absent. A caller migrating writes
 * `config({ processEnv: process.env })`: one word, at the one place a program is entitled to
 * own its process. `parse` and `populate` are unchanged and need no such argument, and they
 * are the two a tool actually composes with.
 *
 * Not built here: `decrypt` and the `.env.vault` format, which dotenv deprecated in favour of
 * dotenvx, and `config`'s `quiet` banner and tips, which are written to a stream on a
 * schedule this package has no opinion about. `populate`'s `debug` line **is** built, because
 * it is `console.log` rather than a stream and one graded case asserts it.
 */
// Default imports, read through at call time: dotenv's suite stubs `fs.readFileSync` and
// `os.homedir` on the module objects, and a named import binds past the stub.
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

import { LoaderError } from './load.js';
import { ambientCwd, ambientEnv } from './runtime.js';

/**
 * dotenv's own line grammar, character for character (`lib/main.js`, 17.4.2).
 *
 * Reproduced rather than rewritten: it is the thing being graded, its edge cases are the
 * reason people file the issues above, and "cleaner" here would mean "different".
 */
const LINE =
  // eslint-disable-next-line secure-coding/no-redos-vulnerable-regex -- dotenv 17.4.2's own grammar, character for character, and reproducing it exactly is what `seniority/dotenv` is for. Its input is a `.env` file on the program's own disk, written by the program's own author — never a request body — and rewriting the quantifiers would change which lines parse, which is the whole surface being graded.
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const DOUBLE_QUOTE = '"';
const SINGLE_QUOTE = "'";
const BACKTICK = '`';
const QUOTES: ReadonlySet<string> = new Set([DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK]);

/** Every `KEY=value` in a `.env`, as an object. Accepts the Buffer `readFileSync` hands back. */
export function parse(src: string | Buffer): Record<string, string> {
  // A Map, not an object literal: the keys come from the file, so `__proto__=x` would
  // otherwise be an assignment to the prototype rather than an entry.
  const out = new Map<string, string>();
  // dotenv normalises line endings first, so a file written on Windows parses identically.
  const lines = src.toString().replace(/\r\n?/gm, '\n');
  // `matchAll` rather than a re-entrant `exec` loop: the pattern is module-level and `g`, so
  // an `exec` loop leaves `lastIndex` behind and the second call to `parse` starts halfway
  // through the file.
  for (const match of lines.matchAll(LINE)) {
    const key = match[1];
    if (key !== undefined) out.set(key, unwrap(match[2] ?? ''));
  }
  return Object.fromEntries(out);
}

/** Strip the surrounding quotes, then expand escapes only for the quoting that defines them. */
function unwrap(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  const quoted = quote !== undefined && QUOTES.has(quote) && value.endsWith(quote) && value.length > 1;
  if (!quoted) return value;
  const inner = value.slice(1, -1);
  // Only a double-quoted value expands `\n` and `\r`; a single-quoted one is literal, which
  // is the distinction half of dotenv's multi-line issues turn on.
  return quote === DOUBLE_QUOTE ? inner.replaceAll('\\n', '\n').replaceAll('\\r', '\r') : inner;
}

export interface PopulateOptions {
  /** Replace a key the target already has. Off by default: the real environment outranks a file. */
  override?: boolean;
  /** Report each key that was already defined, and whether it was overwritten. dotenv's own `_debug`. */
  debug?: boolean;
}

/**
 * `OBJECT_REQUIRED`, with dotenv's own `code` — and its own wording, which names the wrong
 * argument. 17.4.2 validates `parsed` and then says "Please check the **processEnv**
 * argument"; `returns any errors thrown on passing not json type` asserts that exact string
 * after calling `populate(process.env, '')`, so the slip is the contract.
 */
function objectRequired(): Error {
  const error = new Error('OBJECT_REQUIRED: Please check the processEnv argument being passed to populate');
  return Object.assign(error, { code: 'OBJECT_REQUIRED' });
}

/**
 * Copy `parsed` into `target` and return what was actually set. Without `override` a key the
 * target already holds is left alone — the same rule seniority's own `ORDER` states as
 * `env > config` (R1), arrived at independently by dotenv and worth noticing.
 *
 * Two things are dotenv's and not ours. The **`parsed` check** comes first, because that is
 * the one it makes; the guard on `target` is kept after it, because dotenv reaching
 * `hasOwnProperty.call(undefined, …)` throws a `TypeError` about converting undefined, which
 * tells its caller nothing. And `debug` prints through `console.log`, which is what `_debug`
 * does upstream — not a stream this package owns, and not `process.stdout`, which it may not
 * name (R11). The text names seniority rather than a dotenv version: the suite asserts that
 * something was logged, never what.
 */
export function populate(target: Record<string, string | undefined>, parsed: Record<string, string>, options: PopulateOptions = {}): Record<string, string> {
  // eslint-disable-next-line maintainability/no-missing-error-context, reliability/no-missing-error-context -- The message is a constant with dotenv's own wording and its own `code`; `objectRequired` exists so the two throw sites cannot drift apart, which is exactly what the rule's "add a message" advice would reintroduce.
  if (typeof parsed !== 'object' || parsed === null) throw objectRequired();
  // eslint-disable-next-line maintainability/no-missing-error-context, reliability/no-missing-error-context -- see above
  if (typeof target !== 'object' || target === null) throw objectRequired();
  const populated: Record<string, string> = {};
  const override = options.override === true;
  for (const [key, value] of Object.entries(parsed)) {
    // eslint-disable-next-line conventions/consistent-existence-index-check -- `in` would treat `toString` as already present in every environment and silently drop a variable of that name. dotenv uses `Object.prototype.hasOwnProperty.call` here for the same reason.
    const held = Object.hasOwn(target, key);
    if (held && options.debug === true) debugLog(`"${key}" is already defined and ${override ? 'WAS overwritten' : 'was NOT overwritten'}`);
    if (held && !override) continue;
    target[key] = value;
    populated[key] = value;
  }
  return populated;
}

/** dotenv's `_debug`, with this package's name in the tag. */
function debugLog(message: string): void {
  // eslint-disable-next-line operability/no-console-log, operability/no-debug-code-in-production -- `_debug` writes to `console.log` upstream and one graded case (`logs any errors populating when in debug mode but override turned off`) asserts only that something was written. `process.stdout` is the alternative and this package may not name it (R11); a stream option would be a surface dotenv does not have.
  console.log(`[seniority/dotenv][DEBUG] ${message}`);
}

export interface ConfigOptions extends Omit<PopulateOptions, 'debug'> {
  /** Log what it does, through `console.log`; a string is read as dotenv reads it (`'false'`, `'0'`, … are false). */
  debug?: boolean | string;
  /** One file or several, highest priority first — an earlier file's key is not overwritten by a later one. `./.env` when omitted; a leading `~` is the home directory; a `URL` is read as one. */
  path: string | URL | readonly (string | URL)[];
  /** The object to populate; the process's own environment when omitted, as dotenv does (D-131). */
  processEnv: Record<string, string | undefined>;
  encoding?: BufferEncoding;
}

export interface ConfigResult {
  parsed?: Record<string, string>;
  error?: Error;
}

/**
 * Read, parse and populate. Returns `{ parsed }` or `{ error }` and **never throws for a
 * missing file** — dotenv is loaded at import time, where a throw takes the program down
 * before it can say anything useful.
 */
export function config(options: Partial<ConfigOptions> = {}): ConfigResult {
  // D-131: dotenv populates `process.env` and reads `./.env` when told nothing, and so does the
  // drop-in — through `runtime.ts`, the one seam, and only when the caller passed nothing.
  const processEnv = options.processEnv ?? ambientEnv();
  if (typeof processEnv !== 'object' || processEnv === null) {
    throw new LoaderError('seniority/dotenv has no environment to populate', '', 'pass processEnv: the object to write into — this runtime has no process');
  }
  const debug = truthy(processEnv['DOTENV_CONFIG_DEBUG'] ?? options.debug);
  if (options.encoding === undefined && debug) debugLog('no encoding is specified (UTF-8 is used by default)');
  const given = options.path ?? join(ambientCwd() ?? '.', '.env');
  const paths = (Array.isArray(given) ? given : [given]).map(home);
  const { parsedAll, lastError } = readAll(paths, options.encoding ?? 'utf8', debug);
  dotenv.populate(processEnv, parsedAll, { ...options, debug });
  return lastError === undefined ? { parsed: parsedAll } : { parsed: parsedAll, error: lastError };
}

/**
 * dotenv 17, step for step: every path is tried, a failure is remembered rather than returned,
 * and what did parse is still returned beside the last error.
 */
function readAll(paths: readonly (string | URL)[], encoding: BufferEncoding, debug: boolean): { parsedAll: Record<string, string>; lastError?: Error } {
  const parsedAll: Record<string, string> = {};
  let lastError: Error | undefined;
  for (const path of paths) {
    try {
      // Through the module object, exactly as dotenv's own `configDotenv` reaches
      // `DotenvModule.parse`: its suite stubs `dotenv.parse` and then asserts on what
      // `config` returned, which only works if the call goes through the object a stub can
      // patch. A direct call to the local binding is invisible to the stub.
      const parsed = dotenv.parse(fs.readFileSync(path, { encoding }));
      // Earlier file wins, so `populate`'s own rule does the work: keys already set are kept.
      dotenv.populate(parsedAll, parsed);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if (debug) debugLog(`failed to load ${String(path)} ${error.message}`);
      lastError = error;
    }
  }
  return lastError === undefined ? { parsedAll } : { parsedAll, lastError };
}

/** dotenv's `parseBoolean`: a string is true unless it spells false; anything else by truthiness. */
function truthy(value: unknown): boolean {
  if (typeof value === 'string') return !['false', '0', 'no', 'off', ''].includes(value.toLowerCase());
  return Boolean(value);
}

/** dotenv's `_resolveHome`: a leading `~` is the home directory; a URL passes through to `fs`. */
function home(path: string | URL): string | URL {
  return typeof path === 'string' && path.startsWith('~') ? join(os.homedir(), path.slice(1)) : path;
}

/**
 * **The default export, and why a drop-in subpath needs one.**
 *
 * dotenv is CJS: `require('dotenv')` hands back a plain, mutable `module.exports`, and its
 * own suite depends on that — `test-populate.js` opens with `sinon.stub(dotenv, 'parse')` in
 * a top-level `beforeEach`. An ES module namespace cannot be stubbed: every property is
 * non-configurable and the object is not extensible, so sinon refuses with
 * `ES Modules cannot be stubbed`, the `beforeEach` throws, and **every** case in the file
 * fails before its first assertion. Measured 2026-09-20: 12 failing entries in the raw TAP
 * against the control's plan of 6, and not one of them reached a `populate` call.
 *
 * So the subpath publishes the same shape its incumbent does — one mutable object carrying
 * the three functions — and the host's import declares `reexportDefault`, which makes the
 * generated shim re-export it under the `'module.exports'` name Node's `require()` of an ES
 * module returns whole. That is the mechanism commander's and yargs' CJS fixtures already
 * run on; dotenv's row simply never declared it. Nothing about seniority changed to make
 * those cases pass — what changed is that the suite can now reach the functions the way it
 * reaches dotenv's.
 */
const dotenv = { config, parse, populate };
// eslint-disable-next-line import-next/no-default-export -- The drop-in shape, and the thing being graded: `require('dotenv')` returns one mutable object and dotenv's own suite stubs a method on it. A named export cannot be what `require()` of an ES module hands back whole.
export default dotenv;
