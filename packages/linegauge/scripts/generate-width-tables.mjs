/**
 * Regenerates the two East Asian Width range tables in `src/width.ts` — `WIDE` (the W and F
 * categories) and `AMBIGUOUS` (A).
 *
 * Both are swept out of `get-east-asian-width`, a real Unicode implementation pinned at the
 * workspace root because `string-width` — whose suite grades `linegauge` — measures with it.
 * The output is committed: no dependency at run time; the generator is a build-time tool, and
 * re-running it after a Unicode update produces a reviewable diff.
 *
 * `WIDE` used to be transcribed by hand and said "Unicode 17" in its doc comment. Swept
 * against get-east-asian-width 1.6.0 it was 11 runs of code points short, and against
 * 1.7.0 — the Unicode 17 data — 19 runs and 1,147 code points short. A table nobody regenerates says
 * whatever its comment says. So both tables come from here now, and `width.test.ts` runs
 * `--check`, which is what makes a dependency bump that moves the data fail rather than drift.
 *
 *   node scripts/generate-width-tables.mjs         # prints both tables
 *   node scripts/generate-width-tables.mjs --check # exits 1 if src/width.ts is stale
 */
import { readFileSync } from 'node:fs';

import { eastAsianWidthType } from 'get-east-asian-width';

const MAX_CODE_POINT = 0x10_ff_ff;

/** Every maximal run of code points `test` accepts, as `[low, high]` pairs. */
function sweep(test) {
  const ranges = [];
  let start = -1;
  for (let cp = 0; cp <= MAX_CODE_POINT + 1; cp++) {
    const inside = cp <= MAX_CODE_POINT && test(eastAsianWidthType(cp));
    if (inside && start === -1) start = cp;
    else if (!inside && start !== -1) {
      ranges.push([start, cp - 1]);
      start = -1;
    }
  }
  return ranges;
}

// `[low, high]` pairs flattened into one array, so one binary search serves both tables.
// Written as fixed-width uppercase hex, five pairs a line, so a diff lines up column-wise.
const HEX_RADIX = 16;
const HEX_DIGITS = 4;
const hex = (n) => `0x${n.toString(HEX_RADIX).toUpperCase().padStart(HEX_DIGITS, '0')}`;
const PAIRS_PER_LINE = 5;

function render(name, ranges) {
  const lines = [];
  for (let i = 0; i < ranges.length; i += PAIRS_PER_LINE) {
    const pairs = ranges.slice(i, i + PAIRS_PER_LINE).map(([a, b]) => `${hex(a)}, ${hex(b)},`);
    lines.push(`  ${pairs.join(' ')}`);
  }
  return `const ${name}: readonly number[] = [\n${lines.join('\n')}\n];`;
}

const tables = [
  { name: 'WIDE', ranges: sweep((type) => type === 'wide' || type === 'fullwidth') },
  { name: 'AMBIGUOUS', ranges: sweep((type) => type === 'ambiguous') },
].map((table) => ({ ...table, text: render(table.name, table.ranges) }));

if (process.argv.includes('--check')) {
  const source = readFileSync(new URL('../src/width.ts', import.meta.url), 'utf8');
  const stale = tables.filter((table) => !source.includes(table.text));
  for (const table of tables) {
    const state = stale.includes(table) ? 'STALE' : 'current';
    process.stdout.write(`${table.name} is ${state} — ${table.ranges.length} ranges\n`);
  }
  if (stale.length > 0) {
    process.stderr.write(`src/width.ts does not hold the table${stale.length > 1 ? 's' : ''} this generates.\nRun: node scripts/generate-width-tables.mjs\n`);
    process.exitCode = 1;
  }
} else {
  process.stdout.write(`${tables.map((table) => table.text).join('\n\n')}\n`);
}
