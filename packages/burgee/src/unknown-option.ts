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

export function unknownOption(
  cause: unknown,
  declared: readonly string[],
): { message: string; hint: string } | undefined {
  if (!(cause instanceof Error)) return undefined;
  const flag = UNKNOWN_OPTION.exec(cause.message)?.groups?.['flag'];
  if (flag === undefined) return undefined;
  // `suggestSimilar` slices `--` off the word AND off every candidate, so bare names
  // arrive two characters short: `name` becomes `me`, and `--nmae` is nearer to that than
  // to anything real. Candidates go in dashed.
  const dashed = declared.map((option) => `--${option}`);
  const near = NEAREST.exec(suggestSimilar(flag, dashed))?.[0];
  return {
    message: `unknown option ${flag}`,
    hint: near === undefined ? 'run --help to see the available options' : `did you mean ${near}?`,
  };
}
