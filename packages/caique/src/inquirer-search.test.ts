/**
 * `search`, in this process.
 *
 * Its public grade is `@inquirer/search`'s own suite through `compat-oracle`, against `dist/`
 * in another process. Every branch is driven again here, through the screens that suite
 * asserts: a `source` called again on every change of the term and the call before it
 * aborted, the arrows held still while a call is in flight, Tab completing the term, and a
 * refused choice becoming the term.
 */
import { describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { search, Separator } from './inquirer-prompts.js';

const frame = (...lines: string[]): string => lines.join('\n');

const HELP = '↑↓ navigate • ⏎ select';

const fruits = [{ value: 'apple' }, { value: 'banana', description: 'yellow' }, new Separator(), { value: 'cherry', disabled: true }, { value: 'damson', disabled: 'out' }];

/** A source that filters `fruits` by the term. */
const filtered = (term?: string): typeof fruits => (term === undefined ? fruits : fruits.filter((fruit) => Separator.isSeparator(fruit) || fruit.value.includes(term)));

describe('search', () => {
  it('lists what the source returns for no term, then for each term typed', async () => {
    const source = vi.fn(filtered);
    const { answer, events, getScreen, nextRender } = await render(search, { message: 'Fruit', source });
    await nextRender();
    expect(getScreen()).toBe(frame('? Fruit', '❯ apple', '  banana', ' ──────────────', '- cherry (disabled)', '- damson out', '', HELP));
    events.type('an');
    await nextRender();
    expect(getScreen()).toBe(frame('? Fruit an', '❯ banana', ' ──────────────', '', 'yellow', HELP));
    expect(source).toHaveBeenLastCalledWith('an', { signal: expect.any(AbortSignal) as AbortSignal });
    events.keypress('enter');
    await expect(answer).resolves.toBe('banana');
    expect(getScreen()).toBe('✔ Fruit banana');
  });

  it('moves between answerable results only, and stops at either end', async () => {
    const { events, getScreen, nextRender } = await render(search, { message: 'Fruit', source: filtered });
    await nextRender();
    events.keypress('up');
    expect(getScreen()).toContain('❯ apple');
    events.keypress('down');
    events.keypress('down');
    expect(getScreen()).toContain('❯ banana');
    events.keypress('up');
    expect(getScreen()).toContain('❯ apple');
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
    expect(getScreen()).toContain('❯ x1');
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
    expect(getScreen()).toContain('❯ banana');
    expect(source).toHaveBeenCalledWith('a', expect.anything());
    events.keypress('backspace');
    await nextRender();
    expect(getScreen()).toContain('❯ apple');
    const missing = await render(search, { message: 'Fruit', source: filtered, default: 'kiwi' });
    await missing.nextRender();
    expect(missing.getScreen()).toContain('❯ apple');
  });

  it('puts the term back on an Enter with nothing to answer', async () => {
    const { events, getScreen, nextRender } = await render(search, { message: 'Fruit', source: (term?: string) => (term === undefined ? ['a'] : []) });
    await nextRender();
    events.type('q');
    await nextRender();
    events.keypress('enter');
    expect(getScreen()).toContain('? Fruit q');
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
    expect(getScreen()).toBe(frame('? Fruit', '❯ a'));
  });
});
