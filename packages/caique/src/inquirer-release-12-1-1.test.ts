/**
 * What `@inquirer/core` 12.1.1 changed, held here to literals. Its own suite moved one
 * assertion (an enter keypress is named `return`), so the behaviours below are graded by
 * nothing in `compat-oracle` yet: each literal was read off the real 12.1.1 first.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { cursorTo, cursorUp, eraseLines, MuteStream, ScreenManager, type ScreenReadline } from './inquirer-screen.js';
import { CancelPromptError, createPrompt, ExitPromptError, useEffect, useKeypress, useState } from './inquirer.js';

/** An input that says it is a terminal, as `process.stdin` does in one. */
function terminal(): PassThrough {
  return Object.assign(new PassThrough(), { isTTY: true });
}

function sink(): PassThrough {
  const output = new PassThrough();
  output.resume();
  return output;
}

const tick = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('@inquirer/core 12.1.1', () => {
  it('rejects a pending prompt when a terminal closes its input (Ctrl+D)', async () => {
    const input = terminal();
    const answer = createPrompt<string, object>(() => '? still here')({}, { input, output: sink() });
    // Past the first render, which a terminal defers by one turn.
    await tick(5);
    input.end();
    await expect(answer).rejects.toThrow(new ExitPromptError('User force closed the prompt with EOF'));
  });

  it('leaves a pending prompt waiting when a pipe drains', async () => {
    const input = new PassThrough();
    const answer = createPrompt<string, object>(() => '? still here')({}, { input, output: sink() });
    let settled = false;
    answer.then(
      () => (settled = true),
      () => (settled = true),
    );
    input.end();
    await tick(20);
    expect(settled).toBe(false);
    answer.cancel();
    await answer.catch(() => undefined);
  });

  it('paints state an effect sets while a keypress re-renders, before the next input', async () => {
    // A search prompt flipping to `loading` when its term changes: the effect runs inside the
    // re-render the keypress asked for, so 12.1.0 recorded its change and never drew it.
    const lookup = createPrompt<string, object>((_config, done) => {
      const [term, setTerm] = useState('');
      const [status, setStatus] = useState('idle');
      useKeypress((key) => {
        if (key.name === 'enter') done(term);
        else setTerm(term + key.name);
      });
      useEffect(() => {
        if (term !== '') setStatus('loading');
      }, [term]);
      return `${status} ${term}`;
    });
    const { answer, events, getScreen } = await render(lookup, {});
    expect(getScreen()).toBe('idle');
    events.keypress('a');
    // Not drawn inside the keypress: a second key in the same tick still reads the frame before it.
    expect(getScreen()).toBe('idle a');
    await Promise.resolve();
    expect(getScreen()).toBe('loading a');
    events.keypress('enter');
    await expect(answer).resolves.toBe('a');
  });

  it('keeps one deferred paint for two keys in the same tick, and draws the latest state', async () => {
    const lookup = createPrompt<string, object>(() => {
      const [term, setTerm] = useState('');
      const [status, setStatus] = useState('idle');
      useKeypress((key) => {
        setTerm((current) => current + String(key.name));
      });
      useEffect(() => {
        if (term !== '') setStatus(`loading ${term}`);
      }, [term]);
      return `${status} ${term}`;
    });
    const { answer, events, frames, getScreen } = await render(lookup, {});
    events.keypress('a');
    events.keypress('b');
    await Promise.resolve();
    expect(getScreen()).toBe('loading ab ab');
    // The second key draws the first key's effect with its own term, as 12.1.1 does; the one
    // paint left pending then draws the latest state, once.
    expect(frames().filter((frame) => frame.startsWith('loading'))).toEqual(['loading a ab', 'loading ab ab']);
    answer.cancel();
    await answer.catch(() => undefined);
  });

  it('cancels the deferred paint when the prompt settles before it runs', async () => {
    // The keypress schedules a paint for the effect's `loading`; a cancel in the same tick
    // empties the slot, and the microtask that finds it empty must draw nothing rather than
    // call what is no longer there.
    const lookup = createPrompt<string, object>(() => {
      const [term, setTerm] = useState('');
      const [status, setStatus] = useState('idle');
      useKeypress((key) => {
        setTerm(term + key.name);
      });
      useEffect(() => {
        if (term !== '') setStatus('loading');
      }, [term]);
      return `${status} ${term}`;
    });
    const { answer, events, frames } = await render(lookup, {});
    events.keypress('a');
    answer.cancel();
    await expect(answer).rejects.toThrow(CancelPromptError);
    await tick(5);
    expect(frames()).not.toContain('loading a');
  });
});

/** A screen manager on a terminal 10 columns wide, with readline reporting `cursor`. */
function screenAt(cursor: { rows: number; cols: number }): { screen: ScreenManager; written: () => string } {
  const chunks: string[] = [];
  const output = new MuteStream();
  output.pipe(
    Object.assign(
      new PassThrough().on('data', (chunk: Buffer) => chunks.push(String(chunk))),
      { columns: 10 },
    ),
  );
  const rl: ScreenReadline = {
    line: '',
    output,
    setPrompt: () => undefined,
    getCursorPos: () => cursor,
    close: () => undefined,
  };
  return {
    screen: new ScreenManager(rl),
    written: () => {
      const text = chunks.join('');
      chunks.length = 0;
      return text;
    },
  };
}

describe('@inquirer/core 12.1.1 screen geometry', () => {
  it('puts the cursor below a prompt line whose wide characters fill the terminal exactly', () => {
    // `? ` and four CJK characters are 6 code units and 10 columns. 12.1.0 counted the code
    // units, saw a line short of the edge, and left the cursor at the start of the row it filled.
    // Where readline, which measures wide characters, puts the cursor after that line.
    const { screen, written } = screenAt({ rows: 1, cols: 0 });
    screen.render('? \u4F60\u597D\u4F60\u597D');
    expect(written()).toBe(`? \u4F60\u597D\u4F60\u597D\n${cursorTo(0)}`);
    screen.render('? ok');
    // Two rows to erase, not one.
    expect(written()).toBe(`${eraseLines(2)}? ok${cursorTo(0)}`);
  });

  it('climbs back over the extra row, past bottom content, to that full prompt line', () => {
    const { screen, written } = screenAt({ rows: 1, cols: 0 });
    screen.render('? \u4F60\u597D\u4F60\u597D', 'help');
    expect(written()).toBe(`? \u4F60\u597D\u4F60\u597D\n\nhelp${cursorUp(1)}${cursorTo(0)}`);
  });

  it('places the cursor by the last logical line, not a longer one above it', () => {
    const { screen, written } = screenAt({ rows: 0, cols: 4 });
    screen.render('abcdefghijklmnop\n? ok');
    expect(written()).toBe(`abcdefghij\nklmnop\n? ok${cursorTo(4)}`);
  });

  it('judges the edge by the last row of a wrapped prompt line, not its first', () => {
    const { screen, written } = screenAt({ rows: 1, cols: 4 });
    screen.render('? abcdefghijkl');
    expect(written()).toBe(`? abcdefgh\nijkl${cursorTo(4)}`);
  });

  it('still breaks an empty prompt line before the bottom content', () => {
    const { screen, written } = screenAt({ rows: 0, cols: 0 });
    screen.render('', 'help');
    expect(written()).toBe(`\n\nhelp${cursorUp(1)}${cursorTo(0)}`);
  });
});
