/**
 * controlroom R21 — `diff`. Off a terminal the diff is printed unchanged, byte for byte, so
 * `patch` and `git apply` take what a pipe captured. On one, every line carries the old and
 * new line number it stands at, read from the hunk header's counts.
 */
import { flown } from 'roundel/policy';
import { describe, expect, it } from 'vitest';

import { diff } from './diff.js';
import { hoist, manualClock, type Runtime } from './loop.js';

const PATCH = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 3b18e51..a1c2d3f 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -8,4 +8,5 @@ export function main() {',
  '   const config = load();',
  '-  run(config);',
  '+  const ready = check(config);',
  '+  if (ready) run(config);',
  '',
  '   return 0;',
  '@@ -99 +100 @@',
  '-}',
  '+};',
  String.raw`\ No newline at end of file`,
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1,0 +1 @@',
  '+# app',
  '',
].join('\n');

describe('controlroom R21 · diff', () => {
  it('the static projection is the diff unchanged, and a pipe prints exactly it', () => {
    expect(diff().static({ diff: PATCH })).toBe(PATCH.slice(0, -1));
    const out: string[] = [];
    const rt: Runtime = { env: {}, isTTY: { stdout: false }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => undefined }, clock: manualClock() };
    hoist(diff(), rt, { diff: PATCH }).lower();
    expect(out.join('')).toBe(PATCH);
    expect(diff().static({ diff: '-a\n+b' })).toBe('-a\n+b');
  });

  it('on a terminal, every hunk line carries its old and new line number; headers carry none', () => {
    expect(diff().frame?.(0, { diff: PATCH })?.split('\n')).toEqual([
      '        │ diff --git a/src/app.ts b/src/app.ts',
      '        │ index 3b18e51..a1c2d3f 100644',
      '        │ --- a/src/app.ts',
      '        │ +++ b/src/app.ts',
      '        │ @@ -8,4 +8,5 @@ export function main() {',
      '  8   8 │    const config = load();',
      '  9     │ -  run(config);',
      '      9 │ +  const ready = check(config);',
      '     10 │ +  if (ready) run(config);',
      // A context line an editor stripped to nothing is still a context line.
      ' 10  11 │ ',
      ' 11  12 │    return 0;',
      '        │ @@ -99 +100 @@',
      ' 99     │ -}',
      '    100 │ +};',
      String.raw`        │ \ No newline at end of file`,
      // After the hunk's counts are spent, `---` is a header again, not a removal.
      '        │ --- a/README.md',
      '        │ +++ b/README.md',
      '        │ @@ -1,0 +1 @@',
      '      1 │ +# app',
    ]);
  });

  it('with colour, removals are `error`, additions `ok`, hunk headers `hint`, the rest `muted`', () => {
    flown.level = 1;
    flown.paint = { error: ['red'], ok: ['green'], hint: ['cyan'], muted: ['dim'] };
    try {
      expect(diff().frame?.(0, { diff: '@@ -1 +1 @@\n-a\n+b' })?.split('\n')).toEqual([
        '\u001B[2m    │\u001B[22m \u001B[36m@@ -1 +1 @@\u001B[39m',
        '\u001B[2m1   │\u001B[22m \u001B[31m-a\u001B[39m',
        '\u001B[2m  1 │\u001B[22m \u001B[32m+b\u001B[39m',
      ]);
    } finally {
      flown.level = 0;
      flown.paint = {};
    }
  });

  it('an empty diff draws one empty row and prints nothing', () => {
    expect(diff().frame?.(0, { diff: '' })).toBe('  │ ');
    expect(diff().static({ diff: '' })).toBe('');
  });
});
