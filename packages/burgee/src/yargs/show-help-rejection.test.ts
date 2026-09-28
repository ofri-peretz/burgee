/**
 * Lock: `showHelp()` owns the promise it starts.
 *
 * `showHelp()` returns the instance, so when a default command's builder is async it runs the
 * builder and prints help from a `.then`. yargs 18 chains that `.then` with no rejection
 * handler, and nothing else holds the promise: a builder that rejects is an unhandled
 * rejection, which ends the process with a bare stack and no help. Measured on the unfixed
 * code, node v24.12.0: exit 1, `Error: boom`, nothing printed.
 *
 * Now the rejection goes to `fail`, where yargs sends a command handler's rejection that no
 * caller owns — so a `.fail()` handler receives it, and without one `exitProcess` decides.
 */
import { afterEach, describe, expect, it } from 'vitest';

import yargs from '../yargs.js';

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};

/** Let the builder's promise settle and any unhandled rejection be reported. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  unhandled.length = 0;
});

describe('showHelp with a default command whose async builder rejects', () => {
  it('hands the rejection to the .fail() handler instead of leaving it unhandled', async () => {
    process.on('unhandledRejection', onUnhandled);
    const failures: unknown[] = [];
    const boom = new Error('boom');
    yargs([])
      .exitProcess(false)
      .fail((_msg, err) => {
        failures.push(err);
      })
      .command(
        '$0',
        'the default',
        async () => {
          throw boom;
        },
        () => {},
      )
      .showHelp();
    await settle();
    expect(unhandled).toEqual([]);
    expect(failures).toContain(boom);
  });

  it('without a .fail() handler reports it and leaves nothing unhandled', async () => {
    process.on('unhandledRejection', onUnhandled);
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(...args);
    };
    try {
      yargs([])
        .exitProcess(false)
        .command(
          '$0',
          'the default',
          async () => {
            throw new Error('boom');
          },
          () => {},
        )
        .showHelp();
      await settle();
    } finally {
      console.error = original;
    }
    expect(unhandled).toEqual([]);
    expect(errors.some((e) => e instanceof Error && e.message === 'boom')).toBe(true);
  });

  it('still prints help once an async builder resolves', async () => {
    const lines: string[] = [];
    yargs([])
      .exitProcess(false)
      .command(
        '$0',
        'the default',
        async (y) => y.option('flavour', { describe: 'which one' }),
        () => {},
      )
      .showHelp((s) => lines.push(s));
    await settle();
    expect(lines.join('\n')).toContain('--flavour');
  });
});
