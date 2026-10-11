/**
 * `checkbox`, in this process.
 *
 * Its public grade is `@inquirer/checkbox`'s own suite through `compat-oracle`, against
 * `dist/` in another process. Every branch is driven again here, through the screens that
 * suite asserts: toggling, the `all` and `invert` shortcuts and their renaming, number keys
 * past separators and disabled choices, and the order Enter checks `validate` and `required`.
 */
import { describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { checkbox, Separator, ValidationError } from './inquirer.js';

const frame = (...lines: string[]): string => lines.join('\n');

const HELP = '↑↓ navigate • space select • a all • i invert • ⏎ submit';

describe('checkbox', () => {
  it('toggles with space and answers with every checked value, in list order', async () => {
    const { answer, events, getScreen } = await render(checkbox, { message: 'Pick', choices: [1, 2, 3] });
    expect(getScreen()).toBe(frame('? Pick', '❯◯ 1', ' ◯ 2', ' ◯ 3', '', HELP));
    events.keypress('up');
    events.keypress('up');
    events.keypress('space');
    events.keypress('down');
    events.keypress('space');
    expect(getScreen()).toBe(frame('? Pick', ' ◯ 1', ' ◉ 2', '❯◉ 3', '', HELP));
    events.keypress('enter');
    await expect(answer).resolves.toEqual([2, 3]);
    expect(getScreen()).toBe('✔ Pick 2, 3');
  });

  it('starts from the checked choices, draws checkedName for them, and unchecks on space', async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: 'Pick',
      choices: [
        { value: 'a', checked: true, checkedName: 'A!' },
        { value: 'b', short: 'B' },
      ],
    });
    expect(getScreen()).toContain('❯◉ A!');
    events.keypress('space');
    events.keypress('down');
    events.keypress('space');
    events.keypress('enter');
    await expect(answer).resolves.toEqual(['b']);
    expect(getScreen()).toBe('✔ Pick B');
  });

  it('lets the cursor rest on a disabled choice, and refuses to toggle it', async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: 'Pick',
      choices: [{ value: 'a' }, { value: 'b', disabled: true }, { value: 'c', disabled: 'gone', checked: true }],
    });
    events.keypress('down');
    events.keypress('space');
    expect(getScreen()).toBe(frame('? Pick', ' ◯ a', '❯- b (disabled)', ' ◎ c gone', '', '> This option is disabled and cannot be toggled.', HELP));
    events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', ' ◯ a', ' - b (disabled)', '❯◎ c gone', '', HELP));
    events.keypress('enter');
    await expect(answer).resolves.toEqual(['c']);
  });

  it('clears the error on the next toggle', async () => {
    const { events, getScreen } = await render(checkbox, { message: 'Pick', choices: [{ value: 'a', disabled: true }, { value: 'b' }] });
    events.keypress('space');
    expect(getScreen()).toContain('> This option is disabled');
    events.keypress('down');
    events.keypress('space');
    expect(getScreen()).not.toContain('> This option is disabled');
  });

  it('does nothing on space over a separator it can never rest on', async () => {
    const { events, getScreen } = await render(checkbox, { message: 'Pick', choices: [new Separator(), 'a'] });
    events.keypress('space');
    expect(getScreen()).toContain('❯◉ a');
  });

  it('checks everything on a, unchecks everything once all are checked, and inverts on i', async () => {
    const { answer, events, getScreen } = await render(checkbox, { message: 'Pick', choices: ['a', 'b', { value: 'c', disabled: true }] });
    events.keypress('a');
    expect(getScreen()).toContain(' ◉ b');
    events.keypress('a');
    expect(getScreen()).toContain(' ◯ b');
    events.keypress('space');
    events.keypress('i');
    expect(getScreen()).toBe(frame('? Pick', '❯◯ a', ' ◉ b', ' - c (disabled)', '', HELP));
    events.keypress('enter');
    await expect(answer).resolves.toEqual(['b']);
  });

  it('renames the shortcuts, or switches them off and out of the help line', async () => {
    const renamed = await render(checkbox, { message: 'Pick', choices: ['a', 'b'], shortcuts: { all: 'x', invert: 'y' } });
    renamed.events.keypress('x');
    expect(renamed.getScreen()).toContain('↑↓ navigate • space select • x all • y invert • ⏎ submit');
    expect(renamed.getScreen()).toContain(' ◉ b');
    const off = await render(checkbox, { message: 'Pick', choices: ['a', 'b'], shortcuts: { all: null, invert: null } });
    off.events.keypress('a');
    expect(off.getScreen()).toBe(frame('? Pick', '❯◯ a', ' ◯ b', '', '↑↓ navigate • space select • ⏎ submit'));
  });

  it('toggles the n-th choice on a number, counting choices only, and skips a disabled one', async () => {
    const { events, getScreen } = await render(checkbox, { message: 'Pick', choices: [new Separator(), 'a', new Separator(), 'b', { value: 'c', disabled: true }] });
    events.keypress('2');
    expect(getScreen()).toContain('❯◉ b');
    events.keypress('3');
    expect(getScreen()).toContain('❯◉ b');
  });

  it('moves past separators, stops at the ends when it does not loop, and clears an error on a move', async () => {
    const { events, getScreen } = await render(checkbox, { message: 'Pick', choices: ['a', new Separator(), 'b'], loop: false, required: true });
    events.keypress('up');
    expect(getScreen()).toContain('❯◯ a');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> At least one choice must be selected');
    });
    events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', ' ◯ a', ' ──────────────', '❯◯ b', '', HELP));
    events.keypress('down');
    expect(getScreen()).toContain('❯◯ b');
  });

  it('awaits validate before required, and shows its message, or a default one for false', async () => {
    const verdicts: (boolean | string)[] = [false, 'two, please', true];
    const validate = vi.fn(async (picked: readonly { value: string }[]) => verdicts[picked.length] ?? false);
    const { answer, events, getScreen } = await render(checkbox, { message: 'Pick', choices: ['a', 'b'], validate });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> You must select a valid value');
    });
    events.keypress('space');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> two, please');
    });
    events.keypress('a');
    events.keypress('enter');
    await expect(answer).resolves.toEqual(['a', 'b']);
    expect(validate).toHaveBeenCalledTimes(3);
  });

  it('shows the active choice description, and a theme that renders the answer its own way', async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: 'Pick',
      choices: [{ value: 'a', description: 'first' }, 'b'],
      theme: { icon: { cursor: '>' }, style: { renderSelectedChoices: (selected: readonly { short: string }[], all: readonly unknown[]) => `${selected.length} of ${all.length}` } },
    });
    expect(getScreen()).toBe(frame('? Pick', '>◯ a', ' ◯ b', '', 'first', HELP));
    events.keypress('space');
    events.keypress('enter');
    await expect(answer).resolves.toEqual(['a']);
    expect(getScreen()).toBe('✔ Pick 1 of 2');
  });

  it('rejects a list with nothing to rest on', async () => {
    const { answer } = await render(checkbox, { message: 'Pick', choices: [new Separator()] });
    await expect(answer).rejects.toBeInstanceOf(ValidationError);
  });
});
