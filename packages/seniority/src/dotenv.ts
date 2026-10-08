/**
 * `seniority/dotenv` — dotenv 18's surface (R8, Y3), graded against dotenv 18.0.6's own suite.
 *
 * `.sdlc/intents/seniority/issues.md` records twenty **closed** dotenv issues at ten
 * reactions or more, topped by #89 "Importing dotenv in ES6" at 165: the largest closed-issue
 * demand signal of any incumbent in this layer. A façade is how that demand is answered
 * without asking anyone to rewrite anything.
 *
 * `config()` behaves as dotenv's does, defaults included: it populates the process's own
 * environment and reads `./.env` when told neither, takes its defaults from `DOTENV_*` (and the
 * older `DOTENV_CONFIG_*`) variables, and reports what it injected on `console.error`. The
 * process is reached through `runtime.ts` and nowhere else (D-135), and every default is an
 * argument first: `config({ processEnv, path })` never touches the process at all except to
 * read the `DOTENV_*` defaults, which an explicit option outranks.
 *
 * Not here because dotenv 18 is not either: `decrypt`, `.env.vault`, `DOTENV_KEY` and the
 * rotating log-line tips. dotenv 18.0.0 deleted all four (D-20261001-seniority-dotenv-18). The
 * `dotenv run` command line is `seniority/dotenv/cli`, and `import 'dotenv/config'` is
 * `seniority/dotenv/config`.
 */
// Default imports, read through at call time: dotenv's suite stubs `fs.readFileSync`,
// `os.homedir` and `path.relative` on the module objects, and a named import binds past the stub.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

import { optionsFromEnv, truthy } from './dotenv-options.js';
import { parseFast } from './dotenv-scan.js';
import { LoaderError } from './load.js';
import { ambientCwd, ambientEnv } from './runtime.js';

/**
 * dotenv's own line grammar, character for character (`lib/main.js`, `parseRegex`).
 *
 * Reproduced rather than rewritten: it is the thing being graded, its edge cases are the
 * reason people file the issues above, and "cleaner" here would mean "different".
 */
const LINE =
   
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const DOUBLE_QUOTE = '"';

export interface ParseOptions {
  /** Use the character scanner (dotenv's `{ fast: true }`) instead of the regular expression; read as dotenv reads a boolean. */
  fast?: boolean | string | undefined;
}

/** Every `KEY=value` in a `.env`, as an object. Accepts the Buffer `readFileSync` hands back. */
export function parse(src: string | Buffer, options?: ParseOptions): Record<string, string> {
  if (options !== undefined && truthy(options.fast)) return parseFast(src);
  // A Map, not an object literal: the keys come from the file, so `__proto__=x` would
  // otherwise be an assignment to the prototype rather than an entry.
  const out = new Map<string, string>();
  // dotenv normalises line endings first, so a file written on Windows parses identically.
  const lines = src.toString().replace(/\r\n?/gm, '\n');
  // `matchAll` rather than a re-entrant `exec` loop: the pattern is module-level and `g`, so
  // an `exec` loop leaves `lastIndex` behind and the second call to `parse` starts halfway
  // through the file.
  // Group 1 is not optional in `LINE`, so every match carries a key; group 2 is, so a bare
  // `KEY=` at the end of the file has no value to unwrap.
  for (const match of lines.matchAll(LINE)) out.set(match[1] as string, unwrap(match[2] ?? ''));
  return Object.fromEntries(out);
}

/**
 * dotenv's own three steps, as it writes them: trim, strip a matching pair of quotes, and
 * expand `\n` and `\r` when the value **opened** with a double quote — whether or not that
 * quote closed. dotenv 18's suite pins the unclosed case (`KEY="line one\nline two` gives a
 * real newline, issue #1043). The strip is upstream's `m`-flagged pattern, and the
 * flag is observable: `$` matches before a U+2028, so a line holding one strips differently
 * (pinned in `dotenv-scan.test.ts`).
 */
function unwrap(raw: string): string {
  const value = raw.trim();
  const unquoted = value.replace(/^(['"`])([\s\S]*)\1$/gm, '$2');
  // A single-quoted or backticked value is literal, which is the distinction half of dotenv's
  // multi-line issues turn on.
  return value.startsWith(DOUBLE_QUOTE) ? unquoted.replaceAll('\\n', '\n').replaceAll('\\r', '\r') : unquoted;
}

export interface PopulateOptions {
  /** Replace a key the target already has. Off by default: the real environment outranks a file. */
  override?: boolean;
  /** Report each key that was already defined, and whether it was overwritten. dotenv's own `_debug`. */
  debug?: boolean;
}

/**
 * `OBJECT_REQUIRED`, with dotenv's own `code` and its own wording — which names `processEnv`
 * whichever argument was wrong, and a case asserts that exact string.
 */
function objectRequired(): Error {
  const error = new Error('OBJECT_REQUIRED: Please check the processEnv argument being passed to populate');
  return Object.assign(error, { code: 'OBJECT_REQUIRED' });
}

/**
 * Copy `parsed` into `target` and return what was actually set. Without `override` a key the
 * target already holds is left alone — the same rule seniority's own `ORDER` states as
 * `env > config` (R1), arrived at independently by dotenv and worth noticing. Either argument
 * that is not an object is `OBJECT_REQUIRED`, as dotenv 18 checks both before it reads either.
 */
export function populate(target: Record<string, string | undefined>, parsed: Record<string, string>, options: PopulateOptions = {}): Record<string, string> {
   
  if (typeof target !== 'object' || target === null || typeof parsed !== 'object' || parsed === null) throw objectRequired();
  const populated: Record<string, string> = {};
  // `parseBoolean`, as dotenv 18.0.6 does (#1069): `config` hands its options through
  // unparsed, so `{ override: 'false' }` from a config file or a flag is off, not truthy.
  const override = truthy(options.override);
  const debug = truthy(options.debug);
  for (const [key, value] of Object.entries(parsed)) {
     
    const held = Object.hasOwn(target, key);
    if (held && debug) debugLog(`"${key}" is already defined and ${override ? 'WAS overwritten' : 'was NOT overwritten'}`);
    if (held && !override) continue;
    target[key] = value;
    populated[key] = value;
  }
  return populated;
}

/** dotenv's `_debug`, to the byte: `console.log`, behind its `┆` mark. */
function debugLog(message: string): void {
   
  console.log(`┆ ${message}`);
}

/** dotenv's `_log`: the one line `config` reports, on `console.error`, behind its `◇` mark. */
function infoLog(message: string): void {
  console.error(`◇ ${message}`);
}

export interface ConfigOptions extends Omit<PopulateOptions, 'debug' | 'override'> {
  /** Log what it does, through `console.log`; a string is read as dotenv reads it (`'false'`, `'0'`, … are false). */
  debug?: boolean | string;
  /** Replace keys the environment already has. */
  override?: boolean | string;
  /** Suppress the `injected env` line. Off by default, as in dotenv. */
  quiet?: boolean | string | undefined;
  /** Parse with the character scanner. */
  fast?: boolean | string;
  /** One file or several, highest priority first — an earlier file's key is not overwritten by a later one. `./.env` when omitted; a leading `~` is the home directory; a `URL` is read as one. */
  path: string | URL | readonly (string | URL)[];
  /** The object to populate; the process's own environment when omitted, as dotenv does (D-135). */
  processEnv: Record<string, string | undefined>;
  encoding?: BufferEncoding;
}

export interface ConfigResult {
  parsed?: Record<string, string>;
  error?: Error;
}

// dotenv 18's own type names (`lib/main.d.ts`), so `import type { DotenvConfigOptions } from
// 'dotenv'` moves with the import line instead of being refused by `burgee migrate`.
export type DotenvConfigOptions = Partial<ConfigOptions>;
export type DotenvConfigOutput = ConfigResult;
export type DotenvParseOptions = ParseOptions;
export type DotenvParseOutput = Record<string, string>;
export type DotenvPopulateInput = Record<string, string | undefined>;
export type DotenvPopulateOptions = PopulateOptions;
export type DotenvPopulateOutput = Record<string, string>;

/**
 * Read, parse and populate. Returns `{ parsed }`, or `{ parsed, error }` with the last error,
 * and **never throws for a missing file** — dotenv is loaded at import time, where a throw
 * takes the program down before it can say anything useful.
 */
export function configDotenv(given: Partial<ConfigOptions> = {}): ConfigResult {
  // The environment's defaults first and the caller's options over them, as dotenv merges.
  const options: Partial<ConfigOptions> = { ...(optionsFromEnv() as Partial<ConfigOptions>), ...given };
  // D-135: dotenv populates `process.env` and reads `./.env` when told nothing, and so does the
  // drop-in — through `runtime.ts`, the one seam, and only when the caller passed nothing.
  const processEnv = options.processEnv ?? ambientEnv();
  if (typeof processEnv !== 'object' || processEnv === null) {
    throw new LoaderError('seniority/dotenv has no environment to populate', '', 'pass processEnv: the object to write into — this runtime has no process');
  }
  const debug = truthy(options.debug);
  if (!options.encoding && debug) debugLog('no encoding is specified (UTF-8 is used by default)');
  const cwd = ambientCwd() ?? '.';
  // Truthiness, not presence, as upstream tests it: an empty `DOTENV_PATH` means the default.
  const wanted = options.path ? options.path : path.resolve(cwd, '.env');
  const paths = (Array.isArray(wanted) ? wanted : [wanted]).map(home);

  const { parsedAll, lastError } = readAll(paths, options, debug);
  const populated = dotenv.populate(processEnv, parsedAll, options as PopulateOptions);

  // Read after the files are loaded, so a `DOTENV_QUIET` in the `.env` itself counts — unless
  // the caller or the starting environment already said, `false` included.
  const quiet = truthy(Object.hasOwn(options, 'quiet') ? options.quiet : optionsFromEnv(processEnv).quiet);
  let error = lastError;
  if (debug || !quiet) {
    const shortPaths: string[] = [];
    for (const filePath of paths) {
      try {
        shortPaths.push(path.relative(cwd, filePath instanceof URL ? url.fileURLToPath(filePath) : filePath));
      } catch (cause) {
        error = asError(cause);
        if (debug) debugLog(`failed to load ${String(filePath)} ${error.message}`);
      }
    }
    infoLog(`injected env (${String(Object.keys(populated).length)}) from ${shortPaths.join(',')}`);
  }
  return error === undefined ? { parsed: parsedAll } : { parsed: parsedAll, error };
}

/** dotenv's `config`: `configDotenv`, through the module object a stub can patch. */
export function config(options?: Partial<ConfigOptions>): ConfigResult {
  return dotenv.configDotenv(options);
}

/**
 * dotenv, step for step: every path is tried, a failure is remembered rather than returned,
 * and what did parse is still returned beside the last error. Each file is populated into the
 * running total with the caller's own options, so `override` lets a later file win and `debug`
 * reports the collision.
 */
function readAll(paths: readonly (string | URL)[], options: Partial<ConfigOptions>, debug: boolean): { parsedAll: Record<string, string>; lastError?: Error } {
  const parsedAll: Record<string, string> = {};
  let lastError: Error | undefined;
  for (const filePath of paths) {
    try {
      // Through the module object, exactly as dotenv's own `configDotenv` reaches
      // `DotenvModule.parse`: its suite stubs `dotenv.parse` and then asserts on what
      // `config` returned, which only works if the call goes through the object a stub can
      // patch. A direct call to the local binding is invisible to the stub.
      const parsed = dotenv.parse(fs.readFileSync(filePath, { encoding: options.encoding ? options.encoding : 'utf8' }), { fast: options.fast });
      dotenv.populate(parsedAll, parsed, options as PopulateOptions);
    } catch (cause) {
      lastError = asError(cause);
      if (debug) debugLog(`failed to load ${String(filePath)} ${lastError.message}`);
    }
  }
  return lastError === undefined ? { parsedAll } : { parsedAll, lastError };
}

const asError = (cause: unknown): Error => (cause instanceof Error ? cause : new Error(String(cause)));

/** dotenv's `_resolveHome`: a leading `~` is the home directory; a URL passes through to `fs`. */
function home(filePath: string | URL): string | URL {
  return typeof filePath === 'string' && filePath.startsWith('~') ? path.join(os.homedir(), filePath.slice(1)) : filePath;
}

/**
 * **The default export, and why a drop-in subpath needs one.**
 *
 * dotenv is CJS: `require('dotenv')` hands back a plain, mutable `module.exports`, and its
 * own suite depends on that — `test-populate.js` opens with `sinon.stub(dotenv, 'parse')` in
 * a top-level `beforeEach`. An ES module namespace cannot be stubbed: every property is
 * non-configurable and the object is not extensible, so sinon refuses with
 * `ES Modules cannot be stubbed`, the `beforeEach` throws, and **every** case in the file
 * fails before its first assertion.
 *
 * So the subpath publishes the same shape its incumbent does — one mutable object carrying
 * the four functions — under the `'module.exports'` name Node's `require()` of an ES module
 * returns whole. Every internal call goes through it, as dotenv's go through `DotenvModule`.
 */
const dotenv = { config, configDotenv, parse, populate };
// `'module.exports'` is what Node hands a CommonJS `require()` of an ES module, so
// `require('seniority/dotenv')` gets this object — mutable, as a test that stubs `config` needs, as `require('dotenv')` does.
export { dotenv as 'module.exports' };
// eslint-disable-next-line import-next/no-default-export -- The drop-in shape, and the thing being graded: `require('dotenv')` returns one mutable object and dotenv's own suite stubs a method on it. A named export cannot be what `require()` of an ES module hands back whole.
export default dotenv;
