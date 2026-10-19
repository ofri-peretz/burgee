/**
 * `burgee migrate` for a project whose commander or yargs is on a major the drop-in does not claim
 * (`migrate-older-majors`).
 *
 * The 2026-10-18 field trial moved four such CLIs by hand, and all four crashed on start-up, each
 * on an API its own incumbent removed in a later major: wait-port and madge used
 * `require('commander')` as the program, tsc-alias a two-letter short flag, qrcode the yargs
 * singleton. Three of the four kept a green test suite. So an off-major row says which lines use
 * an API a claimed major no longer has, and the move to the nearest claimed major is printed only
 * when none of them is in its way (`moveOf`, modelled in `majors.qnt`).
 *
 * **Every row is the incumbent's own changelog.** `REMOVED_APIS` cites each release heading at a
 * pinned tag and quotes its line, and `scripts/migrate-removed-apis-lock.test.ts` holds each row
 * true against the drop-in at every claimed major, so a row the façade still serves cannot be a
 * work item, and a major that serves an API the table says is gone cannot be a move.
 *
 * **Decided by evidence, never by names alone.** A binding is followed only from a whole
 * `require()` or a default import of the package, and only a member the façade does not export is
 * a use. Nothing here imports `migrate.ts`: it lexes and calls in, as it does `migrate-guided.ts`.
 */
import { type Token } from './migrate-guided.js';

/** The two incumbents with a table: the only ones whose moves this can check. */
export type MajorHost = 'commander' | 'yargs';

export type RemovedApiId = 'module-as-program' | 'multi-char-short-flag' | 'esm-mjs' | 'rebase' | 'reset' | 'on-finish-command' | 'singleton';

/** One API an incumbent removed, cited to its own changelog. */
export interface RemovedApi {
  host: MajorHost;
  api: RemovedApiId;
  /** The incumbent release that removed it. */
  removedIn: string;
  /** What to write instead, as a line a maintainer can copy. */
  replacement: string;
  /** The incumbent's own `CHANGELOG.md` at a released tag, anchored to the release heading. */
  source: string;
  /** The changelog line, verbatim. */
  quote: string;
}

// Stryker disable all: the table is data, read at load, so each mutant would rerun every test in the package. Each row is held by scripts/migrate-removed-apis-lock.test.ts (citation shape, the docs page) and by migrate-majors.test.ts (the four fixtures, and every row probed against the drop-in at every claimed major)
const COMMANDER = 'https://github.com/tj/commander.js/blob/v15.0.0/CHANGELOG.md';
const YARGS = 'https://github.com/yargs/yargs/blob/v18.0.0/CHANGELOG.md';

/** Read from each incumbent's `CHANGELOG.md` at the tag in its `source`, 2026-10-19. */
export const REMOVED_APIS: readonly RemovedApi[] = [
  {
    host: 'commander',
    api: 'module-as-program',
    removedIn: '12.0.0',
    replacement: "const { program } = require('commander')",
    source: `${COMMANDER}#1200-2024-02-03`,
    quote: 'removed default export of a global Command instance from CommonJS (use the named `program` export instead)',
  },
  {
    host: 'commander',
    api: 'multi-char-short-flag',
    removedIn: '13.0.0',
    replacement: 'a one-character short flag, or the long flag alone',
    source: `${COMMANDER}#1300-2024-12-30`,
    quote: 'throw during Option construction for unsupported option flags, like multiple characters after single `-`',
  },
  {
    host: 'commander',
    api: 'esm-mjs',
    removedIn: '15.0.0',
    replacement: "import { program } from 'commander'",
    source: `${COMMANDER}#1500-2026-05-29`,
    quote: 'removed deprecated export of `commander/esm.mjs`',
  },
  {
    host: 'yargs',
    api: 'rebase',
    removedIn: '16.0.0',
    replacement: 'path.relative()',
    source: `${YARGS}#1600-2020-09-09`,
    quote: 'rebase helper is no longer provided on yargs instance.',
  },
  {
    host: 'yargs',
    api: 'reset',
    removedIn: '17.0.0',
    replacement: 'a fresh yargs() instance',
    source: `${YARGS}#1700-2021-05-02`,
    quote: 'deprecated reset() method is now private (call yargs() instead).',
  },
  {
    host: 'yargs',
    api: 'on-finish-command',
    removedIn: '17.0.0',
    replacement: "await the promise the command's handler returns",
    source: `${YARGS}#1700-2021-05-02`,
    quote: 'onFinishCommand removed, in favor of being able to await promise.',
  },
  {
    host: 'yargs',
    api: 'singleton',
    removedIn: '18.0.0',
    replacement: "const yargs = require('yargs/yargs'); yargs(process.argv.slice(2))…",
    source: `${YARGS}#1800-2025-05-26`,
    quote: 'singleton usage of yargs yargs.foo, yargs().argv, has been removed.',
  },
];
// Stryker restore all

/** A line that uses a removed API, without its file. */
export interface RemovedSite {
  line: number;
  api: RemovedApiId;
  removedIn: string;
  replacement: string;
  source: string;
  /** For a binding: the line of its first use the claimed major lacks. Absent from `--json` otherwise. */
  firstUse: number | undefined;
}

/** The major a `removedIn` names. */
export const removedMajor = (api: Pick<RemovedApi, 'removedIn'>): number => Number(api.removedIn.split('.')[0]);

/** The row of `api`. */
const rowOf = (api: RemovedApiId): RemovedApi => REMOVED_APIS.find((row) => row.api === api) as RemovedApi;

/** The incumbent that removed `api`. */
export const hostOfApi = (api: RemovedApiId): MajorHost => rowOf(api).host;

/** Whether the table has rows for `host`: only those hosts' moves can be checked. */
export const isMajorHost = (host: string): host is MajorHost => REMOVED_APIS.some((row) => row.host === host);

/** The yargs instance method a call spells, when it is one 16 or 17 removed. */
function yargsMethod(name: string | undefined): RemovedApiId | undefined {
  if (name === 'onFinishCommand') return 'on-finish-command';
  return name === 'rebase' || name === 'reset' ? name : undefined;
}

interface Walk {
  tokens: readonly Token[];
  /** Each host's façade exports: a member in them is valid on every claimed major. */
  exports: Readonly<Record<MajorHost, ReadonlySet<string>>>;
  out: RemovedSite[];
}

const text = (w: Walk, i: number): string | undefined => w.tokens[i]?.text;
const lineAt = (w: Walk, i: number): number => (w.tokens[i] as Token).line;

function report(w: Walk, line: number, api: RemovedApiId, firstUse?: number): void {
  const { removedIn, replacement, source } = rowOf(api);
  w.out.push({ line, api, removedIn, replacement, source, firstUse });
}

/** The api a whole module misuses: the program in commander ≤ 11, the singleton in yargs ≤ 17. */
const moduleApi = (host: MajorHost): RemovedApiId => (host === 'commander' ? 'module-as-program' : 'singleton');

/** Where each token of `require('x')` sits, counted from the keyword. */
const LOAD = { open: 1, specifier: 2, close: 3 } as const;

/** `require('<host>')` at `i`: the index of its closing `)`, or `-1`. */
function requireOf(w: Walk, i: number, host: string): number {
  const whole = text(w, i) === 'require' && text(w, i + LOAD.open) === '(' && w.tokens[i + LOAD.specifier]?.value === host && text(w, i + LOAD.close) === ')';
  return whole ? i + LOAD.close : -1;
}

/** `import B from '<host>'` or `import B, { … } from '<host>'` at `i`: the name `B`, or `undefined`. */
function defaultImportOf(w: Walk, i: number, host: string): string | undefined {
  if (text(w, i) !== 'import') return undefined;
  // `import B, { a } from`: past the named imports. A namespace or a bare `import {` never reaches `from` here.
  // Stryker disable next-line EqualityOperator: the token at `comma` is `,`, which is not `}`
  const from = text(w, i + 2) === ',' ? w.tokens.findIndex((t, k) => k > i + 2 && t.text === '}') + 1 : i + 2;
  return text(w, from) === 'from' && w.tokens[from + 1]?.value === host ? text(w, i + 1) : undefined;
}

/**
 * The first `name.<member>` in the file whose member the façade does not export, as that member's
 * line. Anywhere in the file: a function declared above the binding runs after it.
 */
function firstUse(w: Walk, host: MajorHost, name: string): number | undefined {
  const k = w.tokens.findIndex((t, at) => t.text === name && text(w, at - 1) !== '.' && text(w, at + 1) === '.' && !w.exports[host].has(text(w, at + 2) as string));
  return k === -1 ? undefined : lineAt(w, k + 2);
}

/** A binding `name` of the whole module, made on `line`: a site there when it is ever used as what the claimed major removed. */
function bound(w: Walk, host: MajorHost, name: string, line: number): void {
  const use = firstUse(w, host, name);
  if (use !== undefined) report(w, line, moduleApi(host), use);
}

/** The property names a `{ … }` pattern ending at `close` reads: each name after `{` or `,`, never a renamed local after `:`. */
function destructured(w: Walk, close: number): string[] {
  // Stryker disable next-line EqualityOperator: the token at `close` is `}`, which is not `{`
  const open = w.tokens.findLastIndex((t, k) => k < close && t.text === '{');
  return w.tokens.slice(open + 1, close).flatMap((t, k, all) => (k === 0 || (all[k - 1] as Token).text === ',' ? [t.text] : []));
}

/**
 * `require('<host>')` from `at` to `end`, read by what follows and what it is assigned to:
 * `require('yargs')(argv)` is the factory, `.program` and `{ program } =` are named exports, and
 * any other member, destructured name or bound name's member is the module the claimed major removed.
 */
function wholeRequire(w: Walk, host: MajorHost, at: number, end: number): void {
  const line = lineAt(w, at);
  const exported = w.exports[host];
  if (text(w, end + 1) === '.') {
    if (!exported.has(text(w, end + 2) as string)) report(w, line, moduleApi(host));
    return;
  }
  if (text(w, at - 1) !== '=') return;
  const target = at - 2;
  if (text(w, target) === '}') {
    if (destructured(w, target).some((name) => !exported.has(name))) report(w, line, moduleApi(host));
    return;
  }
  // A name, not `]` or `)`: `list[0] = require(…)` binds nothing a member can be read from by name.
  // Stryker disable next-line Regex: a token is one word or one character, so the anchors match the same tokens
  if (/^[A-Za-z_$][\w$]*$/.test(text(w, target) as string)) bound(w, host, text(w, target) as string, line);
}

/** commander's flags string, the first argument of `.option(`, `.requiredOption(` or `new [B.]Option(`: a site when a short flag is two characters or more. */
function flagsAt(w: Walk, i: number): void {
  const t = text(w, i);
  const receiver = i - 2;
  const call = ((t === 'option' || t === 'requiredOption') && text(w, i - 1) === '.') || (t === 'Option' && (text(w, i - 1) === 'new' || (text(w, i - 1) === '.' && text(w, receiver - 1) === 'new')));
  const flags = w.tokens[i + 2];
  if (!call || text(w, i + 1) !== '(' || flags?.value === undefined) return;
  // A short flag of two characters or more: `-fe`.
  if (flags.value.split(/[ ,|]/).some((flag) => /^-[^-]{2,}/.test(flag))) report(w, flags.line, 'multi-char-short-flag');
}

/** Every pattern that can start at token `i`, for the hosts this file imports. */
function visit(w: Walk, found: ReadonlyMap<MajorHost, number>, i: number): void {
  for (const host of found.keys()) {
    const end = requireOf(w, i, host);
    if (end !== -1) wholeRequire(w, host, i, end);
    const name = defaultImportOf(w, i, host);
    if (name !== undefined) bound(w, host, name, lineAt(w, i));
  }
  // A commander pattern in a file that imports only yargs, or the reverse, is dropped by `removedSites`' filter: its host has no major here.
  flagsAt(w, i);
  if ((w.tokens[i] as Token).value === 'commander/esm.mjs') report(w, lineAt(w, i), 'esm-mjs');
  const method = yargsMethod(text(w, i));
  if (method !== undefined && text(w, i - 1) === '.' && text(w, i + 1) === '(') report(w, lineAt(w, i), method);
}

/**
 * Every line in one file's tokens that uses an API its incumbent removed after the major the
 * project is on, up to the highest major the drop-in claims, in line order.
 *
 * `found` is the off-major hosts this file imports, each with its major; `claimed` the highest
 * major claimed per host; `exports` each host's façade export list, `FACADE_EXPORTS` for
 * `burgee/commander` and `burgee/yargs`. A member those export is valid on every claimed major
 * (`program.Command`, `yargs.hideBin`), so it is never a use.
 */
export function removedSites(
  tokens: readonly Token[],
  found: ReadonlyMap<MajorHost, number>,
  claimed: Readonly<Record<MajorHost, number>>,
  exports: Readonly<Record<MajorHost, readonly string[]>>,
): RemovedSite[] {
  const w: Walk = { tokens, exports: { commander: new Set(exports.commander), yargs: new Set(exports.yargs) }, out: [] };
  for (const [i] of tokens.entries()) visit(w, found, i);
  // In token order, which is line order: every site is reported at its own token or the next two.
  return w.out.filter((site) => {
    const host = hostOfApi(site.api);
    const major = removedMajor(site);
    return major > (found.get(host) as number) && major <= claimed[host];
  });
}

/**
 * The gate (`majors.qnt`): the claimed major a move goes to, or `undefined` when there is none to print.
 *
 * It is the smallest claimed major above `found`, because an API stays removed once it is, so a
 * larger one can only lack more. And it is refused when any site's API was removed at or before
 * it, or when the project imports a specifier no entry at that major serves (`commander/esm.mjs`,
 * a deep import): a move that would crash on start-up is never printed.
 */
export function moveOf(found: number, claimed: readonly number[], sites: readonly Pick<RemovedSite, 'removedIn'>[], unserved: boolean): number | undefined {
  const nearest = nearestOf(found, claimed);
  // With no claimed major above, `nearest` is undefined and no comparison holds, so it is what is returned.
  return unserved || sites.some((site) => removedMajor(site) <= (nearest as number)) ? undefined : nearest;
}

/** The smallest claimed major above `found`. */
export function nearestOf(found: number, claimed: readonly number[]): number | undefined {
  return claimed.filter((major) => major > found).sort((a, b) => a - b)[0];
}
