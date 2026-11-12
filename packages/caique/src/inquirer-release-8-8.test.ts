/**
 * What `@inquirer/prompts` 8.8.0 and `@inquirer/core` 12.1.0 changed (burgee#1526, #1527), held
 * here to literals as well as by their own suites in `compat-oracle`.
 */
import { describe, expect, it } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { number, rawlist, select } from './inquirer-prompts.js';
import { makeTheme, type PartialTheme } from './inquirer.js';

describe('@inquirer/core 12.1.0', () => {
  it('keeps the default for a theme key set to undefined', () => {
    // A caller without `exactOptionalPropertyTypes` can write this, and @inquirer/core's own case does.
    const unset = { prefix: undefined } as unknown as PartialTheme;
    expect(makeTheme(unset).prefix).toEqual(makeTheme().prefix);
  });
});

describe('@inquirer/number 4.3.0', () => {
  it('calls validate with undefined when an optional prompt is left empty', async () => {
    const seen: unknown[] = [];
    const { answer, events, getScreen, nextRender } = await render(number, {
      message: 'How many?',
      validate: (value?: number) => {
        seen.push(value);
        return value !== undefined || 'Please enter a number';
      },
    });
    events.keypress('enter');
    await nextRender();
    expect(getScreen()).toBe('? How many?\n> Please enter a number');
    expect(seen).toEqual([undefined]);
    events.type('3');
    events.keypress('enter');
    await expect(answer).resolves.toBe(3);
  });
});

describe('@inquirer/select 5.3.0 and @inquirer/rawlist 5.4.0', () => {
  const choices = Array.from({ length: 25 }, (_, index) => ({ value: index + 1 }));

  it('selects by index only when the line is plain digits', async () => {
    const { answer, events } = await render(select, { message: 'Select a number', choices });
    events.type('2e1');
    events.keypress('enter');
    await expect(answer).resolves.toBe(2);
  });

  it('selects a two-digit index', async () => {
    // Named so the name never starts with the digits, or the type-to-search fallback would find it.
    const named = choices.map(({ value }) => ({ value, name: `item ${String(value)}` }));
    const { answer, events } = await render(select, { message: 'Select a number', choices: named });
    events.type('12');
    events.keypress('enter');
    await expect(answer).resolves.toBe(12);
  });

  it('refuses a signed index, which parseInt would read', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Select a number', choices: choices.slice(0, 5) });
    events.type('+2');
    events.keypress('enter');
    expect(getScreen()).toContain('> "+2" isn\'t an available option');
  });

  it('refuses a line that only starts with a valid index', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Select a number', choices: choices.slice(0, 5) });
    events.type('2x');
    events.keypress('enter');
    expect(getScreen()).toContain('> "2x" isn\'t an available option');
  });

  it('selects by an index with whitespace around it', async () => {
    const { answer, events } = await render(rawlist, { message: 'Select a number', choices: choices.slice(0, 5) });
    events.type(' 3 ');
    events.keypress('enter');
    await expect(answer).resolves.toBe(3);
  });
});
