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

export function unknownOption(
  cause: unknown,
  declared: readonly string[],
  argv: readonly string[],
): { message: string; hint: string; fix?: string } | undefined {
  if (!(cause instanceof Error)) return undefined;
  const flag = UNKNOWN_OPTION.exec(cause.message)?.groups?.['flag'];
  if (flag === undefined) return undefined;
  // `suggestSimilar` slices `--` off the word AND off every candidate, so bare names
  // arrive two characters short: `name` becomes `me`, and `--nmae` is nearer to that than
  // to anything real. Candidates go in dashed. `--json` is one of them: every command parses it.
  const dashed = [...declared, 'json'].map((option) => `--${option}`);
  const typed = argv.findIndex((word) => word === flag || word.startsWith(`${flag}=`));
  const near = jsonSpelling(argv, typed) > 0 ? '--json' : NEAREST.exec(suggestSimilar(flag, dashed))?.[0];
  return {
    message: `unknown option ${flag}`,
    hint: near === undefined ? 'run --help to see the available options' : `did you mean ${near}?`,
    // E3 — `hint` is prose a person reads; `fix` is the exact flag a caller runs. An agent
    // can execute one and has to interpret the other, which is the turn this field saves.
    // Omitted rather than guessed when there is no near match: an executed guess burns the
    // turn the field exists to save.
    ...(near === undefined ? {} : { fix: near }),
  };
}
