/**
 * What boxen's own suite does not cover.
 *
 * `flagstaff/boxen` is graded 213 / 213 by boxen 9.0.0's own suite, and that is the gate. This
 * file exists because mutations of the port can leave that gate **green** — deleting the
 * invalid-colour `throw`, breaking the odd-remainder branch of centred title placement — and a
 * mutation that does not turn the suite red is behaviour the suite does not test.
 *
 * Every expectation below was taken from **real boxen 9.0.0** (`COLUMNS=60`, no colour) rather
 * than written by hand, so these are still boxen's answers and not ours — the package itself is
 * not imported here, because flagstaff depends on nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import boxen, { _borderStyles } from './boxen.js';

/** boxen reads stdout, then stderr, then `COLUMNS`; a worker's streams are pipes and have none. */
const columnsOn = (stream: NodeJS.WriteStream, columns: number | undefined): void => {
  Object.defineProperty(stream, 'columns', { value: columns, configurable: true, writable: true });
};

beforeEach(() => {
  columnsOn(process.stdout, undefined);
  columnsOn(process.stderr, undefined);
  vi.stubEnv('COLUMNS', '60');
});

afterEach(() => {
  Reflect.deleteProperty(process.stdout, 'columns');
  Reflect.deleteProperty(process.stderr, 'columns');
  vi.unstubAllEnvs();
});

describe('a colour that is not a colour is refused', () => {
  it.each([
    ['borderColor', { borderColor: 'nope' }],
    ['backgroundColor', { backgroundColor: 'nope' }],
    ['titleColor', { titleColor: 'nope' }],
    ['borderBackgroundColor', { borderBackgroundColor: 'nope' }],
  ])('throws on an unknown %s, naming it', (name, options) => {
    expect(() => boxen('x', options)).toThrow(`nope is not a valid ${name}`);
  });

  it('accepts a six- and a three-digit hex', () => {
    expect(boxen('x', { borderColor: '#ff0000', backgroundColor: '#00ff00' })).toBe('┌─┐\n│x│\n└─┘');
    expect(boxen('x', { borderColor: '#f00' })).toBe('┌─┐\n│x│\n└─┘');
  });

  /**
   * boxen 8's hex test was `/^#(?:[0-f]{3}){1,2}$/i`, whose `[0-f]` is the range from `0` to
   * `f` and took in `:;<=>?@` and `A-Z`; 8 drew a box for `#GGG`. 9 tests real hex and throws,
   * and so does this, because a façade is its incumbent's current behaviour.
   */
  it.each(['#:::', '#GGG'])('refuses %s, as boxen 9 does — it is not hex', (color) => {
    expect(() => boxen('x', { borderColor: color })).toThrow(`${color} is not a valid borderColor`);
  });

  it('refuses a chalk name that is not a foreground colour', () => {
    expect(() => boxen('x', { borderColor: 'bgRed' })).toThrow('bgRed is not a valid borderColor');
  });
});

describe('a centred title', () => {
  /** An odd remainder cannot split evenly, so one column comes off the left. */
  it('takes one character off the left when the remainder is odd', () => {
    expect(boxen('x', { title: 'ab', titleAlignment: 'center', width: 11 })).toBe('┌── ab ───┐\n│x        │\n└─────────┘');
  });

  it('splits evenly when it can', () => {
    expect(boxen('x', { title: 'ab', titleAlignment: 'center', width: 12 })).toBe('┌─── ab ───┐\n│x         │\n└──────────┘');
  });
});

describe('borderStyle', () => {
  it('none draws no border at all, not an empty one', () => {
    expect(boxen('hi', { borderStyle: 'none' })).toBe('hi');
  });

  it('takes the sides over the deprecated `vertical` and `horizontal`, which are only a fallback', () => {
    const style = { vertical: '|', horizontal: '-', topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', left: '?', right: '?', top: '?', bottom: '?' };
    expect(boxen('hi', { borderStyle: style })).toBe('+??+\n?hi?\n+??+');
    const { left: _l, right: _r, top: _t, bottom: _b, ...retro } = style;
    expect(boxen('hi', { borderStyle: retro as never })).toBe('+--+\n|hi|\n+--+');
  });

  it('refuses a name it does not know', () => {
    expect(() => boxen('x', { borderStyle: 'hexagon' })).toThrow('Invalid border style: hexagon');
  });

  it('refuses an object missing a side, naming the first', () => {
    expect(() => boxen('x', { borderStyle: { topLeft: '+' } as never })).toThrow('Invalid border style: topRight');
  });

  it('draws a corner wider than its side and an empty side as a space', () => {
    const style = { topLeft: '<<', topRight: '>>', bottomLeft: '+', bottomRight: '+', left: '', right: '||', top: '', bottom: '══' };
    expect(boxen('x', { borderStyle: style })).toBe('<<>>\n x||\n+══+');
  });
});

describe('what a terminal would draw', () => {
  it('writes a tab as a space, lets a backspace overtype, and drops a cursor move but keeps a style', () => {
    expect(boxen('a\tb\u0008c\u001B[2Jd\u001B[31me\u001B[39m\r\nf')).toBe('┌─────┐\n│a cd\u001B[31me\u001B[39m│\n│f    │\n└─────┘');
  });

  it('never lets a backspace remove a line break, or reach back past the start', () => {
    expect(boxen('\u0008a\n\u0008b')).toBe('┌─┐\n│a│\n│b│\n└─┘');
  });

  it('keeps a hyperlink and drops another terminal command', () => {
    expect(boxen('\u001B]8;;http://x\u0007link\u001B]8;;\u0007 \u001B]0;title\u0007z')).toBe('┌──────┐\n│\u001B]8;;http://x\u0007link\u001B]8;;\u0007 z│\n└──────┘');
  });
});

describe('sizes', () => {
  it('fills the size a fullscreen callback returns', () => {
    expect(boxen('x', { fullscreen: () => [10, 4] })).toBe('┌────────┐\n│x       │\n│        │\n└────────┘');
  });

  it('gives each label a row of its own when there is no border', () => {
    expect(boxen('x', { fullscreen: () => [10, 6], borderStyle: 'none', title: 't', footer: 'f' })).toBe('t         \nx         \n          \n          \n          \nf         ');
    expect(boxen('a\nb\nc', { borderStyle: 'none', height: 3, title: 't', footer: 'f' })).toBe('t\na\nf');
  });

  it('takes a size written as a string, and ignores spacing that is not a whole number', () => {
    expect(boxen('abc', { width: '6' })).toBe('┌────┐\n│abc │\n└────┘');
    expect(boxen('x', { padding: { left: 'a' as never, right: 2.7, top: -1 } })).toBe('┌───┐\n│x  │\n└───┘');
  });

  it('crops the text, not the padding, to a height', () => {
    expect(boxen('a\nb\nc\nd', { height: 4, padding: { top: 1 } })).toBe('┌─┐\n│ │\n│a│\n└─┘');
  });

  it('caps a growing box at maxWidth', () => {
    expect(boxen('hello world foo bar', { maxWidth: 10 })).toBe('┌───────┐\n│hello  │\n│world  │\n│foo bar│\n└───────┘');
  });

  it('widens a row for a character wider than the box', () => {
    expect(boxen('古古古', { width: 3 })).toBe('┌──┐\n│古│\n│古│\n│古│\n└──┘');
  });

  it('draws an empty text as one blank row', () => {
    expect(boxen('')).toBe('┌─┐\n│ │\n└─┘');
  });
});

describe('margins and float', () => {
  it('centres and right-aligns a floated box, which keeps its rows of margin', () => {
    expect(boxen('x', { float: 'center', margin: 1 })).toBe(`\n${' '.repeat(28)}┌─┐\n${' '.repeat(28)}│x│\n${' '.repeat(28)}└─┘\n`);
    expect(boxen('x', { float: 'right', margin: 1 })).toBe(`\n${' '.repeat(54)}┌─┐\n${' '.repeat(54)}│x│\n${' '.repeat(54)}└─┘\n`);
  });

  it('shrinks a one-sided margin that would push the box past the terminal', () => {
    const row = '─'.repeat(58);
    expect(boxen('x'.repeat(58), { margin: { left: 4 } })).toBe(`┌${row}┐\n│${'x'.repeat(58)}│\n└${row}┘`);
    expect(boxen('x', { width: 60, margin: { left: 4 } })).toBe(`┌${row}┐\n│x${' '.repeat(57)}│\n└${row}┘`);
    expect(boxen('x', { width: 60, margin: { left: 4 }, float: 'right' })).toBe(`┌${row}┐\n│x${' '.repeat(57)}│\n└${row}┘`);
  });

  it('falls back to 80 columns with no stream and no COLUMNS', () => {
    vi.stubEnv('COLUMNS', undefined);
    expect(boxen('x', { float: 'right' }).split('\n')[0]).toBe(`${' '.repeat(77)}┌─┐`);
  });

  it('reads stdout first, then stderr', () => {
    columnsOn(process.stderr, 20);
    expect(boxen('x', { float: 'right' }).split('\n')[0]).toBe(`${' '.repeat(17)}┌─┐`);
    columnsOn(process.stdout, 10);
    expect(boxen('x', { float: 'right' }).split('\n')[0]).toBe(`${' '.repeat(7)}┌─┐`);
  });
});

describe('labels and alignment', () => {
  it('aligns the rows to the widest, then the block in the box', () => {
    expect(boxen('ab\nabcd', { textAlignment: 'center', width: 10 })).toBe('┌────────┐\n│   ab   │\n│  abcd  │\n└────────┘');
    expect(boxen('ab\nabcd', { textAlignment: 'right', width: 10 })).toBe('┌────────┐\n│      ab│\n│    abcd│\n└────────┘');
  });

  it('places a title and a footer to the right', () => {
    expect(boxen('xyz', { footer: 'f', footerAlignment: 'right', titleAlignment: 'right', title: 't' })).toBe('┌ t ┐\n│xyz│\n└ f ┘');
  });

  it('draws nothing for an empty title or footer', () => {
    expect(boxen('x', { footer: '', title: '' })).toBe('┌─┐\n│x│\n└─┘');
  });
});

describe('the border background', () => {
  it('inherits nothing when there is no background, and an explicit undefined means none', () => {
    expect(boxen('x', { borderBackgroundColor: 'inherit' })).toBe('┌─┐\n│x│\n└─┘');
    expect(boxen('x', { backgroundColor: 'red', borderBackgroundColor: undefined })).toBe('┌─┐\n│x│\n└─┘');
  });

  it('takes a colour of its own beside a dimmed border and a title colour', () => {
    expect(boxen('x', { borderBackgroundColor: 'red', dimBorder: true, titleColor: '#f00', title: 'z' })).toBe('┌ z ┐\n│x  │\n└───┘');
  });
});

describe('_borderStyles', () => {
  it('carries cli-boxes 4 whole, because boxen re-exports it as public surface', () => {
    expect(Object.keys(_borderStyles).sort()).toEqual(['arrow', 'bold', 'classic', 'double', 'doubleSingle', 'round', 'single', 'singleDouble']);
  });

  it('is the same data the drawing uses — a style from it draws that style', () => {
    expect(boxen('x', { borderStyle: 'arrow' }).startsWith(_borderStyles['arrow']?.topLeft ?? '')).toBe(true);
  });
});
