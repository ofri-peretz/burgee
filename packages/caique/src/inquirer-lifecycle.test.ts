import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { AbortPromptError, createPrompt, useEffect } from './inquirer.js';

/**
 * One prompt, end to end, on caique's own suite.
 *
 * `createPrompt` was otherwise run only by compat-oracle's vendored inquirer-core suite, which
 * grades on the .nvmrc Node. So when `runPrompt` still called `Promise.withResolvers` (Node 22+),
 * every package suite passed on Node 20.19 while every prompt there threw on its first line.
 * These two cases are what the `floor` cells in `compat.yml` need to see that: one settles
 * the prompt, one rejects it, and both go through the resolver pair.
 */
const streams = (): { input: PassThrough; output: PassThrough } => {
  const output = new PassThrough();
  output.resume();
  return { input: new PassThrough(), output };
};

describe('createPrompt, run on whatever Node runs this suite', () => {
  it('resolves with the value the view hands to done', async () => {
    const prompt = createPrompt<string, { answer: string }>((config, done) => {
      useEffect(() => {
        done(config.answer);
      }, []);
      return '? ready';
    });
    await expect(prompt({ answer: 'ok' }, streams())).resolves.toBe('ok');
  });

  it('rejects with AbortPromptError when its signal is already aborted', async () => {
    const prompt = createPrompt<string, object>(() => '? never answered');
    await expect(prompt({}, { ...streams(), signal: AbortSignal.abort() })).rejects.toBeInstanceOf(AbortPromptError);
  });
});
