/**
 * Lock — `runBurgee` keeps the TTY-ness of a stdin stream the caller passed.
 *
 * Without `tty`, the harness hands `execute` the caller's own stream as it is; with `tty`, the
 * stream is told what the caller asked for (N12: stdin's TTY-ness is whether a person may be
 * asked). `testing-harness-forward.test.ts` drives `tty` and the harness's own stdin, never a
 * stream of the caller's, so a harness that overwrote every stream's `isTTY` passed it: the
 * 2026-11-14 mutation run left that branch alive.
 */
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

describe('the harness and a stdin stream the caller passed', () => {
  it('keeps its own isTTY when `tty` is not given, and takes `tty` when it is', async () => {
    const seen: boolean[] = [];
    const program = defineProgram({
      name: 'probe',
      version: '1.0.0',
      commands: [
        defineCommand({
          name: 'look',
          effects: 'read_only',
          run: (ctx) => {
            seen.push(ctx.interactive);
            return { ok: true };
          },
        }),
      ],
    });
    const terminal = (): Readable => Object.assign(Readable.from([]), { isTTY: true });

    await runBurgee(program, { argv: ['look'], stdin: terminal() });
    await runBurgee(program, { argv: ['look'], stdin: terminal(), tty: false });
    expect(seen, 'a stream the caller passed lost its own isTTY, so a terminal on stdin read as a pipe').toEqual([true, false]);
  });
});
