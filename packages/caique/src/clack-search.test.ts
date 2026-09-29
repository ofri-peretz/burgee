/**
 * The searchable prompts in `clack-search.ts` — `autocomplete`, `autocompleteMultiselect` and
 * `path` — past the paths `clack.test.ts` holds: where the cursor starts, what a search with no
 * match answers, what tab completes, and what each one refuses. Every case checks the answer.
 *
 * Colour is off (`vitest-colour-setup.ts`), so frames are compared as text.
 */
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CANCEL_SYMBOL } from './clack-core.js';
import { REQUIRED } from './clack-list.js';
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

  it('tab with nothing matching toggles nothing', async () => {
    const { answer } = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, required: false, ...io }), ['z', 'tab', 'return']);
    expect(answer).toEqual([]);
  });

  it('required refuses an empty answer, and the refusal replaces the instructions', async () => {
    const { answer, writes } = await drive((io) => autocompleteMultiselect({ message: 'm', options: FRUIT, required: true, ...io }), ['return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    const refused = writes.at(-4) ?? '';
    expect(refused).toContain(REQUIRED.split('\n')[0]);
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
    expect(refused).toContain(REQUIRED.split('\n')[0]);
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
