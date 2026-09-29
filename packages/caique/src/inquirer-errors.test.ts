/**
 * `@inquirer/core`'s five error classes. The incumbent's suite catches them by class and prints
 * them as `[Name: message]`, so the name and the default message are the contract.
 */
import { describe, expect, it } from 'vitest';

import { AbortPromptError, CancelPromptError, ExitPromptError, HookError, ValidationError } from './inquirer.js';

describe('the error classes', () => {
  it('carry the incumbent name and default message, and are Errors', () => {
    const cases: [Error, string, string][] = [
      [new AbortPromptError(), 'AbortPromptError', 'Prompt was aborted'],
      [new CancelPromptError(), 'CancelPromptError', 'Prompt was canceled'],
      [new ExitPromptError('User force closed the prompt with SIGINT'), 'ExitPromptError', 'User force closed the prompt with SIGINT'],
      [new HookError('outside'), 'HookError', 'outside'],
      [new ValidationError('bad'), 'ValidationError', 'bad'],
    ];
    for (const [error, name, message] of cases) {
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.message).toBe(message);
      expect(String(error)).toBe(`${name}: ${message}`);
    }
  });

  it('keeps the abort reason as the cause, and none without one', () => {
    const reason = new Error('timed out');
    expect(new AbortPromptError({ cause: reason }).cause).toBe(reason);
    expect(new AbortPromptError().cause).toBeUndefined();
  });
});
