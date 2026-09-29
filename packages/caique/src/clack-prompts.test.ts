/**
 * The typed and listed prompts in `clack-prompts.ts`, past the paths `clack.test.ts` holds
 * to clack's guide suite: the options that change how a prompt reads its keys, and what each
 * one answers. Every case checks the answer, because a prompt that draws the right frame and
 * returns the wrong value is the defect a frame comparison cannot see.
 *
 * Colour is off (`vitest-colour-setup.ts`), but `styleText` on Node 20 and 22 styles regardless,
 * so a frame read for its text has its escape sequences stripped first.
 */
import { Readable, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

import { describe, expect, it } from 'vitest';

import { CANCEL_SYMBOL, S_BAR_END, S_PASSWORD_MASK, S_STEP_CANCEL, S_STEP_SUBMIT } from './clack-core.js';
import { REQUIRED } from './clack-list.js';
import { confirm, groupMultiselect, multiline, multiselect, password, select, selectKey } from './clack-prompts.js';

class Output extends Writable {
  buffer: string[] = [];
  isTTY = false;
  columns = 80;
  rows = 30;
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.buffer.push(chunk.toString());
    done();
  }
}

class Input extends Readable {
  override _read(): void {
    // Keys arrive as emitted `keypress` events, never as data.
  }
}

const NAMED: Record<string, { char?: string; name: string; shift?: boolean }> = {
  return: { char: '\r', name: 'return' },
  escape: { char: 'escape', name: 'escape' },
  space: { char: ' ', name: 'space' },
  tab: { char: '\t', name: 'tab' },
  up: { name: 'up' },
  down: { name: 'down' },
  left: { name: 'left' },
  right: { name: 'right' },
  backspace: { char: '\u007F', name: 'backspace' },
};

/** Start a prompt, press `keys` one at a time — each after the last one's frame — and return the answer and every write. */
async function drive<T>(start: (io: { input: Input; output: Output }) => Promise<T>, keys: string[]): Promise<{ answer: T; writes: string[]; last: string }> {
  const input = new Input();
  const output = new Output();
  const answer = start({ input, output });
  for (const key of keys) {
    const known = NAMED[key];
    const event = known ?? { char: key, name: key.toLowerCase() };
    input.emit('keypress', event.char, { name: event.name, sequence: event.char, shift: event.shift });
    // eslint-disable-next-line reliability/no-await-in-loop -- keys are pressed one at a time, each after the last one's frame
    await new Promise((resolve) => setImmediate(resolve));
  }
  const settled = await answer;
  // The last frame is the one before the closing newline and the cursor shown again.
  return { answer: settled, writes: output.buffer, last: output.buffer.at(-3) ?? '' };
}

/** The frame a prompt shows after `keys`, while it is still open: the last write before `escape`. */
async function frameAfter(start: (io: { input: Input; output: Output }) => Promise<unknown>, keys: string[]): Promise<string> {
  const { writes } = await drive(start, [...keys, 'escape']);
  return stripVTControlCharacters(writes.at(-4) ?? '');
}

const OPTIONS = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];

const onlyRight = (value: string | undefined): string | undefined => (value === 'right' ? undefined : 'wrong');

const onlyNoright = (value: string | undefined): string | undefined => (value === 'noright' ? undefined : 'wrong');

/** How many rows of a frame are list rows: an option, or the ellipsis standing for more. */
const listed = (shown: string): number => shown.split('\n').filter((row) => row.includes('option ') || row.includes('...')).length;

describe('password', () => {
  it('draws the mask and answers what was typed', async () => {
    const { answer, writes } = await drive((io) => password({ message: 'pw', ...io }), ['s', 'e', 'c', 'return']);
    expect(answer).toBe('sec');
    expect(writes.join('')).toContain(S_PASSWORD_MASK.repeat(3));
    expect(writes.join('')).not.toContain('sec');
  });

  it('a custom mask replaces the default one', async () => {
    const { writes } = await drive((io) => password({ message: 'pw', mask: '*', ...io }), ['a', 'b', 'return']);
    expect(writes.join('')).toContain('**');
  });

  it('with the cursor moved back into the mask, the next key is inserted there', async () => {
    const { answer } = await drive((io) => password({ message: 'pw', ...io }), ['a', 'c', 'left', 'b', 'return']);
    expect(answer).toBe('abc');
    // At the end the mask is followed by a hidden cell; moved into it, the mask stands alone.
    expect(await frameAfter((io) => password({ message: 'pw', ...io }), ['a', 'c'])).toContain(`│  ${S_PASSWORD_MASK.repeat(2)}_\n`);
    expect(await frameAfter((io) => password({ message: 'pw', ...io }), ['a', 'c', 'left'])).toContain(`│  ${S_PASSWORD_MASK.repeat(2)}\n`);
  });

  it('clearOnError empties the field when the validator refuses it', async () => {
    const { answer } = await drive((io) => password({ message: 'pw', clearOnError: true, validate: onlyRight, ...io }), ['n', 'o', 'return', 'r', 'i', 'g', 'h', 't', 'return']);
    // Without the clear, the second attempt would be typed after the first: `noright`.
    expect(answer).toBe('right');
  });

  it('keeps what was typed after a refusal when clearOnError is off', async () => {
    const { answer } = await drive((io) => password({ message: 'pw', validate: onlyNoright, ...io }), ['n', 'o', 'return', 'r', 'i', 'g', 'h', 't', 'return']);
    expect(answer).toBe('noright');
  });
});

describe('confirm', () => {
  it('draws the two answers one above the other when vertical', async () => {
    const shown = await frameAfter((io) => confirm({ message: 'ok?', vertical: true, ...io }), []);
    const rows = shown.split('\n');
    expect(rows.findIndex((row) => row.includes('Yes'))).toBe(rows.findIndex((row) => row.includes('No')) - 1);
  });

  it('draws them on one line otherwise', async () => {
    const shown = await frameAfter((io) => confirm({ message: 'ok?', ...io }), []);
    expect(shown.split('\n').some((row) => row.includes('Yes') && row.includes('No'))).toBe(true);
  });
});

describe('select', () => {
  it('starts on the first enabled option when the initial one is disabled', async () => {
    const options = [{ value: 'a', disabled: true }, { value: 'b' }];
    const { answer } = await drive((io) => select({ message: 'm', options, initialValue: 'a', ...io }), ['return']);
    expect(answer).toBe('b');
  });

  it('without instructions draws the plain closing guide under the list', async () => {
    const shown = await frameAfter((io) => select({ message: 'm', options: OPTIONS, showInstructions: false, ...io }), []);
    expect(shown).not.toContain('to navigate');
    expect(shown.trimEnd().split('\n').at(-1)).toBe(S_BAR_END);
  });

  it('with no options answers nothing and shows no summary', async () => {
    const { answer, last } = await drive((io) => select({ message: 'm', options: [], ...io }), ['return']);
    expect(answer).toBeUndefined();
    expect(last.trimEnd().split('\n').slice(-2)).toEqual([`${S_STEP_SUBMIT}  m`, '│']);
  });
});

describe('selectKey', () => {
  const options = [{ value: 'Apple' }, { value: 'banana' }];

  it('answers the option whose first letter was pressed, ignoring case by default', async () => {
    expect((await drive((io) => selectKey({ message: 'm', options, ...io }), ['a'])).answer).toBe('Apple');
  });

  it('with caseSensitive, a lower-case key does not answer an upper-case option', async () => {
    const { answer } = await drive((io) => selectKey({ message: 'm', options, caseSensitive: true, ...io }), ['a', 'A']);
    expect(answer).toBe('Apple');
    const lower = await drive((io) => selectKey({ message: 'm', options, caseSensitive: true, ...io }), ['a', 'escape']);
    expect(lower.answer).toBe(CANCEL_SYMBOL);
  });

  it('ignores a key no option answers to, and stays open', async () => {
    const { answer } = await drive((io) => selectKey({ message: 'm', options, ...io }), ['z', 'b']);
    expect(answer).toBe('banana');
  });

  it('with no options, a cancel shows no summary', async () => {
    const { answer, last } = await drive((io) => selectKey({ message: 'm', options: [], ...io }), ['escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    expect(last.trimEnd().split('\n').slice(-2)).toEqual([`${S_STEP_CANCEL}  m`, '│']);
  });
});

describe('multiselect', () => {
  it('`a` selects every enabled option, and again clears them all', async () => {
    const options = [{ value: 'a' }, { value: 'b', disabled: true }, { value: 'c' }];
    expect((await drive((io) => multiselect({ message: 'm', options, ...io }), ['a', 'return'])).answer).toEqual(['a', 'c']);
    expect((await drive((io) => multiselect({ message: 'm', options, required: false, ...io }), ['a', 'a', 'return'])).answer).toEqual([]);
  });

  it('`i` inverts the selection over the enabled options', async () => {
    const { answer } = await drive((io) => multiselect({ message: 'm', options: OPTIONS, ...io }), ['space', 'i', 'return']);
    expect(answer).toEqual(['b', 'c']);
  });

  it('space toggles an option off again', async () => {
    const { answer } = await drive((io) => multiselect({ message: 'm', options: OPTIONS, initialValues: ['a'], required: false, ...io }), ['space', 'return']);
    expect(answer).toEqual([]);
  });

  it('a required empty answer is refused with the instructions, which replace the footer', async () => {
    const shown = await frameAfter((io) => multiselect({ message: 'm', options: OPTIONS, ...io }), ['return']);
    expect(shown).toContain(REQUIRED.split('\n')[0]);
    expect(shown).not.toContain('to navigate');
  });

  it('without the guide, a refusal keeps two rows for itself where the footer had one', async () => {
    // Twelve options on a twelve-row terminal: the window is cut to fit. The guideless footer is
    // one line and the refusal two, so the refused window shows one option fewer.
    const options = Array.from({ length: 12 }, (_, i) => ({ value: `option ${String(i)}` }));
    const start = (io: { input: Input; output: Output }) => multiselect({ message: 'm', options, withGuide: false, ...io, output: Object.assign(io.output, { rows: 12 }) });
    const live = await frameAfter(start, ['down']);
    const refused = await frameAfter(start, ['return']);
    expect(refused).toContain(REQUIRED.split('\n')[0]);
    expect(listed(refused)).toBe(listed(live) - 1);
  });

  it('draws a disabled option struck out, with its hint', async () => {
    const options = [{ value: 'a' }, { value: 'b', disabled: true, hint: 'not now' }];
    const shown = await frameAfter((io) => multiselect({ message: 'm', options, ...io }), []);
    expect(shown).toContain('b (not now)');
  });

  it('without instructions draws the closing guide instead', async () => {
    const shown = await frameAfter((io) => multiselect({ message: 'm', options: OPTIONS, showInstructions: false, ...io }), []);
    expect(shown).not.toContain('to navigate');
    expect(shown.trimEnd().split('\n').at(-1)).toBe(S_BAR_END);
  });
});

describe('groupMultiselect', () => {
  const options = { fruit: [{ value: 'apple' }, { value: 'pear' }], veg: [{ value: 'kale' }] };

  it('a group header toggles all of its members on, and then off', async () => {
    expect((await drive((io) => groupMultiselect({ message: 'm', options, ...io }), ['space', 'return'])).answer).toEqual(['apple', 'pear']);
    expect((await drive((io) => groupMultiselect({ message: 'm', options, required: false, ...io }), ['space', 'space', 'return'])).answer).toEqual([]);
  });

  it('when groups cannot be chosen, the cursor starts on the first member and steps over headers', async () => {
    // apple → pear → (veg) kale → (fruit) apple: both headers are stepped over, the second after wrapping.
    const { answer } = await drive((io) => groupMultiselect({ message: 'm', options, selectableGroups: false, ...io }), ['down', 'down', 'down', 'space', 'return']);
    expect(answer).toEqual(['apple']);
    const first = await drive((io) => groupMultiselect({ message: 'm', options, selectableGroups: false, ...io }), ['space', 'return']);
    expect(first.answer).toEqual(['apple']);
  });

  it('draws unselectable headers without a checkbox, and members indented without a branch', async () => {
    const shown = await frameAfter((io) => groupMultiselect({ message: 'm', options, selectableGroups: false, ...io }), []);
    const rows = shown.split('\n');
    // Selectable, these read `◻ fruit`, `│ ◻ apple` and `└ ◻ pear`.
    expect(rows).toContain('│  fruit');
    expect(rows).toContain('│    ◻ pear');
  });

  it('with no options, space does nothing and the answer is empty', async () => {
    const { answer } = await drive((io) => groupMultiselect({ message: 'm', options: {}, required: false, ...io }), ['space', 'return']);
    expect(answer).toEqual([]);
  });
});

describe('multiline', () => {
  it('up keeps the column where the line above is long enough, and down stops at the end of a shorter line', async () => {
    // `abc` / `de`: up from the end of `de` lands before `c`; down from after the `X` stops at the end of `de`.
    const { answer } = await drive((io) => multiline({ message: 'm', ...io }), ['a', 'b', 'c', 'return', 'd', 'e', 'up', 'X', 'down', 'Y', 'return', 'return']);
    expect(answer).toBe('abXc\ndeY');
  });

  it('down from the last line stays on it', async () => {
    const { answer } = await drive((io) => multiline({ message: 'm', ...io }), ['a', 'return', 'b', 'down', 'Z', 'return', 'return']);
    expect(answer).toBe('a\nbZ');
  });

  it('draws the cursor on a line break as a block at the end of that line', async () => {
    const shown = await frameAfter((io) => multiline({ message: 'm', ...io }), ['a', 'return', 'b', 'up']);
    expect(shown).toContain('a█');
  });

  it('with showSubmit, enter always breaks the line and tab moves to the button, which enter presses', async () => {
    const { answer, writes } = await drive((io) => multiline({ message: 'm', showSubmit: true, ...io }), ['a', 'return', 'return', 'b', 'tab', 'return']);
    expect(answer).toBe('a\n\nb');
    expect(writes.join('')).toContain('[ submit ]');
  });

  it('tab back from the button returns to the text, where enter breaks the line again', async () => {
    const { answer } = await drive((io) => multiline({ message: 'm', showSubmit: true, ...io }), ['a', 'tab', 'tab', 'return', 'b', 'tab', 'return']);
    expect(answer).toBe('a\nb');
  });

  it('tab without showSubmit does nothing', async () => {
    const { answer } = await drive((io) => multiline({ message: 'm', ...io }), ['a', 'tab', 'return', 'return']);
    expect(answer).toBe('a');
  });

  it('a cancel before anything is typed shows no summary', async () => {
    const { answer, last } = await drive((io) => multiline({ message: 'm', ...io }), ['escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    expect(last.trimEnd().split('\n').slice(-2)).toEqual([`${S_STEP_CANCEL}  m`, '│']);
  });
});
