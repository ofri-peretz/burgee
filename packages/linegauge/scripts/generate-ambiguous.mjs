/**
 * Regenerates the East Asian Ambiguous range table in `src/width.ts`.
 *
 * The W and F table beside it was transcribed by hand from the usual `EastAsianWidth.txt`
 * derivation. This one is not: 179 ranges is past the size where a human reading a text file
 * can be trusted, so it is swept out of `get-east-asian-width` — a real Unicode
 * implementation that is already a devDependency of this package because its suite grades
 * against it — and the output is committed. No dependency at run time; the generator is a
 * build-time tool, and re-running it after a Unicode update produces a reviewable diff.
 *
 *   node scripts/generate-ambiguous.mjs        # prints the table
 *   node scripts/generate-ambiguous.mjs --check # exits 1 if src/width.ts is stale
 */
import { readFileSync } from 'node:fs';

import { eastAsianWidthType } from 'get-east-asian-width';

const MAX_CODE_POINT = 0x10_ff_ff;

const ranges = [];
let start = -1;
for (let cp = 0; cp <= MAX_CODE_POINT + 1; cp++) {
  const ambiguous = cp <= MAX_CODE_POINT && eastAsianWidthType(cp) === 'ambiguous';
  if (ambiguous && start === -1) start = cp;
  else if (!ambiguous && start !== -1) {
    ranges.push([start, cp - 1]);
    start = -1;
  }
}

// Same shape as WIDE beside it: `[low, high]` pairs flattened into one array, so one binary
// search serves both tables. Five pairs a line, which is how WIDE is laid out.
// The table is written as fixed-width uppercase hex so a diff lines up column-wise.
const HEX_RADIX = 16;
const HEX_DIGITS = 4;
const hex = (n) => `0x${n.toString(HEX_RADIX).toUpperCase().padStart(HEX_DIGITS, '0')}`;
const PAIRS_PER_LINE = 5;
const lines = [];
for (let i = 0; i < ranges.length; i += PAIRS_PER_LINE) {
  const slice = ranges.slice(i, i + PAIRS_PER_LINE).map(([a, b]) => `${hex(a)}, ${hex(b)},`);
  lines.push(`  ${slice.join(' ')}`);
}
const table = `const AMBIGUOUS: readonly number[] = [\n${lines.join('\n')}\n];`;

if (process.argv.includes('--check')) {
  const source = readFileSync(new URL('../src/width.ts', import.meta.url), 'utf8');
  if (source.includes(table)) {
    process.stdout.write(`ambiguous table is current — ${ranges.length} ranges\n`);
  } else {
    process.stderr.write(`src/width.ts does not hold the table this generates (${ranges.length} ranges).\nRun: node scripts/generate-ambiguous.mjs\n`);
    process.exitCode = 1;
  }
} else {
  process.stdout.write(`${table}\n`);
}
