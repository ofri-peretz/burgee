/**
 * The five flag shapes yargs-parser's `isUnknownOption` asks about, in linear time.
 *
 * Upstream writes each as a regex and reads its first group:
 *
 *   flagWithEquals                  /^-+([^=]+?)=[\s\S]*$/
 *   normalFlag                      /^-+([^=]+?)$/
 *   flagEndingInHyphen              /^-+([^=]+?)-$/
 *   flagEndingInDigits              /^-+([^=]+?\d+)$/
 *   flagEndingInNonWordCharacters   /^-+([^=]+?)\W+.*$/
 *
 * The last two backtrack: `[^=]+?` and `\d+` trade digits, so a long argument ending in a
 * run of digits and then anything else is quadratic, and `[^=]+?`, `\W+` and `.*` trade
 * three ways, so a run of spaces or punctuation followed by a line break is cubic — a 4,000
 * character argument took 10 s. With `unknown-options-as-args` every `-`-prefixed argument
 * goes through all five. Each function below returns exactly what the regex's group 1
 * captured, or `undefined` where it did not match; `flag-shapes.test.ts` holds that against
 * the regexes over every short string of the characters involved.
 *
 * The regexes are anchored at the start, so the only backtracking that changes the answer
 * is `-+` giving dashes back: it tries the longest run first, and gives one back only when
 * nothing after it can match. That is the `'-'` each function falls back to.
 */

/** How many `-` the string starts with. */
function dashes(s: string): number {
  let p = 0;
  while (s[p] === '-') p++;
  return p;
}

/** `\W`: not `[A-Za-z0-9_]`. */
function isNonWord(c: string): boolean {
  return !/\w/.test(c);
}

/** `/^-+([^=]+?)=[\s\S]*$/` */
export function flagWithEquals(s: string): string | undefined {
  const p = dashes(s);
  const eq = s.indexOf('=');
  if (p === 0 || eq === -1) return undefined;
  if (eq > p) return s.slice(p, eq);
  return p >= 2 ? '-' : undefined;
}

/** `/^-+([^=]+?)$/` */
export function normalFlag(s: string): string | undefined {
  const p = dashes(s);
  if (p === 0 || s.includes('=')) return undefined;
  if (p < s.length) return s.slice(p);
  return p >= 2 ? '-' : undefined;
}

/** `/^-+([^=]+?)-$/` */
export function flagEndingInHyphen(s: string): string | undefined {
  const p = dashes(s);
  if (p === 0 || s.includes('=') || !s.endsWith('-')) return undefined;
  if (p < s.length) return s.slice(p, -1);
  return p >= 3 ? '-' : undefined;
}

/** `/^-+([^=]+?\d+)$/`: the group is the rest of the string, at least two characters. */
export function flagEndingInDigits(s: string): string | undefined {
  const p = dashes(s);
  if (p === 0 || s.includes('=') || !/\d$/.test(s)) return undefined;
  if (s.length - p >= 2) return s.slice(p);
  return p >= 2 ? s.slice(p - 1) : undefined;
}

/**
 * `/^-+([^=]+?)\W+.*$/`. The group ends at the first `j` past the dashes where `\W+.*$` can
 * start: `s[j]` is `\W`, `j` is not past the first `=`, and the `\W` run from `j` reaches the
 * character after the last line terminator, since `.*` cannot cross one and `\W` can.
 */
export function flagEndingInNonWordCharacters(s: string): string | undefined {
  const p = dashes(s);
  if (p === 0) return undefined;
  const n = s.length;
  const eq = s.indexOf('=');
  const limit = eq === -1 ? n : eq;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (/[\n\r\u2028\u2029]/.test(s[i] as string)) {
      tail = i + 1;
      break;
    }
  }
  // runEnd[i]: where the `\W` run starting at i ends.
  const runEnd: number[] = [];
  runEnd[n] = n;
  for (let i = n - 1; i >= 0; i--) runEnd[i] = isNonWord(s[i] as string) ? (runEnd[i + 1] as number) : i;
  const starts = (j: number): boolean => j < n && j <= limit && (runEnd[j] as number) > j && (runEnd[j] as number) >= tail;
  for (let j = p + 1; j <= limit && j < n; j++) if (starts(j)) return s.slice(p, j);
  for (let j = p; j >= 2; j--) if (starts(j)) return '-';
  return undefined;
}
