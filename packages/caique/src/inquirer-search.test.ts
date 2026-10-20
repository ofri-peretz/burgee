/**
 * `search`, in this process.
 *
 * Its public grade is `@inquirer/search`'s own suite through `compat-oracle`, against `dist/`
 * in another process. Every branch is driven again here, through the screens that suite
 * asserts: a `source` called again on every change of the term and the call before it
 * aborted, the arrows held still while a call is in flight, Tab completing the term, and a
 * refused choice becoming the term.
 */
import { stripVTControlCharacters } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { POINTER } from './inquirer-choices.js';
import { search, Separator } from './inquirer-prompts.js';
import { TICK } from './inquirer-theme.js';

const frame = (...lines: string[]): string => lines.join('\n');

const HELP = '↑↓ navigate • ⏎ select';

/** The first row of a frame with its escapes stripped and nothing trimmed, so a stray space shows. */
const firstLine = (raw: string): string => stripVTControlCharacters(raw).split('\n')[0] ?? '';

const fruits = [{ value: 'apple' }, { value: 'banana', description: 'yellow' }, new Separator(), { value: 'cherry', disabled: true }, { value: 'damson', disabled: 'out' }];

/** A source that filters `fruits` by the term. */
const filtered = (term?: string): typeof fruits => (term === undefined ? fruits : fruits.filter((fruit) => Separator.isSeparator(fruit) || fruit.value.includes(term)));

describe('search', () => {
  it('lists what the source returns for no term, then for each term typed', async () => {
    const source = vi.fn(filtered);
    const { answer, events, getScreen, nextRender } = await render(search, { message: 'Fruit', source });
    await nextRender();
    expect(getScreen()).toBe(frame('? Fruit', `${POINTER} apple`, '  banana', ' ──────────────', '- cherry (disabled)', '- damson out', '', HELP));
    events.type('an');
    await nextRender();
    expect(getScreen()).toBe(frame('? Fruit an', `${POINTER} banana`, ' ──────────────', '', 'yellow', HELP));
    expect(source).toHaveBeenLastCalledWith('an', { signal: expect.any(AbortSignal) as AbortSignal });
    events.keypress('enter');
    await expect(answer).resolves.toBe('banana');
    expect(getScreen()).toBe(`${TICK} Fruit banana`);
  });

  it('moves between answerable results only, and stops at either end', async () => {
    const { events, getScreen, nextRender } = await render(search, { message: 'Fruit', source: filtered });
    await nextRender();
    events.keypress('up');
    expect(getScreen()).toContain(`${POINTER} apple`);
    events.keypress('down');
    events.keypress('down');
    expect(getScreen()).toContain(`${POINTER} banana`);
    events.keypress('up');
    expect(getScreen()).toContain(`${POINTER} apple`);
  });

  it('holds the arrows still while a search is in flight', async () => {
    let release!: (found: string[]) => void;
    const { events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async (term?: string) => (term === undefined ? ['a', 'b'] : new Promise<string[]>((resolve) => (release = resolve))),
    });
    await nextRender();
    events.type('x');
    events.keypress('down');
    release(['x1', 'x2']);
    await nextRender();
    expect(getScreen()).toContain(`${POINTER} x1`);
  });

  it('says so when a term finds nothing, and shows the error a source throws', async () => {
    const empty = await render(search, { message: 'Fruit', source: (term?: string) => (term === undefined ? ['a'] : []) });
    await empty.nextRender();
    empty.events.type('zz');
    await empty.nextRender();
    expect(empty.getScreen()).toBe(frame('? Fruit zz', '> No results found', '', HELP));
    const failing = await render(search, {
      message: 'Fruit',
      source: async () => {
        throw new Error('offline');
      },
    });
    await vi.waitFor(() => {
      expect(failing.getScreen()).toContain('> offline');
    });
  });

  it('ignores what a source throws that is not an Error, and what an aborted call returns', async () => {
    let first = true;
    const { events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async (term?: string) => {
        if (term === undefined) return ['a'];
        if (first) {
          first = false;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return ['stale'];
        }
        throw 'not an error';
      },
    });
    await nextRender();
    events.type('x');
    events.type('y');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(getScreen()).not.toContain('stale');
    expect(getScreen()).not.toContain('not an error');
  });

  it('ignores an aborted call that fails, too', async () => {
    let calls = 0;
    const { events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async (term?: string) => {
        calls++;
        if (term === undefined) return ['a'];
        if (calls === 2) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error('too late');
        }
        return ['fresh'];
      },
    });
    await nextRender();
    events.type('x');
    events.type('y');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(getScreen()).toContain('fresh');
    expect(getScreen()).not.toContain('too late');
  });

  it('completes the term to the active choice on Tab', async () => {
    const { events, getScreen, nextRender } = await render(search, { message: 'Fruit', source: filtered });
    await nextRender();
    events.keypress('tab');
    await nextRender();
    expect(getScreen()).toContain('? Fruit apple');
  });

  it('starts on the default once, and types the initial value', async () => {
    const source = vi.fn(filtered);
    const { events, getScreen, nextRender } = await render(search, { message: 'Fruit', source, default: 'banana', initialValue: 'a' });
    await nextRender();
    expect(getScreen()).toContain(`${POINTER} banana`);
    expect(source).toHaveBeenCalledWith('a', expect.anything());
    events.keypress('backspace');
    await nextRender();
    expect(getScreen()).toContain(`${POINTER} apple`);
    const missing = await render(search, { message: 'Fruit', source: filtered, default: 'kiwi' });
    await missing.nextRender();
    expect(missing.getScreen()).toContain(`${POINTER} apple`);
  });

  it('puts the term back on an Enter with nothing to answer', async () => {
    const { events, getScreen, nextRender } = await render(search, { message: 'Fruit', source: (term?: string) => (term === undefined ? ['a'] : []) });
    await nextRender();
    events.type('q');
    await nextRender();
    events.keypress('enter');
    expect(getScreen()).toContain('? Fruit q');
    events.type('r');
    await nextRender();
    expect(getScreen()).toContain('? Fruit qr');
  });

  it('turns a refused choice into the term, and shows the refusal once it is the term', async () => {
    const validate = vi.fn((value: string) => (value === 'apple' ? 'not apples' : false));
    const { answer, events, getScreen, nextRender } = await render(search, { message: 'Fruit', source: filtered, validate });
    await nextRender();
    events.keypress('enter');
    await nextRender();
    expect(getScreen()).toContain('? Fruit apple');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> not apples');
    });
    events.keypress('backspace');
    events.keypress('backspace');
    events.keypress('backspace');
    events.keypress('backspace');
    events.keypress('backspace');
    events.type('banana');
    await nextRender();
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> You must provide a valid value');
    });
    answer.cancel();
    await expect(answer).rejects.toThrow('Prompt was canceled');
  });

  it('draws no help line when the theme returns none', async () => {
    const { getScreen, nextRender } = await render(search, { message: 'Fruit', source: () => ['a'], theme: { style: { keysHelpTip: () => undefined } } });
    await nextRender();
    expect(getScreen()).toBe(frame('? Fruit', `${POINTER} a`));
  });

  /** The status each frame was drawn in, read through the message style the theme is handed. */
  const statusTheme = { style: { message: (text: string, status: string) => `${text}:${status}` } };

  it('draws its first frame loading, with nothing listed until the source answers', async () => {
    const { frames } = await render(search, { message: 'Fruit', source: async () => new Promise<string[]>(() => undefined), theme: statusTheme });
    expect(frames()).toEqual([frame('? Fruit:loading', '', HELP)]);
  });

  it('is loading while a choice is validated, and idle again after a refusal', async () => {
    let release!: (verdict: string) => void;
    const validate = async (): Promise<string> =>
      new Promise((resolve) => {
        release = resolve;
      });
    const { events, getScreen, nextRender } = await render(search, { message: 'Fruit', source: () => ['kiwi'], validate, theme: statusTheme, initialValue: 'kiwi' });
    await nextRender();
    events.keypress('enter');
    expect(getScreen()).toContain('? Fruit:loading kiwi');
    release('no kiwis');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> no kiwis');
    });
    expect(getScreen()).toContain('? Fruit:idle kiwi');
  });

  it('holds Enter and the arrows while a search it has drawn as loading is out', async () => {
    let release!: (found: string[]) => void;
    const { answer, events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async (term?: string) => (term === undefined ? ['a', 'b'] : new Promise<string[]>((resolve) => (release = resolve))),
    });
    await nextRender();
    // As `@inquirer/search` does, a key reads the state of the last frame drawn, and the effect
    // that marks a new search loading draws nothing itself: the second key is the first that
    // sees it. So 'y', then Enter, then the arrows, all while the search for "xy" is out.
    events.type('x');
    events.type('y');
    events.keypress('enter');
    events.keypress('down');
    expect(getScreen()).toContain(`${POINTER} a`);
    release(['xy1', 'xy2']);
    await nextRender();
    expect(getScreen()).toContain(`${POINTER} xy1`);
    events.keypress('enter');
    await expect(answer).resolves.toBe('xy1');
  });

  it('keeps the typed term editable: after the initial value, a refused choice, Tab and an arrow', async () => {
    const source = vi.fn((term?: string) => (term === undefined ? ['apple', 'banana', 'cherry'] : ['apple', 'banana', 'cherry'].filter((fruit) => fruit.includes(term))));
    const typed = await render(search, { message: 'Fruit', source, initialValue: 'ap' });
    await typed.nextRender();
    typed.events.type('p');
    await typed.nextRender();
    expect(source).toHaveBeenLastCalledWith('app', expect.anything());

    const refused = await render(search, { message: 'Fruit', source, validate: () => 'no' });
    await refused.nextRender();
    refused.events.keypress('enter');
    await refused.nextRender();
    refused.events.type('s');
    await refused.nextRender();
    expect(source).toHaveBeenLastCalledWith('apples', expect.anything());

    const tabbed = await render(search, { message: 'Fruit', source });
    await tabbed.nextRender();
    tabbed.events.type('b');
    await tabbed.nextRender();
    tabbed.events.keypress('tab');
    await tabbed.nextRender();
    tabbed.events.type('s');
    await tabbed.nextRender();
    expect(source).toHaveBeenLastCalledWith('bananas', expect.anything());

    // An arrow clears readline's line, as `@inquirer/search` does: the next key starts a new term.
    const arrowed = await render(search, { message: 'Fruit', source });
    await arrowed.nextRender();
    arrowed.events.type('a');
    await arrowed.nextRender();
    arrowed.events.keypress('down');
    arrowed.events.type('c');
    await arrowed.nextRender();
    expect(source).toHaveBeenLastCalledWith('c', expect.anything());
  });

  it('moves up and down by one answerable choice, and pages without wrapping', async () => {
    const three = await render(search, { message: 'Fruit', source: () => ['a', 'b', 'c'] });
    await three.nextRender();
    three.events.keypress('down');
    three.events.keypress('down');
    three.events.keypress('up');
    expect(three.getScreen()).toContain(`${POINTER} b`);
    const six = await render(search, { message: 'Fruit', source: () => ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'], pageSize: 3 });
    await six.nextRender();
    for (let i = 0; i < 5; i++) six.events.keypress('down');
    expect(six.getScreen()).toBe(frame('? Fruit', '  i3', '  i4', `${POINTER} i5`, '', HELP));
  });

  it('reports no results only for a term, and only once its search is in', async () => {
    const none = await render(search, { message: 'Fruit', source: () => [] });
    await none.nextRender();
    expect(none.getScreen()).toBe(frame('? Fruit', '', HELP));
    let release!: (found: string[]) => void;
    const pending = await render(search, { message: 'Fruit', source: async (term?: string) => (term === undefined ? [] : new Promise<string[]>((resolve) => (release = resolve))) });
    await pending.nextRender();
    pending.events.type('z');
    pending.events.type('w');
    expect(pending.getScreen()).toBe(frame('? Fruit zw', '', HELP));
    release([]);
    await pending.nextRender();
    expect(pending.getScreen()).toBe(frame('? Fruit zw', '> No results found', '', HELP));
  });

  it('clears the last error once the next search is drawn', async () => {
    const { events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async (term?: string) => {
        if (term === 'x') throw new Error('offline');
        return term === undefined ? ['a'] : new Promise<string[]>(() => undefined);
      },
    });
    await nextRender();
    events.type('x');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> offline');
    });
    events.type('y');
    events.type('z');
    expect(getScreen()).not.toContain('offline');
  });

  it('draws no empty part: no prefix, no answer, no help line, nothing trailing', async () => {
    const plain = { prefix: '', style: { answer: (text: string) => text, searchTerm: (text: string) => text, keysHelpTip: () => undefined } };
    const open = await render(search, { message: 'Fruit', source: () => ['a'], theme: plain });
    await open.nextRender();
    expect(stripVTControlCharacters(open.getScreen({ raw: true }))).toMatch(new RegExp(`^Fruit\\n${POINTER} a(?:\\n|$)`, 'u'));
    const spaced = await render(search, { message: 'Fruit', source: () => ['a'], theme: plain });
    await spaced.nextRender();
    spaced.events.type(' ');
    await spaced.nextRender();
    expect(firstLine(spaced.getScreen({ raw: true }))).toBe('Fruit');
    const done = await render(search, { message: 'Fruit', source: () => [{ value: 'a', short: ' ' }], theme: plain });
    await done.nextRender();
    done.events.keypress('enter');
    await done.answer;
    expect(firstLine(done.getScreen({ raw: true }))).toBe('Fruit');
  });
});

