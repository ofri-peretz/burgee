/**
 * linegauge's plugin surface — the ninth of nine, and the one that had none.
 *
 * `scripts/extension-surface-lock.test.ts` has carried `linegauge: { plugin: false }` since it
 * was written. The row stayed empty on purpose for a while: a width function is not obviously
 * extensible, and an extension point invented to fill a table is worse than an honest gap.
 *
 * What makes `widths` real is that the package already admits the problem. `width.ts` says
 * ambiguous-width characters are *"counted narrow, which is what a terminal does unless it has
 * been told it is rendering an East Asian locale"* — and that covers only the ambiguity Unicode
 * sanctions. A Nerd Font putting a two-column icon in the Private Use Area, a code point added
 * by a Unicode release newer than the table compiled into this build, a font drawing U+2500
 * wide: each is a real, local disagreement with the built-in answer, and the user is the
 * authority on the terminal in front of them.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { CONTRACT, overrides, PluginError, problems, register, setOverrides, validate } from './plugin.js';
import { width } from './width.js';

/** Each case starts from no overrides: registration is global, which is what makes it useful. */
afterEach(() => {
  for (const name of [...overrides().keys()]) setOverrides(name, {});
});

/** U+E0A0, a Private Use code point a Nerd Font draws as a two-column branch glyph. */
const NERD = '\u{E0A0}';

const nerdFont = {
  name: 'nerd-font',
  widths: {
    icons: {
      ranges: [[0xe0_00, 0xf8_ff]] as const,
      columns: 2,
      why: 'Nerd Font patches two-column icons into the Private Use Area; measured in WezTerm 20260101',
    },
  },
};

describe('a plugin contributes width overrides', () => {
  it('counts a Private Use code point narrow until a plugin says otherwise', () => {
    expect(width(NERD), 'the built-in table has no opinion, so it falls through to narrow').toBe(1);
    register(nerdFont);
    expect(width(NERD), 'the user described their own terminal and it was ignored').toBe(2);
  });

  it('lets a later registration correct an earlier one', () => {
    register(nerdFont);
    register({ name: 'my-terminal', widths: { fix: { ranges: [[0xe0_a0, 0xe0_a0]] as const, columns: 1, why: 'my font draws this one narrow' } } });
    expect(width(NERD), 'the last word on a terminal belongs to whoever is sitting at it').toBe(1);
  });

  it('costs nothing when no plugin registers, including on the ASCII path', () => {
    expect(width('hello world')).toBe(11);
    expect(width('日本語')).toBe(6);
    expect(overrides().size).toBe(0);
  });

  it('applies before the zero-width and emoji rules, not after', () => {
    // A combining acute is zero columns by the built-in rule. A user whose terminal reserves a
    // cell for it says so, and the override has to win or it is decorative.
    register({ name: 'reserves-marks', widths: { marks: { ranges: [[0x03_01, 0x03_01]] as const, columns: 1, why: 'this terminal advances the cursor on a combining acute' } } });
    expect(width('́')).toBe(1);
  });
});

describe('a refused plugin says what is wrong and what to do (R6)', () => {
  it('needs a name', () => {
    expect(problems({ widths: {} })[0]?.code).toBe('E_PLUGIN_SCHEMA');
    expect(() => validate({ widths: {} })).toThrow(PluginError);
  });

  it('refuses a contract it does not speak', () => {
    const [first] = problems({ name: 'x', contract: CONTRACT + 1 });
    expect(first?.code).toBe('E_PLUGIN_CONTRACT');
    expect(first?.fix).toContain(String(CONTRACT));
  });

  it('refuses a range that runs backwards, which would otherwise match nothing and never fire', () => {
    const [first] = problems({ name: 'x', widths: { bad: { ranges: [[0xf8_ff, 0xe0_00]], columns: 2, why: 'typo' } } });
    expect(first?.line).toContain('runs backwards');
  });

  it('refuses a column count outside 0..2', () => {
    expect(problems({ name: 'x', widths: { bad: { ranges: [[1, 2]], columns: 3, why: 'why not' } } })[0]?.line).toContain('columns is 0, 1 or 2');
  });

  it('requires `why`, because a width table with no provenance cannot be audited', () => {
    const [first] = problems({ name: 'x', widths: { bad: { ranges: [[1, 2]], columns: 2 } } });
    expect(first?.line).toContain('why is required');
    expect(first?.fix).toContain('which terminal');
  });

  it('ignores every key another package in the family reads', () => {
    expect(problems({ name: 'x', spinners: { dots: {} }, tokens: { error: 'red' }, capabilities: {} })).toEqual([]);
  });
});
