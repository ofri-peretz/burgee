/**
 * The searchable prompts in `clack-search.ts` — `autocomplete`, `autocompleteMultiselect` and
 * `path` — past the paths `clack.test.ts` holds: where the cursor starts, what a search with no
 * match answers, what tab completes, and what each one refuses. Every case checks the answer.
 *
 * Colour is off (`vitest-colour-setup.ts`), so frames are compared as text.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { CANCEL_SYMBOL } from './clack-core.js';
import { findCursor, requiredMessage } from './clack-list.js';
import { autocomplete, autocompleteMultiselect, path } from './clack-search.js';

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

const NAMED: Record<string, { char?: string; name: string }> = {
  return: { char: '\r', name: 'return' },
  escape: { char: 'escape', name: 'escape' },
  space: { char: ' ', name: 'space' },
  tab: { char: '\t', name: 'tab' },
  up: { name: 'up' },
  down: { name: 'down' },
};

/** Start a prompt, press `keys` one at a time, and return its answer and every write. */
async function drive<T>(start: (io: { input: Input; output: Output }) => Promise<T>, keys: string[]): Promise<{ answer: T; writes: string[] }> {
  const input = new Input();
  const output = new Output();
  const answer = start({ input, output });
  for (const key of keys) {
    const event = NAMED[key] ?? { char: key, name: key };
    input.emit('keypress', event.char, { name: event.name, sequence: event.char });
    // eslint-disable-next-line reliability/no-await-in-loop -- keys are pressed one at a time, each after the last one's frame
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { answer: await answer, writes: output.buffer };
}

const scratch = scratchDirs();

/** A filter that matches only the search `x`. */
const onlyX = (search: string): boolean => search === 'x';

const FRUIT = [{ value: 'apple' }, { value: 'banana' }, { value: 'cherry' }];

const notApple = (value: string | string[] | undefined): string | undefined => (value === 'apple' ? 'not apple' : undefined);

const notTs = (value: string | undefined): string | undefined => (value?.endsWith('.ts') === true ? 'not a .ts file' : undefined);

describe('autocomplete', () => {
  it('starts on the initial value when it is one of the options', async () => {
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, initialValue: 'cherry', ...io }), ['return'])).answer).toBe('cherry');
  });

  it('selects nothing for an initial value that is not an option, as clack does, until the arrows move', async () => {
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, initialValue: 'durian', ...io }), ['return'])).answer).toBeUndefined();
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, initialValue: 'durian', ...io }), ['down', 'return'])).answer).toBe('banana');
  });

  it('up from the first option wraps to the last', async () => {
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, ...io }), ['up', 'return'])).answer).toBe('cherry');
  });

  it('a search nothing matches says so, and answers nothing', async () => {
    const { answer, writes } = await drive((io) => autocomplete({ message: 'm', options: FRUIT, ...io }), ['z', 'return']);
    expect(answer).toBeUndefined();
    expect(writes.join('')).toContain('No matches found');
    expect(writes.join('')).toContain('(0 matches)');
  });

  it('a search whose only match is disabled focuses nothing', async () => {
    const options = [{ value: 'apple' }, { value: 'banana', disabled: true }];
    expect((await drive((io) => autocomplete({ message: 'm', options, ...io }), ['n', 'return'])).answer).toBeUndefined();
  });

  /**
   * A search whose first match is disabled. `refilter` asks `findCursor` for the option at `at`
   * itself — a step of 0 — and the disabled one sent it on with `Math.sign(0)`, which is 0 again:
   * the same index forever, and a `RangeError` on the keystroke. Upstream searches forward.
   */
  it('a search whose first match is disabled lands on the next enabled one', async () => {
    const options = [{ value: 'cherry' }, { value: 'apricot', disabled: true }, { value: 'avocado' }];
    expect((await drive((io) => autocomplete({ message: 'm', options, ...io }), ['a', 'return'])).answer).toBe('avocado');
  });

  /**
   * `findCursor` itself, with an enabled option on both sides of the disabled one, so the
   * direction it searches in decides where it lands: a step of 0 or 1 goes forward, as upstream
   * does, and a step of -1 keeps going backward past the disabled one.
   */
  it.each([
    [0, 1, 2],
    [1, 0, 2],
    [-1, 2, 0],
  ])('findCursor with step %i from %i over a disabled option lands on %i', (step, from, landed) => {
    const options = [{ value: 'apple' }, { value: 'apricot', disabled: true }, { value: 'avocado' }];
    expect(findCursor(from, step, options)).toBe(landed);
  });

  it('counts one match in the singular', async () => {
    const { writes } = await drive((io) => autocomplete({ message: 'm', options: FRUIT, ...io }), ['c', 'return']);
    expect(writes.join('')).toContain('(1 match)');
  });

  it("the caller's validator judges the answer", async () => {
    const { answer, writes } = await drive((io) => autocomplete({ message: 'm', options: FRUIT, validate: notApple, ...io }), ['return', 'down', 'return']);
    expect(writes.join('')).toContain('not apple');
    expect(answer).toBe('banana');
  });
});

describe('tab', () => {
  it('types the placeholder into an empty search when an option matches it', async () => {
    const { answer, writes } = await drive((io) => autocomplete({ message: 'm', options: FRUIT, placeholder: 'ban', ...io }), ['tab', 'return']);
    expect(writes.at(-4)).toContain('Search: ban');
    expect(answer).toBe('banana');
  });

  it('types nothing when no option matches the placeholder', async () => {
    const { answer } = await drive((io) => autocomplete({ message: 'm', options: FRUIT, placeholder: 'kiwi', ...io }), ['tab', 'return']);
    expect(answer).toBe('apple');
  });

  it('an empty placeholder completes nothing, so in a multiple search tab still toggles', async () => {
    const { answer } = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, placeholder: '', ...io }), ['tab', 'return']);
    expect(answer).toEqual(['apple']);
  });

  it('types the placeholder when the options are a function, whatever it matches', async () => {
    // A function of what is typed filters for itself, so there is no filter to ask.
    const seen: string[] = [];
    function options(this: { readonly userInput: string }) {
      seen.push(this.userInput);
      return FRUIT;
    }
    const { answer } = await drive((io) => autocomplete({ message: 'm', options, placeholder: 'kiwi', ...io }), ['tab', 'return']);
    expect(seen).toContain('kiwi');
    expect(answer).toBe('apple');
  });

  it('with completeOnTab, types the focused option in, and nothing when nothing is focused', async () => {
    const shown = await drive((io) => autocomplete({ message: 'm', options: FRUIT, completeOnTab: true, ...io }), ['down', 'tab', 'escape']);
    expect(shown.writes.at(-4)).toContain('Search: banana');
    const none = await drive((io) => autocomplete({ message: 'm', options: FRUIT, completeOnTab: true, ...io }), ['z', 'tab', 'escape']);
    expect(none.writes.at(-4)).toContain('Search: z');
  });
});

describe('autocompleteMultiselect', () => {
  it('starts with the initial values chosen, and the cursor on the last of them', async () => {
    const { answer } = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, initialValues: ['apple', 'cherry'], ...io }), ['tab', 'return']);
    // Tab toggled the option under the cursor — `cherry` — off.
    expect(answer).toEqual(['apple']);
  });

  it('a search whose first match is disabled puts the cursor on the next enabled one', async () => {
    const options = [{ value: 'cherry' }, { value: 'apricot', disabled: true }, { value: 'avocado' }];
    const { answer } = await drive((io) => autocompleteMultiselect({ message: 'm', options, ...io }), ['a', 'tab', 'return']);
    expect(answer).toEqual(['avocado']);
  });

  it('tab with nothing matching toggles nothing', async () => {
    const { answer } = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, required: false, ...io }), ['z', 'tab', 'return']);
    expect(answer).toEqual([]);
  });

  it('required refuses an empty answer, and the refusal replaces the instructions', async () => {
    const { answer, writes } = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, required: true, ...io }), ['return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    const refused = writes.at(-4) ?? '';
    expect(refused).toContain(requiredMessage().split('\n')[0]);
    expect(refused).not.toContain('to search');
    // The list keeps its rows while the footer is gone.
    expect(refused).toContain('cherry');
  });
});

describe('a refusal in a short terminal', () => {
  it('without the guide, keeps two rows for itself where the footer had one', async () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ value: `option ${String(i)}` }));
    const rows = 8;
    const { writes } = await drive((io) => autocompleteMultiselect({ message: 'm', options, required: true, withGuide: false, ...io, output: Object.assign(io.output, { rows }) }), ['return', 'escape']);
    const refused = writes.at(-4) ?? '';
    expect(refused).toContain(requiredMessage().split('\n')[0]);
    expect(refused.replace(/^\u001B\[\d*A?\u001B\[1G\u001B\[J/u, '').trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
  });
});

describe('path', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));

  it('refuses to answer when nothing under what was typed is focused', async () => {
    const { answer, writes } = await drive((io) => path({ message: 'm', initialValue: `${here}no-such-entry`, ...io }), ['return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    expect(writes.join('')).toContain('Please select a path');
  });

  it("hands a path to the caller's validator", async () => {
    const { answer, writes } = await drive((io) => path({ message: 'm', initialValue: `${here}clack-core`, validate: notTs, ...io }), ['return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    expect(writes.join('')).toContain('not a .ts file');
  });
});

/** Every escape a transcript holds, spelled so it can be read: a colour as `<36>`, a move or an erase as `<4A>`, `<1G>`, `<J>`. */
const shown = (text: string): string => text.replaceAll(/\u001B\[([\d;?]*)([A-Za-z])/gu, (_, parameter: string, final: string) => `<${parameter}${final === 'm' ? '' : final}>`);

/** Everything a search wrote while `keys` were pressed, readable. */
async function transcript<T>(start: (io: { input: Input; output: Output }) => Promise<T>, keys: string[]): Promise<string> {
  return shown((await drive(start, keys)).writes.join(''));
}

describe('every search, frame by frame, in colour', () => {
  beforeEach(() => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('autocomplete: typed, narrowed, moved, and answered by its label', async () => {
    const options = [{ value: 'apple', hint: 'red' }, { value: 'banana', label: 'Banana' }, { value: 'cherry', disabled: true }];
    expect(await transcript((io) => autocomplete({ message: 'm', options, placeholder: 'fruit', ...io }), ['a', 'n', 'down', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> <7>f<27><2>ruit<22>
      <36>│<39>  <32>●<39> apple <2>(red)<22>
      <36>│<39>  <2>○<22> <2>Banana<22>
      <36>│<39>  <90>○<39> <90>cherry<39>
      <36>│<39>  <2>↑/↓<22> to select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> a█<2> (2 matches)<22>
      <36>│<39>  <32>●<39> apple <2>(red)<22>
      <36>│<39>  <2>○<22> <2>Banana<22>
      <36>│<39>  <2>↑/↓<22> to select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <7A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> an█<2> (1 match)<22>
      <36>│<39>  <32>●<39> Banana
      <36>│<39>  <2>↑/↓<22> to select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <6A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>Banana<22>
      <?25h>"
    `);
  });

  it('autocomplete: a search that matches nothing, then cancelled', async () => {
    expect(await transcript((io) => autocomplete({ message: 'm', options: FRUIT, initialUserInput: 'zz', ...io }), ['escape'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> zz█<2> (0 matches)<22>
      <36>│<39>  <33>No matches found<39>
      <36>│<39>  <2>↑/↓<22> to select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <6A><1G><J><90>│<39>
      <31>■<39>  m
      <90>│<39>
      <?25h>"
    `);
  });

  it('autocompleteMultiselect: toggled with tab and space, counted once answered', async () => {
    expect(await transcript((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, ...io }), ['tab', 'down', 'space', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> <7><8>_<28><27>
      <36>│<39>  <36>◻<39> apple
      <36>│<39>  <2>◻<22> <2>banana<22>
      <36>│<39>  <2>◻<22> <2>cherry<22>
      <36>│<39>  <2>↑/↓<22> to select • <2>Tab:<22> select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> <7><8>_<28><27>
      <36>│<39>  <32>◼<39> apple
      <36>│<39>  <2>◻<22> <2>banana<22>
      <36>│<39>  <2>◻<22> <2>cherry<22>
      <36>│<39>  <2>↑/↓<22> to select • <2>Tab:<22> select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> <7><8>_<28><27>
      <36>│<39>  <32>◼<39> <2>apple<22>
      <36>│<39>  <36>◻<39> banana
      <36>│<39>  <2>◻<22> <2>cherry<22>
      <36>│<39>  <2>↑/↓<22> to select • <2>Tab:<22> select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> <7><8>_<28><27>
      <36>│<39>  <32>◼<39> <2>apple<22>
      <36>│<39>  <32>◼<39> banana
      <36>│<39>  <2>◻<22> <2>cherry<22>
      <36>│<39>  <2>↑/↓<22> to select • <2>Tab:<22> select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <8A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>2 items selected<22>
      <?25h>"
    `);
    expect(await transcript((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, initialValues: ['banana'], ...io }), ['return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> <7><8>_<28><27>
      <36>│<39>  <2>◻<22> <2>apple<22>
      <36>│<39>  <32>◼<39> banana
      <36>│<39>  <2>◻<22> <2>cherry<22>
      <36>│<39>  <2>↑/↓<22> to select • <2>Tab:<22> select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <8A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>1 item selected<22>
      <?25h>"
    `);
  });

  it('autocompleteMultiselect: a space typed before the arrows is a character of the search', async () => {
    expect(await transcript((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, required: false, ...io }), ['space', 'return'])).toMatchInlineSnapshot(`
      "<?25l><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22> <7><8>_<28><27>
      <36>│<39>  <36>◻<39> apple
      <36>│<39>  <2>◻<22> <2>banana<22>
      <36>│<39>  <2>◻<22> <2>cherry<22>
      <36>│<39>  <2>↑/↓<22> to select • <2>Tab:<22> select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <8A><1G><J><90>│<39>
      <36>◆<39>  m
      <36>│<39>  <2>Search:<22>  █<2> (0 matches)<22>
      <36>│<39>  <33>No matches found<39>
      <36>│<39>  <2>↑/↓<22> to select • <2>Tab:<22> select • <2>Enter:<22> confirm • <2>Type:<22> to search
      <36>└<39>
      <6A><1G><J><90>│<39>
      <32>◇<39>  m
      <90>│<39>  <2>0 items selected<22>
      <?25h>"
    `);
  });
});

/** A directory holding two directories and six files. */
function tree(): string {
  const root = scratch('caique-search-');
  for (const name of ['d1', 'd2']) mkdirSync(join(root, name));
  for (const name of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']) writeFileSync(join(root, name), '');
  return root;
}

/** The rows of a frame that hold `needle`. */
const rowsHolding = (frame: string, needle: string): number => frame.split('\n').filter((row) => row.includes(needle)).length;

/** The list rows of a single search's frame: each radio, and the ellipsis standing for more. */
const listRows = (frame: string): number => rowsHolding(frame, '○') + rowsHolding(frame, '●') + rowsHolding(frame, '...');

describe('what a search answers, on the keys its other cases do not press', () => {
  it('hands options given as a function the empty search before anything is typed', async () => {
    const seen: unknown[] = [];
    function options(this: { readonly userInput: string }) {
      seen.push(this.userInput);
      return FRUIT;
    }
    await drive((io) => autocomplete({ message: 'm', options, ...io }), ['escape']);
    expect(seen[0]).toBe('');
  });

  it('shows every option before anything is typed, or once it is erased, whatever the filter says of the empty search', async () => {
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, filter: onlyX, ...io }), ['return'])).answer).toBe('apple');
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, filter: onlyX, ...io }), ['x', 'backspace', 'return'])).answer).toBe('apple');
  });

  it('keeps the focused option focused when it still matches what is typed', async () => {
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, ...io }), ['down', 'down', 'e', 'return'])).answer).toBe('cherry');
  });

  it('takes the arrows over a search that matches nothing without failing', async () => {
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, ...io }), ['z', 'down', 'escape'])).answer).toBe(CANCEL_SYMBOL);
  });

  it('does not complete a placeholder only a disabled option matches, nor one into a search already typed', async () => {
    const options = [{ value: 'apple' }, { value: 'banana', disabled: true }];
    expect((await drive((io) => autocomplete({ message: 'm', options, placeholder: 'ban', ...io }), ['tab', 'return'])).answer).toBe('apple');
    expect((await drive((io) => autocomplete({ message: 'm', options: FRUIT, placeholder: 'ban', ...io }), ['c', 'tab', 'return'])).answer).toBe('cherry');
  });

  it('in a multiple search, a letter after the arrows is typed, and space after a letter or a completion is typed too', async () => {
    expect((await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, ...io }), ['down', 'c', 'tab', 'return'])).answer).toEqual(['cherry']);
    expect((await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, required: false, ...io }), ['b', 'space', 'return'])).answer).toEqual([]);
    expect((await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, required: false, placeholder: 'ban', ...io }), ['tab', 'space', 'return'])).answer).toEqual([]);
  });

  it('counts the items chosen, one in the singular', async () => {
    const one = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, ...io }), ['tab', 'return']);
    expect(one.writes.at(-3)).toContain('1 item selected');
    const two = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, ...io }), ['tab', 'down', 'tab', 'return']);
    expect(two.writes.at(-3)).toContain('2 items selected');
  });

  it('a refusal on a short screen keeps two rows for itself', async () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ value: `option ${String(i)}` }));
    const { writes } = await drive((io) => autocompleteMultiselect({ message: 'm', options, required: true, ...io, output: Object.assign(io.output, { rows: 14 }) }), ['return', 'escape']);
    // 14 rows, less the message, the guide, the two rows of the refusal and one more: 9 rows of list.
    expect(rowsHolding(writes.at(-4) ?? '', 'option ') + rowsHolding(writes.at(-4) ?? '', '...')).toBe(9);
  });

  it('path answers the first entry under a directory, lists five at a time, and completes the focused one on tab', async () => {
    const root = tree();
    expect((await drive((io) => path({ message: 'm', initialValue: `${root}/`, ...io }), ['return'])).answer).toBe(join(root, 'd1'));
    const { writes } = await drive((io) => path({ message: 'm', initialValue: `${root}/`, ...io }), ['escape']);
    expect(listRows(writes[1] ?? '')).toBe(5);
    const completed = await drive((io) => path({ message: 'm', initialValue: `${root}/`, ...io }), ['down', 'tab', 'escape']);
    expect(completed.writes.at(-4)).toContain(`${join(root, 'd2')}█`);
  });

  it('path lists only directories when asked for directories', async () => {
    const root = tree();
    const { writes } = await drive((io) => path({ message: 'm', initialValue: `${root}/`, directory: true, ...io }), ['escape']);
    expect(listRows(writes[1] ?? '')).toBe(2);
  });
});

