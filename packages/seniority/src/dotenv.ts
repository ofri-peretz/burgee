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
 * dotenvx, and `config`'s `debug`/`quiet` logging, which writes to a stream this package does
 * not own either.
 */
import { readFileSync } from 'node:fs';

import { LoaderError } from './load.js';

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
}

/**
 * Copy `parsed` into `target`. Without `override` a key the target already holds is left
 * alone — the same rule seniority's own `ORDER` states as `env > config` (R1), arrived at
 * independently by dotenv and worth noticing.
 */
export function populate(target: Record<string, string | undefined>, parsed: Record<string, string>, options: PopulateOptions = {}): void {
  if (typeof target !== 'object' || target === null) throw new Error('OBJECT_REQUIRED: Please check the processEnv argument being passed to populate');
  for (const [key, value] of Object.entries(parsed)) {
    // eslint-disable-next-line conventions/consistent-existence-index-check -- `in` would treat `toString` as already present in every environment and silently drop a variable of that name. dotenv uses `Object.prototype.hasOwnProperty.call` here for the same reason.
    if (Object.hasOwn(target, key) && options.override !== true) continue;
    target[key] = value;
  }
}

export interface ConfigOptions extends PopulateOptions {
  /** One file or several, highest priority first — an earlier file's key is not overwritten by a later one. */
  path: string | readonly string[];
  /** The object to populate. **Required**: see this file's header, and R11. */
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
export function config(options: ConfigOptions): ConfigResult {
  if (typeof options.processEnv !== 'object' || options.processEnv === null) {
    throw new LoaderError(
      'seniority/dotenv needs a `processEnv` to populate',
      '',
      'pass processEnv: process.env — nothing in seniority reads the process itself (R11), so the object to populate is an argument',
    );
  }
  const paths = typeof options.path === 'string' ? [options.path] : options.path;
  const parsedAll: Record<string, string> = {};
  for (const path of paths) {
    try {
      const parsed = parse(readFileSync(path, { encoding: options.encoding ?? 'utf8' }));
      // Earlier file wins, so `populate`'s own rule does the work: keys already set are kept.
      populate(parsedAll, parsed);
    } catch (cause) {
      return { error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
  }
  populate(options.processEnv, parsedAll, options);
  return { parsed: parsedAll };
}
