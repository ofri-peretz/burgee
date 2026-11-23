/**
 * What `@inquirer/core` 12.1.1 changed, held here to literals. Its own suite moved one
 * assertion (an enter keypress is named `return`), so the behaviours below are graded by
 * nothing in `compat-oracle` yet: each literal was read off the real 12.1.1 first.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { cursorTo, eraseLines, MuteStream, ScreenManager, type ScreenReadline } from './inquirer-screen.js';
import { createPrompt, ExitPromptError, useEffect, useKeypress, useState } from './inquirer.js';

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

  it('puts the cursor below a prompt line whose wide characters fill the terminal exactly', () => {
    // `? ` and four CJK characters are 6 code units and 10 columns. 12.1.0 counted the code
    // units, saw a line short of the edge, and left the cursor at the start of the row it filled.
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
      // Where readline, which measures wide characters, puts the cursor after that line.
      getCursorPos: () => ({ rows: 1, cols: 0 }),
      close: () => undefined,
    };
    const screen = new ScreenManager(rl);
    screen.render('? \u4F60\u597D\u4F60\u597D');
    expect(chunks.join('')).toBe(`? \u4F60\u597D\u4F60\u597D\n${cursorTo(0)}`);
    chunks.length = 0;
    screen.render('? ok');
    // Two rows to erase, not one.
    expect(chunks.join('')).toBe(`${eraseLines(2)}? ok${cursorTo(0)}`);
  });
});
