/**
 * Lock — the harness hands the engine everything the caller configured.
 *
 * `runBurgee` builds a whole `fakeRuntime` — argv, env, **cwd, stdin and per-stream TTY-ness**
 * — and then forwarded six of those nine to `execute`. `cwd`, `stdin` and `isTTY` were computed
 * and dropped on the floor, which `.sdlc/intents/burgee/spec.md` records as T1 and calls *"the
 * row most likely to make a test pass for the wrong reason"*. It is right, and the reason is
 * worth stating precisely:
 *
 *   - **`tty: true` changed nothing.** `execute` reads TTY-ness off `opts.stdout.isTTY` and
 *     hands it to `detectAgent`, and the harness passed a bare `{ write }`. So a test that
 *     asked for a terminal got the non-interactive floor and asserted on it happily.
 *   - **`cwd` changed nothing.** Config discovery starts at `io.cwd`, which fell through to
 *     `host.cwd()` — the *real* process directory. A test pointing at a fixture tree was
 *     reading the repository it was running in.
 *   - **`stdin` changed nothing**, so nothing that reads it could be driven at all.
 *
 * Each case below fails on the unfixed `runBurgee`, which is the only reason they are worth
 * having: a harness defect is invisible by construction, because the thing it breaks is the
 * evidence.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const dir = mkdtempSync(join(tmpdir(), 'burgee-harness-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the harness forwards what the caller configured (T1)', () => {
  it('forwards TTY-ness, so `tty: true` is a terminal and not the agent floor', async () => {
    const seen: { interactive: boolean }[] = [];
    const program = defineProgram({
      name: 'probe',
      version: '1.0.0',
      commands: [
        defineCommand({
          name: 'look',
          effects: 'read_only',
          run: (ctx) => {
            seen.push({ interactive: ctx.interactive });
            return { ok: true };
          },
        }),
      ],
    });

    await runBurgee(program, { argv: ['look'], tty: true });
    await runBurgee(program, { argv: ['look'], tty: false });
    expect(seen.map((s) => s.interactive), 'the harness computed `isTTY` and then handed `execute` a bare `{ write }`, so N12 read no terminal').toEqual([true, false]);
  });

  it('forwards cwd, so config discovery starts where the test said', async () => {
    writeFileSync(join(dir, 'harnessprobe.config.json'), JSON.stringify({ greeting: 'from the fixture' }));
    const seen: string[] = [];
    const program = defineProgram({
      name: 'harnessprobe',
      version: '1.0.0',
      config: { name: 'harnessprobe' },
      commands: [
        defineCommand({
          name: 'say',
          effects: 'read_only',
          options: { greeting: { type: 'string', description: 'what to say' } },
          run: (ctx) => {
            seen.push(String(ctx.options.greeting));
            return { ok: true };
          },
        }),
      ],
    });

    await runBurgee(program, { argv: ['say'], cwd: dir });
    expect(seen[0], 'config discovery fell through to the real process directory, so the fixture was never read').toBe('from the fixture');
  });
});
