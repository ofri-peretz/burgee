/**
 * A prompt whose process is going away underneath it. `closeout/exit-hook` only fires on a
 * real exit or signal, which would take this worker with it, so the hook is replaced by one
 * that hands the callback back — and the case fires it the way closeout would, with the code.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

const exit = vi.hoisted(() => {
  const state = { fire: (_code: number | string): void => undefined, unsubscribed: 0 };
  /** closeout's `exitHook`, minus the process: keep the callback, count the unsubscribes. */
  const hook = (callback: (code: number | string) => void): (() => void) => {
    state.fire = callback;
    return () => {
      state.unsubscribed++;
    };
  };
  return { state, hook };
});

vi.mock('closeout/exit-hook', () => ({ default: exit.hook }));

const { createPrompt, ExitPromptError } = await import('./inquirer.js');

describe('a prompt when the process exits', () => {
  it('rejects with ExitPromptError naming the exit code, and gives its exit hook back', async () => {
    const output = new PassThrough();
    output.resume();
    const answer = createPrompt<string, object>(() => '? still here')({}, { input: new PassThrough(), output });
    exit.state.fire(130);
    await expect(answer).rejects.toThrow(new ExitPromptError('User force closed the prompt with 130'));
    expect(exit.state.unsubscribed).toBe(1);
  });
});
