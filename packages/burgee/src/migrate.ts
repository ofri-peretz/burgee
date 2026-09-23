/**
 * `burgee migrate` — the mechanical path from commander or yargs to burgee.
 *
 * Every migration that actually happened shipped the codemod before the wave, not after
 * it (`.sdlc/research/migration-drivers.md`): `jest-codemods`, `pnpm import`,
 * `biome migrate eslint`. burgee already has the strongest possible version of the claim —
 * change one import and commander's own 1,360 tests still pass — and what it did not have
 * was the four-minute path from *could* to *did*.
 *
 * **Specifiers, not syntax trees (D-050).** The rewrite surface is a quoted string in five
 * known positions, so this needs no parser and therefore no runtime dependency (rule 2).
 * It is also two orders of magnitude cheaper than parse-edit-print, which is what makes
 * A10's budget — 1,000 files under 500 ms — a number rather than an adjective. The fast
 * choice and the zero-dependency choice are the same choice here.
 *
 * The cost of the narrow scan is paid visibly: a position this scan cannot classify is
 * **refused by file and line** and the whole file is left as it was (A4, A5, D-051). A
 * codemod that half-works fails later as a runtime error in someone else's CLI, and the
 * first thing they will blame is burgee.
 *
 * Nothing here is reachable from `import 'burgee'`: `cli.ts` loads it with a dynamic
 * import on the `migrate` path only, and `weight.test.ts` denies `migrate.js` to the root
 * entry by name so that cannot drift.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';

import { DROP_INS, GRADED, GRADED_VERSIONS, isLevel, type Row } from './compat.js';
import { ExitCode } from './exit-code.js';

/** The npm package a specifier names: `@scope/name/x` → `@scope/name`, `name/x` → `name`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

/**
 * A2, A12 — the whole mapping, as data, and none of it typed here.
 *
 * Every drop-in the oracle grades **level** with its incumbent (D-137): the incumbent's own
 * suite passes as many cases against the family's replacement as against the incumbent
 * itself, in the same harness. That is commander and yargs, and chalk, ora, string-width,
 * cross-spawn, signal-exit and the rest — `compat.ts` holds the list and a lock re-derives it
 * from `compat-oracle`. A drop-in that is not level yet is reported, never rewritten.
 *
 * Whole specifiers only. `burgee/commander` is not a key, which is what makes a second run
 * over an already-migrated tree a no-op and lets the command declare `effects: 'idempotent'`.
 * `yargs/yargs` is the one key the oracle does not name: yargs documents it as an entry,
 * and it is the same module as `yargs`.
 */
export const MAPPING: Readonly<Record<string, string>> = Object.fromEntries(
  DROP_INS.filter((d) => isLevel(d.host)).flatMap((d) => (d.from === 'yargs' ? [[d.from, d.to], ['yargs/yargs', d.to]] : [[d.from, d.to]])),
);

/** The packages a project depends on that this command rewrites (A1). */
export const HOSTS: readonly string[] = [...new Set(Object.keys(MAPPING).map(packageOf))];

/** Graded drop-ins that are not level yet: reported so a user knows the path exists, never rewritten (A12). */
const PARTIAL = DROP_INS.filter((d) => !isLevel(d.host));

/** The leading number of a version or a range — `^3.0.7` is 3, `>=18` is 18; `undefined` for `*` or a tag. */
export function majorOf(version: string): number | undefined {
  const digits = /\d+/.exec(version);
  return digits === null ? undefined : Number(digits[0]);
}

/** The `GRADED` key for an incumbent package — `@inquirer/core` is graded as `inquirer-core`. */
const HOST_OF = new Map(DROP_INS.map((d) => [packageOf(d.from), d.host]));

/**
 * Every name each target exports — values and types alike — so a rewrite that moves
 * `import { Argv } from 'yargs'` can first ask whether `burgee/yargs` has an `Argv`.
 *
 * A specifier-only rewrite (D-050) cannot tell a value from a type, and does not need to:
 * a name the target does not export breaks the build either way. This is data rather than
 * a lookup because the lookup is the TypeScript checker, which is the dependency this
 * command exists not to have; `facade-types.test.ts` holds the table equal to what the
 * checker sees in `dist/*.d.ts`, so it cannot drift from the façades it describes.
 */
export const FACADE_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  'bellpull/cross-spawn': [
    'ChildProcess',
    'Parsed',
    'SpawnOptions',
    'SpawnSyncReturns',
    '_enoent',
    'crossSpawn',
    'default',
    'module.exports',
    'parse',
    'spawn',
    'sync',
  ],
  'bellpull/node-which': [
    'NodeWhichOptions',
    'default',
    'module.exports',
  ],
  'burgee/commander': [
    'AddHelpTextContext',
    'AddHelpTextPosition',
    'Argument',
    'BurgeeParseOptions',
    'Command',
    'CommandOptions',
    'CommanderError',
    'DualOptions',
    'ErrorOptions',
    'ExecutableCommandOptions',
    'Help',
    'HelpConfiguration',
    'HelpContext',
    'HookEvent',
    'HookListener',
    'InvalidArgumentError',
    'InvalidOptionArgumentError',
    'Option',
    'OptionValueSource',
    'OptionValues',
    'OutputConfiguration',
    'OutputContext',
    'ParseOptions',
    'ParseOptionsResult',
    'createArgument',
    'createCommand',
    'createOption',
    'humanReadableArgName',
    'program',
    'useColor',
  ],
  'burgee/yargs': [
    'Arguments',
    'ArgumentsCamelCase',
    'Argv',
    'AsyncCompletionFunction',
    'BuilderArguments',
    'BuilderCallback',
    'Choices',
    'CommandBuilder',
    'CommandModule',
    'CompletionCallback',
    'Defined',
    'DetailedArguments',
    'FallbackCompletionFunction',
    'InferredOptionType',
    'InferredOptionTypeInner',
    'InferredOptionTypePrimitive',
    'InferredOptionTypes',
    'MiddlewareFunction',
    'Options',
    'ParseCallback',
    'ParsedCommand',
    'Parser',
    'ParserConfigurationOptions',
    'PlatformShim',
    'PositionalOptions',
    'PositionalOptionsType',
    'PromiseCompletionFunction',
    'RequireDirectoryOptions',
    'SyncCompletionFunction',
    'ToArray',
    'ToNumber',
    'ToString',
    'YError',
    'YargsInstance',
    'applyExtends',
    'argsert',
    'camelCase',
    'decamelize',
    'default',
    'hideBin',
    'isPromise',
    'isYargsInstance',
    'looksLikeNumber',
    'module.exports',
    'objFilter',
    'parseCommand',
    'platformShim',
  ],
  'burgee/yargs/helpers': [
    'Parser',
    'applyExtends',
    'hideBin',
  ],
  'burgee/yargs/parser': [
    'Arguments',
    'Configuration',
    'DetailedArguments',
    'Options',
    'Parser',
    'ParserMixin',
    'YargsParser',
    'camelCase',
    'decamelize',
    'default',
    'looksLikeNumber',
    'tokenizeArgString',
  ],
  'caique/inquirer': [
    'AbortPromptError',
    'CancelPromptError',
    'CancelablePromise',
    'Context',
    'ExitPromptError',
    'HookError',
    'Keybinding',
    'KeypressEvent',
    'PartialTheme',
    'Prompt',
    'Separator',
    'SetState',
    'Status',
    'Theme',
    'ValidationError',
    'ViewFunction',
    'createPrompt',
    'defaultTheme',
    'getDefaultKeybindings',
    'getDefaultTheme',
    'isBackspaceKey',
    'isDownKey',
    'isEnterKey',
    'isNumberKey',
    'isShiftKey',
    'isSpaceKey',
    'isTabKey',
    'isUpKey',
    'makeTheme',
    'useEffect',
    'useKeypress',
    'useMemo',
    'usePrefix',
    'useRef',
    'useState',
  ],
  'closeout/exit-hook': [
    'AsyncExitHookOptions',
    'ExitHookCallback',
    'Options',
    'asyncExitHook',
    'default',
    'gracefulExit',
  ],
  'closeout/restore-cursor': [
    'default',
  ],
  'closeout/signal-exit': [
    'load',
    'onExit',
    'signals',
    'unload',
  ],
  'closeout/signal-exit/signals': [
    'signals',
  ],
  'flagstaff/boxen': [
    'BoxenBorderStyle',
    'BoxenOptions',
    'Boxes',
    'CustomBorderStyle',
    'Options',
    'Spacing',
    '_borderStyles',
    'default',
  ],
  'flagstaff/cli-table3': [
    'Cell',
    'ColSpanCell',
    'RowSpanCell',
    'Table',
    'TableChars',
    'TableOptions',
    'TableStyle',
    'computeHeights',
    'computeWidths',
    'default',
    'hyperlink',
    'makeTableLayout',
    'mergeOptions',
    'module.exports',
    'pad',
    'strlen',
    'truncate',
    'wordWrap',
  ],
  'flagstaff/log-update': [
    'LogUpdate',
    'LogUpdateOptions',
    'LogUpdateStream',
    'Options',
    'createLogUpdate',
    'default',
    'logUpdateStderr',
  ],
  'flagstaff/ora': [
    'Affix',
    'Color',
    'Options',
    'Ora',
    'OraStream',
    'PersistOptions',
    'PrefixTextGenerator',
    'PromiseOptions',
    'Spinner',
    'SpinnerDefinition',
    'SuffixTextGenerator',
    'default',
    'oraPromise',
    'spinners',
  ],
  'linegauge': [
    'Options',
    'TruncateOptions',
    'WidthOptions',
    'WrapOptions',
    'default',
    'lineCount',
    'measure',
    'slice',
    'strip',
    'truncate',
    'widest',
    'width',
    'wrap',
  ],
  'linegauge/slice': [
    'default',
    'slice',
  ],
  'linegauge/strip': [
    'default',
    'strip',
  ],
  'linegauge/wrap': [
    'Options',
    'WrapOptions',
    'default',
    'visibleWidth',
    'wrap',
  ],
  'roundel/chalk': [
    'BackgroundColor',
    'BackgroundColorName',
    'Chalk',
    'ChalkInstance',
    'ChalkOptions',
    'Color',
    'ColorInfo',
    'ColorName',
    'ColorSupport',
    'ColorSupportLevel',
    'ForegroundColor',
    'ForegroundColorName',
    'ModifierName',
    'Modifiers',
    'Options',
    'UnderlineColorName',
    'backgroundColorNames',
    'chalkStderr',
    'colorNames',
    'default',
    'foregroundColorNames',
    'modifierNames',
    'supportsColor',
    'supportsColorStderr',
    'underlineColorNames',
  ],
  'seniority/lilconfig': [
    'AsyncSearcher',
    'LilconfigResult',
    'Loader',
    'LoaderSync',
    'Loaders',
    'LoadersSync',
    'Options',
    'OptionsSync',
    'SyncSearcher',
    'Transform',
    'TransformSync',
    'defaultLoaders',
    'defaultLoadersSync',
    'lilconfig',
    'lilconfigSync',
  ],
  'seniority/rc': [
    'RcConfig',
    'RcOptions',
    'RcParse',
    'default',
    'module.exports',
    'parse',
    'rc',
  ],
};

/**
 * Why a file was left untouched. Each is a named position, never a guess (A4).
 *
 * `unknown-export` is a named import the target does not export — rewriting it would turn a
 * working import into TS2305 or a `SyntaxError` at load, so the file stays as it was.
 *
 * `require-of-default` is a `require('chalk')` whose target is an ES module with a default
 * export. `require()` of an ES module returns its namespace, so `chalk.red` would be
 * `undefined` — measured on every family drop-in with a default, 2026-09-23. It moves once
 * the target also exports its default as `'module.exports'`, which is what Node hands a
 * CommonJS caller; until then the file stays on the incumbent, where it works.
 */
export type RefusalReason = 'deep-import' | 'non-literal-specifier' | 'unknown-export' | 'require-of-default';

/** Whether `require(to)` hands a CommonJS caller a namespace where the incumbent handed it the export itself. */
function requireGetsNamespace(to: string): boolean {
  const exported = FACADE_EXPORTS[to] ?? [];
  return exported.includes('default') && !exported.includes('module.exports');
}

export interface Refusal {
  /** Relative to the directory being migrated, with forward slashes on every platform. */
  file: string;
  line: number;
  /** The specifier as written, or `''` for a dynamic specifier that is not a literal. */
  specifier: string;
  reason: RefusalReason;
  /** For `unknown-export`: the names the target does not export. */
  names?: string[];
}

/**
 * A type-only import left on the incumbent because the façade does not export every name in
 * it. Types are erased, so the file's values still move to burgee and the program runs on it;
 * the types keep compiling against the incumbent's declarations, which is why the incumbent
 * is then not reported removable.
 */
export interface Kept {
  file: string;
  line: number;
  specifier: string;
  /** The names the façade does not export. */
  names: string[];
  /** The note a reader acts on. */
  note: string;
}

/** One rewritten specifier, for the per-mapping rollup the report prints. */
export interface Mapped {
  from: string;
  to: string;
  imports: number;
  files: number;
}

export interface Detection {
  /** Hosts named in `package.json`'s dependencies — declared. */
  declared: string[];
  /** Hosts a source file actually imports — used. These two disagree more often than not. */
  imported: string[];
}

/** An incumbent the project has on a different major from the one graded — left alone (A12). */
export interface OffMajor {
  from: string;
  /** The installed version, or the declared range when nothing is installed here. */
  found: string;
  graded: string;
}

/** A declared incumbent with a graded drop-in that is not level yet (A12). */
export interface NotLevel extends Row {
  from: string;
  to: string;
}

export interface MigrationReport {
  files: number;
  imports: number;
  mapped: Mapped[];
  refused: Refusal[];
  /** Type-only imports left pointing at the incumbent, each with the note that says why. */
  kept: Kept[];
  detected: Detection;
  /** `add`: the family packages the rewritten imports now name, which the project must depend on. */
  dependencies: { before: string[]; removable: string[]; after: number; add: string[] };
  graded: (Row & { host: string })[];
  /** Declared incumbents whose drop-in is graded but not level — left alone, with the grade that says why. */
  partial: NotLevel[];
  /** Incumbents on a major the oracle did not grade — left alone, never rewritten onto an API they do not use. */
  offMajor: OffMajor[];
  /** The install and uninstall to run next, for the package manager the lockfile names; `''` when there is none. */
  next: string;
  dryRun: boolean;
  /** N7 — an idempotent command says whether it changed anything; silence is what an agent misreads. */
  changed: boolean;
  /** A8 — `RUNTIME` when anything was refused, so an agent branches on the code. */
  exitCode: number;
}

/* ------------------------------------------------------------------ the scan */

interface Site {
  specifier: string;
  /** Offsets of the specifier's text, excluding the quotes. */
  start: number;
  end: number;
  line: number;
  /**
   * For `import … from` and `export … from`: the code tokens between the keyword and `from`
   * — the import clause, which is all `bindingsOf` needs. Absent for the other three positions.
   */
  clause?: string[];
  /** `require('x')`: CommonJS receives the target's whole namespace, not its default export. */
  require?: true;
}

interface Scan {
  sites: Site[];
  /** `import(x)` / `require(x)` where `x` is not a string literal — refused, never guessed. */
  nonLiteral: number[];
}

const WORD = /[A-Za-z0-9_$]/;

/** After these, a `/` divides; after anything else it opens a regular expression. */
const DIVIDES = new Set([')', ']', '}']);

function startsRegex(previous: string): boolean {
  if (previous === '') return true;
  if (DIVIDES.has(previous)) return false;
  return !WORD.test(previous.charAt(previous.length - 1));
}

/** Index just past the end of a `'…'` or `"…"`, honouring backslash escapes. */
function endOfString(source: string, open: number): number {
  const quote = source.charAt(open);
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === quote || c === '\n') return i + 1;
  }
  return source.length;
}

/** Index just past the end of a template literal, counting `${…}` nesting so a `}` inside it is not the end. */
function endOfTemplate(source: string, open: number): number {
  let depth = 0;
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '$' && source.charAt(i + 1) === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === '}' && depth > 0) {
      depth -= 1;
      continue;
    }
    if (c === '`' && depth === 0) return i + 1;
  }
  return source.length;
}

/** Index just past the end of a regular-expression literal, skipping character classes. */
function endOfRegex(source: string, open: number): number {
  let inClass = false;
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '[' || c === ']') {
      inClass = c === '[';
      continue;
    }
    if (c === '\n') return i;
    if (c === '/' && !inClass) return i + 1;
  }
  return source.length;
}

/** Newlines between two offsets, so a refusal can name a line without a second pass. */
function newlines(source: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i += 1) if (source.charAt(i) === '\n') count += 1;
  return count;
}

/**
 * A3 — the five positions, and only those: `import … from 'x'`, `import 'x'`,
 * `export … from 'x'`, `import('x')` and `require('x')`.
 *
 * Decided from the two tokens in front of the quote rather than from a pattern over the
 * line, which is what keeps `{ from: 'commander' }`, `const x = 'commander'` and
 * `log('commander')` out of it — the second named mutation in `migrate.test.ts`.
 */
function isSpecifier(previous: string, before: string): boolean {
  if (previous === 'from' || previous === 'import') return true;
  return previous === '(' && (before === 'import' || before === 'require');
}

/** Whitespace, `;` and both comment forms — everything the classifier never looks at. Returns `at` when there is none. */
function endOfTrivia(source: string, at: number): number {
  const c = source.charAt(at);
  if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ';') return at + 1;
  if (c !== '/') return at;
  const next = source.charAt(at + 1);
  if (next === '/') {
    const end = source.indexOf('\n', at);
    return end === -1 ? source.length : end;
  }
  if (next !== '*') return at;
  const end = source.indexOf('*/', at + 2);
  return end === -1 ? source.length : end + 2;
}

/** A literal to step over whole — string, template or regular expression — or `-1` when `at` starts none. */
function endOfLiteral(source: string, at: number, previous: string): number {
  const c = source.charAt(at);
  if (c === "'" || c === '"') return endOfString(source, at);
  if (c === '`') return endOfTemplate(source, at);
  if (c === '/' && startsRegex(previous)) return endOfRegex(source, at);
  return -1;
}

/** Index just past the identifier or number starting at `at`, or `at` when neither starts there. */
function endOfWord(source: string, at: number): number {
  let i = at;
  while (i < source.length && WORD.test(source.charAt(i))) i += 1;
  return i;
}

/** What a quoted literal is recorded as; anything else quoted is `lit`, which is never a specifier. */
const QUOTED = 'str';

/** The two code tokens behind the cursor, plus A4's open-call state. Two is all the classifier looks at. */
interface Tokens {
  previous: string;
  before: string;
  /** The two behind us were `import (` or `require (`, and what follows decides A4. */
  pending: boolean;
  /** Lines where a call was opened and what followed was not a string literal. */
  nonLiteral: number[];
  /**
   * The tokens since the last `import` or `export` keyword — the clause of the statement in
   * progress — or `undefined` once there is none. A clause never holds `(` or `=`, and the
   * token after its `from` is the specifier, so either closes it: `export function f(…)`
   * does not drag its body along.
   */
  clause: string[] | undefined;
}

/**
 * Record one code token.
 *
 * A4's refusal is decided here rather than at each call site: if a call was opened and the
 * thing inside it is not a string literal, the specifier is not one this scan can read, and
 * the file it is in will be left alone.
 */
function push(tokens: Tokens, text: string, line: number): void {
  if (tokens.pending && text !== QUOTED && text !== ')') tokens.nonLiteral.push(line);
  tokens.pending = text === '(' && (tokens.previous === 'import' || tokens.previous === 'require');
  if (text === 'import' || text === 'export') tokens.clause = [];
  else if (text === '(' || text === '=' || tokens.previous === 'from') tokens.clause = undefined;
  else tokens.clause?.push(text);
  tokens.before = tokens.previous;
  tokens.previous = text;
}

/** The specifier between the quotes at `open` and just before `close`, with its clause when it follows a `from`. */
function siteOf(source: string, at: { open: number; close: number; line: number }, tokens: Tokens): Site {
  const { open, close, line } = at;
  const site: Site = { specifier: source.slice(open + 1, close - 1), start: open + 1, end: close - 1, line };
  // The clause ends in the `from` just pushed; everything before it is the bindings.
  if (tokens.previous === 'from' && tokens.clause !== undefined) site.clause = tokens.clause.slice(0, -1);
  if (tokens.previous === '(' && tokens.before === 'require') site.require = true;
  return site;
}

/**
 * One linear pass over the text: comments, strings, templates and regular expressions are
 * skipped as the shapes they are, and every quoted literal is classified by the two code
 * tokens in front of it.
 *
 * It is a scan, not a parse. What it cannot classify it refuses (A4); what it can, it knows
 * exactly, because a module specifier is a string literal in one of five positions and
 * nothing else in the grammar looks like that.
 */
export function scan(source: string): Scan {
  const sites: Site[] = [];
  const tokens: Tokens = { previous: '', before: '', pending: false, nonLiteral: [], clause: undefined };
  let line = 1;
  let i = 0;

  while (i < source.length) {
    const trivia = endOfTrivia(source, i);
    if (trivia !== i) {
      line += newlines(source, i, trivia);
      i = trivia;
      continue;
    }
    const literal = endOfLiteral(source, i, tokens.previous);
    if (literal !== -1) {
      const c = source.charAt(i);
      const quoted = c === "'" || c === '"';
      if (quoted && isSpecifier(tokens.previous, tokens.before)) sites.push(siteOf(source, { open: i, close: literal, line }, tokens));
      push(tokens, quoted ? QUOTED : 'lit', line);
      line += newlines(source, i, literal);
      i = literal;
      continue;
    }
    const word = endOfWord(source, i);
    if (word !== i) {
      push(tokens, source.slice(i, word), line);
      i = word;
      continue;
    }
    push(tokens, source.charAt(i), line);
    i += 1;
  }
  return { sites, nonLiteral: tokens.nonLiteral };
}

/* ------------------------------------------------------- the rewrite of one file */

export interface Rewrite {
  source: string;
  mapped: { from: string; to: string }[];
  refused: Omit<Refusal, 'file'>[];
  kept: Omit<Kept, 'file'>[];
  /** Whether this file references a host at all. A file that does not is not "untouched", it is unrelated. */
  relevant: boolean;
}

/**
 * The host names as bytes, so the pre-filter below can run against a file that has not been
 * decoded yet. Both are pure ASCII, so a UTF-8 file contains the name iff its bytes do.
 */
const NEEDLE_BYTES = HOSTS.map((host) => Buffer.from(host));

/**
 * A file that names neither host anywhere cannot contain a specifier for one — and in a real
 * repository that is almost every file.
 *
 * `includes` is a `memmem`; `scan` is a character loop. It is not what makes the command
 * fast (the whole scan phase is 25 ms of a ~400 ms run over 1,000 files) — it is what keeps
 * the work proportional to the files that could matter rather than to the repository, and
 * on a `Buffer` it also skips decoding 3 MB of UTF-8 that nothing was going to read.
 */
export function mentionsAHost(source: string | Buffer): boolean {
  return typeof source === 'string' ? HOSTS.some((host) => source.includes(host)) : NEEDLE_BYTES.some((bytes) => source.includes(bytes));
}

/** A specifier that reaches inside a host the façade does not promise: `commander/lib/command.js` (A4). */
function isDeep(specifier: string): boolean {
  if (MAPPING[specifier] !== undefined) return false;
  return HOSTS.some((host) => specifier.startsWith(`${host}/`));
}

/**
 * The names an import or re-export clause asks the module for, and whether the whole
 * statement is type-only (`import type …`, `export type …`).
 *
 * Read off the tokens the scan already has: `{ a, type b, c as d }` asks for `a`, `b` and
 * `c`; a default or namespace binding asks for no name a façade could lack (`default` is
 * the factory, and `* as ns` is checked where it is used, which a scan cannot see). A name
 * written as a string (`{ 'a-b' as c }`) is left unverified rather than guessed at.
 */
export function bindingsOf(clause: readonly string[]): { typeOnly: boolean; names: string[] } {
  // `import type from 'x'` is a default binding named `type`, not a modifier.
  const typeOnly = clause[0] === 'type' && clause.length > 1;
  const open = clause.indexOf('{');
  const close = clause.indexOf('}', open);
  if (open === -1 || close === -1) return { typeOnly, names: [] };
  const names: string[] = [];
  let element: string[] = [];
  for (const token of [...clause.slice(open + 1, close), ',']) {
    if (token !== ',') {
      element.push(token);
      continue;
    }
    // `type x` / `type x as y`: the modifier. `type` alone, or `type as y`, is a binding named `type`.
    const modifier = element[0] === 'type' && element.length > 1 && element[1] !== 'as';
    const name = modifier ? element[1] : element[0];
    if (name !== undefined && name !== 'default' && name !== QUOTED && WORD.test(name.charAt(0))) names.push(name);
    element = [];
  }
  return { typeOnly, names };
}

/** The names in `site`'s clause that `to` does not export. Empty when there is no clause, or no table for `to`. */
function missingFrom(site: Site, to: string): { typeOnly: boolean; missing: string[] } {
  const exported = FACADE_EXPORTS[to];
  if (site.clause === undefined || exported === undefined) return { typeOnly: false, missing: [] };
  const { typeOnly, names } = bindingsOf(site.clause);
  return { typeOnly, missing: names.filter((name) => !exported.includes(name)) };
}

/** What one host site does: move, stay on the incumbent as a kept type import, or refuse the file. */
function classify(site: Site): 'moves' | 'unmapped' | Omit<Kept, 'file'> | Omit<Refusal, 'file'> {
  const to = MAPPING[site.specifier];
  if (to === undefined) return 'unmapped';
  if (site.require === true && requireGetsNamespace(to)) return { line: site.line, specifier: site.specifier, reason: 'require-of-default' };
  const { typeOnly, missing } = missingFrom(site, to);
  if (missing.length === 0) return 'moves';
  if (typeOnly) return { line: site.line, specifier: site.specifier, names: missing, note: `${to} does not export ${missing.join(', ')}; this type-only import stays on '${site.specifier}', so keep its types installed` };
  return { line: site.line, specifier: site.specifier, reason: 'unknown-export', names: missing };
}

/** No package skipped. */
const NONE: ReadonlySet<string> = new Set();

/**
 * A2/A5 — map every host specifier in one file, or map none of them.
 *
 * The edits are applied from the end backwards so earlier offsets stay valid, and the
 * source is returned unchanged the moment there is a refusal in it: the unit of success is
 * the file, so the worst case is *nothing changed here, and here is why* (D-051).
 */
export function rewriteSource(source: string, skip: ReadonlySet<string> = NONE): Rewrite {
  if (!mentionsAHost(source)) return { source, mapped: [], refused: [], kept: [], relevant: false };
  const { sites, nonLiteral } = scan(source);
  const hits = sites.filter((s) => !skip.has(packageOf(s.specifier)) && (MAPPING[s.specifier] !== undefined || isDeep(s.specifier)));
  if (hits.length === 0) return { source, mapped: [], refused: [], kept: [], relevant: false };

  // A name the façade lacks: a type-only statement stays on the incumbent (types are
  // erased, so the rest of the file can still move); anything else is refused, because
  // a value import of a missing name fails at load and a mixed one cannot be split by a scan.
  const kept: Omit<Kept, 'file'>[] = [];
  const unknown: Omit<Refusal, 'file'>[] = [];
  const moving: Site[] = [];
  for (const site of hits) {
    const verdict = classify(site);
    if (verdict === 'unmapped') continue;
    if (verdict === 'moves') moving.push(site);
    else if ('note' in verdict) kept.push(verdict);
    else unknown.push(verdict);
  }

  const refused: Omit<Refusal, 'file'>[] = [
    ...hits.filter((s) => isDeep(s.specifier)).map((s) => ({ line: s.line, specifier: s.specifier, reason: 'deep-import' as const })),
    ...nonLiteral.map((line) => ({ line, specifier: '', reason: 'non-literal-specifier' as const })),
    ...unknown,
  ].sort((a, b) => a.line - b.line);
  if (refused.length > 0) return { source, mapped: [], refused, kept: [], relevant: true };

  let out = source;
  const mapped: { from: string; to: string }[] = [];
  for (const site of moving.sort((a, b) => b.start - a.start)) {
    const to = MAPPING[site.specifier] as string;
    out = `${out.slice(0, site.start)}${to}${out.slice(site.end)}`;
    mapped.push({ from: site.specifier, to });
  }
  return { source: out, mapped: mapped.reverse(), refused: [], kept, relevant: true };
}

/* ------------------------------------------------------------------ the project */

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
/** Generated and vendored trees. Migrating `node_modules` would rewrite somebody else's package. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next', '.output', '.cache', '.vercel']);

/** Every source file under `dir`, relative and slash-separated so a report reads the same everywhere. */
export function sourceFiles(dir: string, at = '', found: string[] = []): string[] {
  for (const entry of readdirSync(join(dir, at), { withFileTypes: true })) {
    const path = at === '' ? entry.name : `${at}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) sourceFiles(dir, path, found);
    } else if (SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) found.push(path);
  }
  return found;
}

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Every dependency `package.json` declares, with its range — one of A1's two independent sources. */
async function declaredDependencies(dir: string): Promise<Map<string, string>> {
  try {
    const raw = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as Manifest;
    return new Map(Object.entries({ ...raw.dependencies, ...raw.devDependencies }));
  } catch {
    return new Map();
  }
}

/** The version installed at `dir/node_modules/<name>`, when there is one. */
async function installedVersion(dir: string, name: string): Promise<string | undefined> {
  try {
    return (JSON.parse(await readFile(join(dir, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/** Incumbents this project has on a major other than the graded one (A12). */
async function offMajorOf(dir: string, dependencies: Map<string, string>): Promise<OffMajor[]> {
  const found = await Promise.all(HOSTS.map(async (from) => ({ from, found: (await installedVersion(dir, from)) ?? dependencies.get(from) })));
  return found.flatMap(({ from, found: version }) => {
    const graded = GRADED_VERSIONS[from];
    if (version === undefined || graded === undefined) return [];
    const major = majorOf(version);
    return major === undefined || major === majorOf(graded) ? [] : [{ from, found: version, graded }];
  });
}

/** The package manager whose lockfile is here, so `next` is a command that runs as written. */
function installer(dir: string): { add: string; remove: string } {
  const has = (file: string): boolean => existsSync(join(dir, file));
  if (has('pnpm-lock.yaml')) return { add: 'pnpm add', remove: 'pnpm remove' };
  if (has('yarn.lock')) return { add: 'yarn add', remove: 'yarn remove' };
  if (has('bun.lockb') || has('bun.lock')) return { add: 'bun add', remove: 'bun remove' };
  return { add: 'npm install', remove: 'npm uninstall' };
}

/** `npm install roundel flagstaff && npm uninstall chalk ora`, or the half that applies. */
function nextStep(dir: string, add: string[], remove: string[]): string {
  const pm = installer(dir);
  const steps = [add.length > 0 ? `${pm.add} ${add.join(' ')}` : '', remove.length > 0 ? `${pm.remove} ${remove.join(' ')}` : ''];
  return steps.filter((c) => c !== '').join(' && ');
}

/**
 * `git status --porcelain`, or `undefined` where there is no repository to ask (A6).
 *
 * Through `bellpull` rather than `node:child_process`, because spawning is bellpull's job
 * and `scripts/inline-implementation-lock.test.ts` says so — it caught the first draft of
 * this file, which reached for `execFileSync` out of habit. burgee already depends on the
 * package, and `migrate.js` is loaded lazily, so nothing that does not run `migrate` pays
 * for the edge.
 *
 * Not a repository, no `git` on `PATH`, an unreadable directory: all the same answer, which
 * is *there is nothing here that could be dirty*. A6 protects a reviewable diff, and where
 * there is no repository there is no diff to protect — refusing instead would make the
 * command unusable on a tarball for a safety that was never available.
 */
export async function workingTree(dir: string): Promise<string[] | undefined> {
  const result = await run('git', ['-C', dir, 'status', '--porcelain'], { runtime: ambientRuntime(), stdio: 'pipe' });
  if (!result.ok) return undefined;
  return result.stdout.split('\n').filter((line) => line !== '');
}

/** A6 — a dirty tree has no reviewable diff to add to, so the command declines rather than writes. */
export class DirtyTreeError extends Error {
  readonly fix = 'commit or stash your changes, or pass --force';
  constructor(readonly entries: string[]) {
    super(`the git tree has ${entries.length} uncommitted change${entries.length === 1 ? '' : 's'}`);
    this.name = 'DirtyTreeError';
  }
}

export interface MigrateOptions {
  dir: string;
  dryRun?: boolean;
  force?: boolean;
  /** Injected by the tests; the real `git status --porcelain` otherwise. */
  status?: (dir: string) => string[] | undefined | Promise<string[] | undefined>;
}

/** A file the pre-filter rejected: never decoded, never scanned, never written. */
const EMPTY: Rewrite = { source: '', mapped: [], refused: [], kept: [], relevant: false };

/**
 * One batch: read them all, scan them all, write the ones that changed — three phases, not
 * one pipeline per file.
 *
 * The phases are the measurement, not a preference. Read-scan-write per file puts the CPU
 * pass between two I/O completions, so the scan serialises the batch's reads behind it; the
 * same 1,000-file tree measured 350–570 ms that way and 390–500 ms phased, against a floor
 * of about 150 ms of pure filesystem plus 25 ms of scan. (Fully synchronous I/O, for the
 * record, is **3.1–5.2 seconds** — an order of magnitude, which is why the concurrency is
 * here at all.)
 */
async function migrateBatch(dir: string, batch: string[], write: boolean, skip: ReadonlySet<string>): Promise<Rewrite[]> {
  // Read as bytes and decode only what the pre-filter admits: on the bench tree a third of
  // the files never become a string at all, which is 405 ms against 427 for the same work.
  const sources = await Promise.all(batch.map(async (file) => await readFile(join(dir, file))));
  const results = sources.map((bytes) => (mentionsAHost(bytes) ? rewriteSource(bytes.toString('utf8'), skip) : EMPTY));
  if (write) await Promise.all(results.map(async (r, i) => (r.mapped.length === 0 ? undefined : await writeFile(join(dir, batch[i] as string), r.source))));
  return results;
}

/** The per-mapping rollup, in the order `MAPPING` declares — so two runs print the same table. */
function rollup(all: { from: string; to: string; file: string }[]): Mapped[] {
  return Object.entries(MAPPING)
    .map(([from, to]) => {
      const hits = all.filter((m) => m.from === from);
      return { from, to, imports: hits.length, files: new Set(hits.map((m) => m.file)).size };
    })
    .filter((row) => row.imports > 0);
}

/**
 * A7 — the compat figures come from `compat.ts`, which `compat-baseline-lock.test.ts`
 * holds equal to `compat-oracle/baseline/<host>.json`. A number typed into a report
 * template is a number that goes stale silently, and this repository has published four
 * of those and caught them all late.
 */
function gradedFor(packages: string[]): (Row & { host: string })[] {
  const hosts = [...new Set(packages.map((p) => HOST_OF.get(p)).filter((h) => h !== undefined))];
  return hosts.filter((host) => GRADED[host] !== undefined).map((host) => ({ host, ...(GRADED[host] as Row) }));
}

/**
 * How many files are in flight at once — bounded by the open-file limit rather than by a
 * thread pool, as the design says (A10).
 *
 * Measured, because the first number chosen was wrong. Over the 1,000-file bench tree the
 * read phase costs 418 ms at 32, 107 ms at 64 and 83 ms unbounded; the write phase 135 ms at
 * 64 and 69 ms unbounded. 256 is where the curve has flattened and is still an order of
 * magnitude under the lowest `ulimit -n` anyone runs (1,024), so the bound is real rather
 * than decorative. The scan itself is 25 ms of the whole run — this is a filesystem budget,
 * which is exactly what "no AST" bought.
 */
const BATCH = 256;

/**
 * Migrate one project: detect, rewrite, report (A1, A7, A8).
 *
 * Non-interactive by design (D-052). The second audience is an agent migrating a
 * repository unattended, and a prompt is a wall; safety is `--dry-run` and the refusal on
 * a dirty tree, not a question.
 */
export async function migrate(options: MigrateOptions): Promise<MigrationReport> {
  const { dir, dryRun = false, force = false } = options;
  const entries = await (options.status ?? workingTree)(dir);
  if (!dryRun && !force && entries !== undefined && entries.length > 0) throw new DirtyTreeError(entries);

  const dependencies = await declaredDependencies(dir);
  const offMajor = await offMajorOf(dir, dependencies);
  const skip = new Set(offMajor.map((o) => o.from));
  const files = sourceFiles(dir);
  const results: { file: string; result: Rewrite }[] = [];
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    // eslint-disable-next-line reliability/no-await-in-loop -- the await IS the bound (A10). Each batch is 256 files in flight at once; awaiting one before opening the next is what keeps the command inside the open-file limit on a repository of any size, and `Promise.all` over every file in a monorepo is EMFILE.
    const done = await migrateBatch(dir, batch, !dryRun, skip);
    results.push(...done.map((result, k) => ({ file: batch[k] as string, result })));
  }

  const all = results.flatMap(({ file, result }) => result.mapped.map((m) => ({ ...m, file })));
  const refused: Refusal[] = results.flatMap(({ file, result }) => result.refused.map((r) => ({ file, ...r })));
  const kept: Kept[] = results.flatMap(({ file, result }) => result.kept.map((k) => ({ file, ...k })));
  const imported = [...new Set(results.flatMap(({ result }) => (result.relevant ? [...result.mapped.map((m) => packageOf(m.from)), ...result.kept.map((k) => packageOf(k.specifier))] : [])))].sort();
  const declared = HOSTS.filter((host) => dependencies.has(host));
  // A dependency is removable only when nothing still imports it — a file that was refused
  // still imports commander, and so does a kept type-only import, so the maintainer's
  // `npm rm` would break their own build.
  const stillUsed = new Set([...refused, ...kept].map((r) => packageOf(r.specifier)));
  const removable = declared.filter((host) => !stillUsed.has(host) && !skip.has(host));
  const touched = [...new Set(all.map((m) => m.file))];
  const add = [...new Set(all.map((m) => packageOf(m.to)))].filter((p) => !dependencies.has(p)).sort();
  const partial = PARTIAL.filter((d) => dependencies.has(d.from)).map((d) => ({ from: d.from, to: d.to, ...(GRADED[d.host] as Row) }));

  return {
    files: touched.length,
    imports: all.length,
    mapped: rollup(all),
    refused,
    kept,
    detected: { declared, imported },
    dependencies: { before: declared, removable, after: declared.length - removable.length, add },
    graded: gradedFor([...new Set([...declared, ...imported])].sort()),
    partial,
    offMajor,
    next: nextStep(dir, add, removable),
    dryRun,
    changed: !dryRun && touched.length > 0,
    exitCode: refused.length > 0 ? ExitCode.RUNTIME : ExitCode.OK,
  };
}
