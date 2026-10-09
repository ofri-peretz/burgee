/**
 * Everything said about a malformed argv, kept off the entry point that parses it.
 *
 * `execute.ts` is the core entry, and its budget was down to 79 bytes of headroom before
 * this module existed. None of this belongs there anyway: edit distance is 3 KB, and a
 * program that never mistypes an option never needs a word of it. `execute` loads this on
 * the failure path only (K6), where the weight lock counts it as paid by the run that
 * takes it — and the entry got smaller, not larger, because the single-dash hint moved
 * here too.
 */
import { suggestSimilar } from './suggest.js';

const UNKNOWN_OPTION = /^Unknown option '(?<flag>[^']+)'/u;
const NEAREST = /--[\w-]+/u;

/**
 * parseArgs' own words for this case are three lines about `--` and positional arguments,
 * which is the rarer reading, and they never mention the option the caller almost typed.
 * The command declared its options; the one thing worth saying is which was meant.
 */
const SINGLE_DASH_WORD = /^-(?<word>[a-zA-Z][\w-]+)(?:=.*)?$/u;

/**
 * `-foo=bar` means three short flags to a parser and one long flag to a person
 * (citty #237). The more specific reading of the same argv, so it is offered first.
 */
export function singleDashHint(argv: readonly string[]): string | undefined {
  for (const token of argv) {
    if (token === '--') return undefined;
    const word = SINGLE_DASH_WORD.exec(token)?.groups?.['word'];
    if (word !== undefined) return `did you mean --${word}? a single dash introduces one-letter options`;
  }
  return undefined;
}

/** How other CLIs ask for JSON: `--format json`, `--output=json`. */
const JSON_SPELLINGS = ['--format', '--output'];

/**
 * How many words at `at` ask for `--json` the way other CLIs spell it — `--format json` is two,
 * `--output=json` is one — or 0. `--format=agent` is burgee's own (N15) and is not one of them.
 * B1's agents opened the task that asks for JSON with one of these in 14 of its 20 runs, and each
 * refusal that did not name `--json` cost a turn spent looking for it.
 */
export function jsonSpelling(words: readonly string[], at: number): number {
  const word = String(words[at]);
  if (JSON_SPELLINGS.some((flag) => word === `${flag}=json`)) return 1;
  return JSON_SPELLINGS.includes(word) && words[at + 1] === 'json' ? 2 : 0;
}

/**
 * Not a refusal: the line to run in its place, program first (D-20261009-json-asked-is-json). Thrown
 * where the only fault in argv was how JSON was asked for; `execute` runs `again` and reports nothing.
 */
export class Again extends Error {
  constructor(readonly again: string[]) {
    super('again');
  }
}

/** A word safe to paste into a shell as it is; anything else goes in single quotes. */
export const shellWord = (word: string): string => (/^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`);

/**
 * `argv` is the whole line as typed, program first, so the fix can be that line with the flag
 * corrected: `demo config get user.name --json`, not `--json`. B1's agents rebuilt the line from
 * a bare flag every time; a line runs as it stands, a flag has to be put somewhere first.
 */
export function unknownOption(
  cause: unknown,
  declared: readonly string[],
  argv: readonly string[],
): { message: string; hint: string; fix?: string; again?: string[] } | undefined {
  if (!(cause instanceof Error)) return undefined;
  const flag = UNKNOWN_OPTION.exec(cause.message)?.groups?.['flag'];
  if (flag === undefined) return undefined;
  // `suggestSimilar` slices `--` off the word AND off every candidate, so bare names
  // arrive two characters short: `name` becomes `me`, and `--nmae` is nearer to that than
  // to anything real. Candidates go in dashed. `--json` is one of them: every command parses it.
  const dashed = [...declared, 'json'].map((option) => `--${option}`);
  const typed = argv.findIndex((word) => word === flag || word.startsWith(`${flag}=`));
  const spelled = jsonSpelling(argv, typed);
  const near = spelled > 0 ? '--json' : NEAREST.exec(suggestSimilar(flag, dashed))?.[0];
  if (near === undefined) return { message: `unknown option ${flag}`, hint: 'run --help to see the available options' };
  // E3 — `hint` is prose a person reads; `fix` is the exact line a caller runs. An agent
  // can execute one and has to interpret the other, which is the turn this field saves.
  // Omitted rather than guessed when there is no near match, or no word to correct: an
  // executed guess burns the turn the field exists to save. `--format json` is two words
  // and `--json` one; `--nmae=ada` keeps its value as `--name=ada`.
  const word = spelled > 0 ? near : near + String(argv[typed]).slice(flag.length);
  const line = typed < 0 ? undefined : argv.toSpliced(typed, spelled || 1, word);
  // D-20261009-json-asked-is-json — `--format json` on a command that declares no option near
  // `--format` asks for one thing, `--json`, and the line runs with it rather than being refused.
  // Only the spelling of that request is read: the command and every other word are as typed.
  // A declared `--formats` beside it makes it a guess, and a guess stays a refusal.
  const again = spelled > 0 && suggestSimilar(flag, declared.map((option) => `--${option}`)) === '' ? line : undefined;
  return {
    message: `unknown option ${flag}`,
    hint: `did you mean ${near}?`,
    ...(line === undefined ? {} : { fix: line.map(shellWord).join(' ') }),
    ...(again === undefined ? {} : { again }),
  };
}
