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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CANCEL_SYMBOL, S_BAR_END, S_PASSWORD_MASK, S_STEP_CANCEL, S_STEP_SUBMIT } from './clack-core.js';
import { requiredMessage } from './clack-list.js';
import { confirm, groupMultiselect, multiline, multiselect, password, select, selectKey, text } from './clack-prompts.js';

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

const okOnly = (value: string | undefined): string | undefined => (value === 'ok' ? undefined : 'not ok');

const notX = (value: string | undefined): string | undefined => (value === 'x' ? 'no' : undefined);

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
    expect(shown).toContain(requiredMessage().split('\n')[0]);
    expect(shown).not.toContain('to navigate');
  });

  it('without the guide, a refusal keeps two rows for itself where the footer had one', async () => {
    // Twelve options on a twelve-row terminal: the window is cut to fit. The guideless footer is
    // one line and the refusal two, so the refused window shows one option fewer.
    const options = Array.from({ length: 12 }, (_, i) => ({ value: `option ${String(i)}` }));
    const start = (io: { input: Input; output: Output }) => multiselect({ message: 'm', options, withGuide: false, ...io, output: Object.assign(io.output, { rows: 12 }) });
    const live = await frameAfter(start, ['down']);
    const refused = await frameAfter(start, ['return']);
    expect(refused).toContain(requiredMessage().split('\n')[0]);
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

/**
 * Every escape a transcript holds, spelled so it can be read: a colour as `<36>`, a cursor move
 * or an erase as `<4A>`, `<1G>`, `<J>`. A frame compared as stripped text cannot tell a cyan bar
 * from a grey one; this can, which is how a frame's colours are held here.
 */
const shown = (text: string): string => text.replaceAll(/\u001B\[([\d;?]*)([A-Za-z])/gu, (_, parameter: string, final: string) => `<${parameter}${final === 'm' ? '' : final}>`);

/** Everything a prompt wrote while `keys` were pressed, readable. */
async function transcript<T>(start: (io: { input: Input; output: Output }) => Promise<T>, keys: string[]): Promise<string> {
  return shown((await drive(start, keys)).writes.join(''));
}

const LIST = [{ value: 'a', hint: 'first' }, { value: 'b', disabled: true, hint: 'off' }, { value: 'c', label: 'C\nsecond line' }];

describe('every prompt, frame by frame, in colour', () => {
  beforeEach(() => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('text: the placeholder, typing, the cursor moved back, and the answer', async () => {
    expect(await transcript((io) => text({ message: 'm', placeholder: 'type here', ...io }), ['a', 'b', 'left', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7>t<27><2>ype here<22>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  ab█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a<7>b<27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>ab<22>
      <?25h>"
    `);
  });

  it('text: a refusal, then an answer', async () => {
    expect(await transcript((io) => text({ message: 'm', validate: okOnly, ...io }), ['x', 'return', 'backspace', 'o', 'k', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  x█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <33>▲<39>  m
      <33>│<39>  x█
      <33>└<39>  <33>not ok<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  o█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  ok█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>ok<22>
      <?25h>"
    `);
  });

  it('text: cancelled with something typed, and with nothing', async () => {
    expect(await transcript((io) => text({ message: 'm', ...io }), ['a', 'escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>  <9><2>a<22><29>
      <90>│<39>
      <?25h>"
    `);
    expect(await transcript((io) => text({ message: 'm', ...io }), ['escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>
      <?25h>"
    `);
  });

  it('text: an empty answer shows no summary', async () => {
    expect(await transcript((io) => text({ message: 'm', ...io }), ['return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>
      <?25h>"
    `);
  });

  it('text: without the guide', async () => {
    expect(await transcript((io) => text({ message: 'm', withGuide: false, ...io }), ['a', 'return'])).toMatchInlineSnapshot(`
      "<?25l><36>◆<39>  m
      <7><8>_<28><27>

      <3A><1G><J><36>◆<39>  m
      a█

      <3A><1G><J><32>◇<39>  m
      <2>a<22>
      <?25h>"
    `);
  });

  it('password: the mask, the cursor inside it, and a refusal that clears it', async () => {
    expect(await transcript((io) => password({ message: 'm', ...io }), ['s', 'e', 'left', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  ▪<7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  ▪▪<7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  ▪<7>▪<27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>▪▪<22>
      <?25h>"
    `);
    expect(await transcript((io) => password({ message: 'm', clearOnError: true, validate: () => 'no', ...io }), ['x', 'return', 'escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  ▪<7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <33>▲<39>  m
      <33>│<39>  <7>▪<27>
      <33>└<39>  <33>no<39>
      <4A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>
      <?25h>"
    `);
  });

  it('confirm: toggled and answered, on one line and one above the other', async () => {
    expect(await transcript((io) => confirm({ message: 'm', ...io }), ['right', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>●<39> Yes <2>/<22> <2>○<22> <2>No<22>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>○<22> <2>Yes<22> <2>/<22> <32>●<39> No
      <36>└<39>
      <4A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>No<22>
      <?25h>"
    `);
    expect(await transcript((io) => confirm({ message: 'm', vertical: true, active: 'Sure', inactive: 'Nope', initialValue: false, ...io }), ['up', 'escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>○<22> <2>Sure<22>
      <36>│<39>  <32>●<39> Nope
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>●<39> Sure
      <36>│<39>  <2>○<22> <2>Nope<22>
      <36>└<39>
      <5A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>  <9><2>Sure<22><29>
      <90>│<39>
      <?25h>"
    `);
  });

  it('select: hints, a disabled option, a label over two lines, and the answer', async () => {
    expect(await transcript((io) => select({ message: 'm', options: LIST, ...io }), ['down', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>●<39> a <2>(first)<22>
      <36>│<39>  <90>○<39> <90>b<39> <2>(off)<22>
      <36>│<39>  <2>○<22> <2>C<22>
      <36>│<39>  <2>second line<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>○<22> <2>a<22>
      <36>│<39>  <90>○<39> <90>b<39> <2>(off)<22>
      <36>│<39>  <32>●<39> C
      <36>│<39>  second line
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>C
      <90>│<39>  second line<22>
      <?25h>"
    `);
    expect(await transcript((io) => select({ message: 'm', options: LIST, initialValue: 'c', showInstructions: false, withGuide: false, ...io }), ['escape'])).toMatchInlineSnapshot(`
      "<?25l><36>◆<39>  m
      <2>○<22> <2>a<22>
      <90>○<39> <90>b<39> <2>(off)<22>
      <32>●<39> C
      second line

      <6A><1G><J><31>■<39>  m
      <9><2>C
      second line<22><29>
      <?25h>"
    `);
  });

  it('selectKey: the keys, the one under the cursor, and the answer', async () => {
    expect(await transcript((io) => selectKey({ message: 'm', options: [{ value: 'a', label: 'Apple' }, { value: 'b' }], initialValue: 'b', ...io }), ['a'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <90><47><7> a <27><49><39> Apple
      <36>│<39>  <46><90> b <39><49> b
      <36>└<39>
      <5A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>Apple<22>
      <?25h>"
    `);
    expect(await transcript((io) => selectKey({ message: 'm', options: [{ value: 'a' }], ...io }), ['escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <46><90> a <39><49> a
      <36>└<39>
      <4A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>  <9><2>a<22><29>
      <90>│<39>
      <?25h>"
    `);
  });

  it('multiselect: toggled, a refusal, all and none, and the answer', async () => {
    expect(await transcript((io) => multiselect({ message: 'm', options: LIST, ...io }), ['space', 'down', 'space', 'up', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <36>◻<39> a <2>(first)<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <2>◻<22> <2>C<22>
      <36>│<39>  <2>second line<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> a <2>(first)<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <2>◻<22> <2>C<22>
      <36>│<39>  <2>second line<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>a<22> <2>(first)<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <36>◻<39> C
      <36>│<39>  second line
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>a<22> <2>(first)<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <32>◼<39> C
      <36>│<39>  second line
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> a <2>(first)<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <32>◼<39> <2>C<22>
      <36>│<39>  <2>second line<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>a, C
      <90>│<39>  second line<22>
      <?25h>"
    `);
    expect(await transcript((io) => multiselect({ message: 'm', options: LIST, cursorAt: 'c', ...io }), ['return', 'a', 'escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>◻<22> <2>a<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <36>◻<39> C
      <36>│<39>  second line
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <33>▲<39>  m
      <33>│<39>  <2>◻<22> <2>a<22>
      <33>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <33>│<39>  <36>◻<39> C
      <33>│<39>  second line
      <33>└<39>  <33>Please select at least one option.
         <0><2>Press <90><47><7> space <27><49><33> to select, <90><47><7> enter <27><49><33> to submit<22><0><39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>a<22> <2>(first)<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <32>◼<39> C
      <36>│<39>  second line
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <8A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>  <9><2>a, C
      <90>│<39>  second line<22><29>
      <90>│<39>
      <?25h>"
    `);
    expect(await transcript((io) => multiselect({ message: 'm', options: LIST, required: false, showInstructions: false, ...io }), ['return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <36>◻<39> a <2>(first)<22>
      <36>│<39>  <90>◻<39> <9><90>b<39><29> <2>(off)<22>
      <36>│<39>  <2>◻<22> <2>C<22>
      <36>│<39>  <2>second line<22>
      <36>└<39>
      <7A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>none<22>
      <?25h>"
    `);
  });

  it('groupMultiselect: a group toggled from its header, a member, and the answer', async () => {
    const options = { g1: [{ value: 'a' }, { value: 'b', hint: 'bee' }], g2: [{ value: 'c' }] };
    expect(await transcript((io) => groupMultiselect({ message: 'm', options, ...io }), ['space', 'down', 'down', 'down', 'down', 'space', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <36>◻<39> g1
      <36>│<39>  │ <2>◻<22> <2>a<22>
      <36>│<39>  └ <2>◻<22> <2>b<22>
      <36>│<39>  <2>◻<22> <2>g2<22>
      <36>│<39>  └ <2>◻<22> <2>c<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <9A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> g1
      <36>│<39>  │ <32>◼<39> <2>a<22>
      <36>│<39>  └ <32>◼<39> <2>b<22> <2>(bee)<22>
      <36>│<39>  <2>◻<22> <2>g2<22>
      <36>│<39>  └ <2>◻<22> <2>c<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <9A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>g1<22>
      <36>│<39>  │ <32>◼<39> a
      <36>│<39>  └ <32>◼<39> <2>b<22> <2>(bee)<22>
      <36>│<39>  <2>◻<22> <2>g2<22>
      <36>│<39>  └ <2>◻<22> <2>c<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <9A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>g1<22>
      <36>│<39>  │ <32>◼<39> <2>a<22>
      <36>│<39>  └ <32>◼<39> b <2>(bee)<22>
      <36>│<39>  <2>◻<22> <2>g2<22>
      <36>│<39>  └ <2>◻<22> <2>c<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <9A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>g1<22>
      <36>│<39>  │ <32>◼<39> <2>a<22>
      <36>│<39>  └ <32>◼<39> <2>b<22> <2>(bee)<22>
      <36>│<39>  <36>◻<39> g2
      <36>│<39>  └ <2>◻<22> <2>c<22>
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <9A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>g1<22>
      <36>│<39>  │ <32>◼<39> <2>a<22>
      <36>│<39>  └ <32>◼<39> <2>b<22> <2>(bee)<22>
      <36>│<39>  <2>◻<22> <2>g2<22>
      <36>│<39>  └ <36>◻<39> c
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <9A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <32>◼<39> <2>g1<22>
      <36>│<39>  │ <32>◼<39> <2>a<22>
      <36>│<39>  └ <32>◼<39> <2>b<22> <2>(bee)<22>
      <36>│<39>  <32>◼<39> <2>g2<22>
      <36>│<39>  └ <32>◼<39> c
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <9A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>a, b, c<22>
      <?25h>"
    `);
    expect(await transcript((io) => groupMultiselect({ message: 'm', options, selectableGroups: false, groupSpacing: 1, cursorAt: 'c', ...io }), ['space', 'escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  
      <36>│<39>  <2>g1<22>
      <36>│<39>    <2>◻<22> <2>a<22>
      <36>│<39>    <2>◻<22> <2>b<22>
      <36>│<39>  
      <36>│<39>  <2>g2<22>
      <36>│<39>    <36>◻<39> c
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <11A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  
      <36>│<39>  <2>g1<22>
      <36>│<39>    <2>◻<22> <2>a<22>
      <36>│<39>    <2>◻<22> <2>b<22>
      <36>│<39>  
      <36>│<39>  <2>g2<22>
      <36>│<39>    <32>◼<39> c
      <36>│<39>  <2>↑/↓<22> to navigate • <2>Space:<22> select • <2>Enter:<22> confirm
      <36>└<39>
      <11A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>  <9><2>c<22><29>
      <90>│<39>
      <?25h>"
    `);
  });

  it('multiline: lines broken by enter, the cursor on a break, and the answer', async () => {
    expect(await transcript((io) => multiline({ message: 'm', placeholder: 'write', ...io }), ['a', 'return', 'b', 'left', 'left', 'escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7>w<27><2>rite<22>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a
      <36>│<39>  █
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a
      <36>│<39>  b█
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a
      <36>│<39>  <7>b<27>
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a█
      <36>│<39>  b
      <36>└<39>
      <5A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>  <9><2>a
      <90>│<39>  b<22><29>
      <90>│<39>
      <?25h>"
    `);
    expect(await transcript((io) => multiline({ message: 'm', ...io }), ['a', 'return', 'b', 'return', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a█
      <36>└<39>
      <4A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a
      <36>│<39>  █
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a
      <36>│<39>  b█
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a
      <36>│<39>  b
      <36>│<39>  █
      <36>└<39>
      <6A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>a
      <90>│<39>  b<22>
      <?25h>"
    `);
    expect(await transcript((io) => multiline({ message: 'm', showSubmit: true, ...io }), ['a', 'tab', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <7><8>_<28><27>
      <36>│<39>  <2>[ submit ]<22>
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a█
      <36>│<39>  <2>[ submit ]<22>
      <36>└<39>
      <5A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  a█
      <36>│<39>  <36>[ submit ]<39>
      <36>└<39>
      <5A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>a<22>
      <?25h>"
    `);
  });
});

/** `count` options, each named `option N`. */
const manyOptions = (count: number): { value: string }[] => Array.from({ length: count }, (_, i) => ({ value: `option ${String(i)}` }));

/** How many rows the first frame of a select over one label `columns` wide takes. */
async function rowsFor(columns: number, withGuide: boolean): Promise<number> {
  return (await frameAfter((io) => select({ message: 'm', options: [{ value: 'x'.repeat(columns) }], withGuide, ...io }), [])).split('\n').length;
}

describe('what each prompt answers, on the keys its other cases do not press', () => {
  it('text: an answer typed and then erased is the default', async () => {
    expect((await drive((io) => text({ message: 'm', defaultValue: 'd', ...io }), ['a', 'backspace', 'return'])).answer).toBe('d');
  });

  it('password: nothing typed answers the empty string, and a cleared refusal starts the value again', async () => {
    expect((await drive((io) => password({ message: 'm', ...io }), ['return'])).answer).toBe('');
    expect((await drive((io) => password({ message: 'm', clearOnError: true, validate: notX, ...io }), ['x', 'return', 'return'])).answer).toBe('');
  });

  it('confirm: y answers yes and n answers no, whatever is shown', async () => {
    expect((await drive((io) => confirm({ message: 'm', initialValue: false, ...io }), ['y'])).answer).toBe(true);
    expect((await drive((io) => confirm({ message: 'm', ...io }), ['Y'])).answer).toBe(true);
    expect((await drive((io) => confirm({ message: 'm', ...io }), ['n'])).answer).toBe(false);
    expect((await drive((io) => confirm({ message: 'm', initialValue: false, ...io }), ['up', 'return'])).answer).toBe(true);
    expect((await drive((io) => confirm({ message: 'm', ...io }), ['x', 'return'])).answer).toBe(true);
  });

  it('select: up and left go back, wrapping to the last; right goes on', async () => {
    expect((await drive((io) => select({ message: 'm', options: OPTIONS, ...io }), ['up', 'return'])).answer).toBe('c');
    expect((await drive((io) => select({ message: 'm', options: OPTIONS, ...io }), ['left', 'return'])).answer).toBe('c');
    expect((await drive((io) => select({ message: 'm', options: OPTIONS, ...io }), ['right', 'return'])).answer).toBe('b');
  });

  it('select: an empty hint draws nothing after the label', async () => {
    expect(await frameAfter((io) => select({ message: 'm', options: [{ value: 'a', hint: '' }], ...io }), [])).toContain('● a\n');
  });

  it('select and multiselect with no options take the arrows and space without failing', async () => {
    expect((await drive((io) => select({ message: 'm', options: [], ...io }), ['down', 'escape'])).answer).toBe(CANCEL_SYMBOL);
    expect((await drive((io) => multiselect({ message: 'm', options: [], ...io }), ['space', 'down', 'escape'])).answer).toBe(CANCEL_SYMBOL);
  });

  it('select: a window on a short screen leaves the rows the title, the guide and the footer take', async () => {
    const message = 'line one\nline two';
    // 14 rows, less 2 for the message, 1 for the guide, 2 for the footer and 1 more: 8 rows of list.
    const guided = await frameAfter((io) => select({ message, options: manyOptions(20), ...io, output: Object.assign(io.output, { rows: 14 }) }), []);
    expect(listed(guided)).toBe(8);
    // Without the guide, 14 less 2, 1 for the footer and 1: 10.
    const bare = await frameAfter((io) => select({ message, options: manyOptions(20), withGuide: false, ...io, output: Object.assign(io.output, { rows: 14 }) }), []);
    expect(listed(bare)).toBe(10);
    // Without instructions, the closing guide is the footer's one row: 14 less 2, 1, 1 and 1.
    const plain = await frameAfter((io) => select({ message, options: manyOptions(20), showInstructions: false, ...io, output: Object.assign(io.output, { rows: 14 }) }), []);
    expect(listed(plain)).toBe(9);
  });

  it('select: a label wraps where the guide or its absence leaves no more room', async () => {
    // The radio and its space take two columns, and the guide three more: past that the label goes to a row of its own.
    expect(await rowsFor(76, true)).toBe((await rowsFor(75, true)) + 1);
    expect(await rowsFor(79, false)).toBe((await rowsFor(78, false)) + 1);
  });

  it('selectKey: an option keyed by the empty string is where it starts, and a key of more than one character answers nothing', async () => {
    expect((await drive((io) => selectKey({ message: 'm', options: [{ value: 'a' }, { value: '' }], ...io }), ['return'])).answer).toBe('');
    const input = new Input();
    const answer = selectKey({ message: 'm', options: [{ value: 'a' }, { value: 'b' }], input, output: new Output() });
    // Each key after the last one's turn, so a key that broke the prompt is seen before the next.
    for (const [char, name] of [[undefined, 'down'], ['ba', undefined], ['a', 'a']] as const) {
      input.emit('keypress', char, { name, sequence: char });
      // eslint-disable-next-line reliability/no-await-in-loop -- keys are pressed one at a time
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(await answer).toBe('a');
  });

  it('selectKey: the answer shown is the option pressed', async () => {
    const { last } = await drive((io) => selectKey({ message: 'm', options: [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }], ...io }), ['b']);
    expect(stripVTControlCharacters(last)).toContain('│  Banana');
  });

  it('multiselect: a cancel with nothing chosen shows nothing, an answer with nothing chosen shows none', async () => {
    const cancelled = await drive((io) => multiselect({ message: 'm', options: OPTIONS, ...io }), ['escape']);
    expect(stripVTControlCharacters(cancelled.last).trimEnd().split('\n').slice(-2)).toEqual([`${S_STEP_CANCEL}  m`, '│']);
    const none = await drive((io) => multiselect({ message: 'm', options: OPTIONS, required: false, ...io }), ['return']);
    expect(stripVTControlCharacters(none.last)).toContain('│  none');
  });

  it('groupMultiselect: a header with some members chosen chooses them all, and off again leaves other groups alone', async () => {
    const options = { g1: [{ value: 'a' }, { value: 'b' }], g2: [{ value: 'c' }] };
    expect((await drive((io) => groupMultiselect({ message: 'm', options, ...io }), ['down', 'space', 'up', 'space', 'return'])).answer).toEqual(['a', 'b']);
    expect((await drive((io) => groupMultiselect({ message: 'm', options, initialValues: ['a', 'b', 'c'], ...io }), ['space', 'return'])).answer).toEqual(['c']);
  });

  it('groupMultiselect: starts from initialValues, and refuses an empty answer by default', async () => {
    const options = { g1: [{ value: 'a' }, { value: 'b' }] };
    expect((await drive((io) => groupMultiselect({ message: 'm', options, initialValues: ['b'], ...io }), ['return'])).answer).toEqual(['b']);
    const { answer, writes } = await drive((io) => groupMultiselect({ message: 'm', options, ...io }), ['return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    expect(writes.join('')).toContain(requiredMessage().split('\n')[0]);
  });

  it('groupMultiselect: shows a member named like its group once in the answer', async () => {
    const { last } = await drive((io) => groupMultiselect({ message: 'm', options: { x: [{ value: 'x' }, { value: 'y' }] }, ...io }), ['down', 'space', 'return']);
    expect(stripVTControlCharacters(last).endsWith('│  x')).toBe(true);
  });

  it('groupMultiselect: with no options and no headers to choose, the arrows do nothing', async () => {
    expect((await drive((io) => groupMultiselect({ message: 'm', options: {}, selectableGroups: false, ...io }), ['down', 'escape'])).answer).toBe(CANCEL_SYMBOL);
  });

  it('multiline: enter in the middle of the text breaks it there, a second one too, and the first enter of a prefilled answer breaks the line', async () => {
    expect((await drive((io) => multiline({ message: 'm', ...io }), ['a', 'b', 'left', 'return', 'right', 'return', 'return'])).answer).toBe('a\nb');
    expect((await drive((io) => multiline({ message: 'm', ...io }), ['a', 'b', 'left', 'return', 'return', 'right', 'return', 'return'])).answer).toBe('a\n\nb');
    expect((await drive((io) => multiline({ message: 'm', initialValue: 'x', ...io }), ['return', 'return'])).answer).toBe('x');
  });

  it('multiline: tab moves between the text and the button as often as it is pressed', async () => {
    expect((await drive((io) => multiline({ message: 'm', showSubmit: true, ...io }), ['a', 'tab', 'tab', 'tab', 'return'])).answer).toBe('a');
  });
});

