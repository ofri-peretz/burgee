/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * closeout hosts `handlers` — `plugin-contract` R1, R5a, R6, R8.
 *
 * The load-bearing case is `runs a plugin's handler before terminal restore`. Everything
 * else in this file is the door: what is refused, and what is ignored rather than refused.
 *
 * **Why the restore is registered first in every ordering case.** A plugin handler that
 * happens to be registered before the cursor was hidden would run first under *any*
 * implementation, including the flat set this package shipped before phases existed — so a
 * test written that way passes on the bug and proves nothing. These cases hide the cursor
 * first, on purpose, so registration order and phase order disagree and only the phase
 * order can produce the asserted result.
 */
import { describe, expect, it, vi } from 'vitest';

import { SHOW_CURSOR } from './cursor.js';
import { install, type ProcessLike } from './index.js';
import { attach, contributions, PluginError, register, registered, reset, validate } from './plugin.js';

type Listener = (...args: never[]) => void;

/** A process that records rather than acts — the same shape `install.test.ts` uses. */
function fakeProcess(): ProcessLike {
  const self = {
    on: () => self,
    removeListener: () => self,
    listenerCount: () => 0,
    exit: (): never => undefined as never,
    stderr: { write: () => true, isTTY: true },
  };
  return self;
}

/**
 * A TTY that appends to `log` when the cursor comes back, so terminal restore is an entry
 * in the same sequence the handlers write to and the ordering is one array to read.
 */
function recordingTty(log: string[]): { write(chunk: string): boolean; isTTY: boolean } {
  return {
    isTTY: true,
    write(chunk: string): boolean {
      if (chunk === SHOW_CURSOR) log.push('restore');
      return true;
    },
  };
}

const EXITED = { code: 0, signal: null };

describe("a plugin's handler and terminal restore", () => {
  it('runs the handler before the restore, though the restore was registered first', async () => {
    reset();
    const log: string[] = [];
    const closeout = install({ process: fakeProcess() });

    // Registration order, deliberately the wrong way round: the renderer hid the cursor the
    // moment it started drawing, and the plugin loaded afterwards.
    closeout.hideCursor(recordingTty(log));
    register({
      name: 'acme',
      handlers: [{ name: 'unlock', run: () => { log.push('acme:unlock'); } }],
    });
    attach(closeout.registry);

    await closeout.registry.run(EXITED);

    /*
     * THE assertion. A handler that ran after this point would be writing into a terminal
     * already handed back and releasing a lock the user already has their prompt without —
     * which is to say it would not be cleaning up what it was registered to clean up.
     *
     * Proven red by reversing PHASES in registry.ts: this reads ['restore', 'acme:unlock'].
     */
    expect(log).toEqual(['acme:unlock', 'restore']);
  });

  it('waits for an async handler before the restore, rather than merely starting it first', async () => {
    reset();
    const log: string[] = [];
    const closeout = install({ process: fakeProcess() });

    closeout.hideCursor(recordingTty(log));
    register({
      name: 'acme',
      handlers: [
        {
          name: 'drain',
          run: async () => {
            // A real flush yields. Sorting the *calls* without sequencing the *phases* would
            // put the restore in this gap, which is the same bug with tidier bookkeeping.
            await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
            log.push('acme:drain');
          },
        },
      ],
    });
    attach(closeout.registry);

    await closeout.registry.run(EXITED);

    expect(log).toEqual(['acme:drain', 'restore']);
  });

  it('restores the terminal even when a plugin handler never returns', async () => {
    reset();
    const log: string[] = [];
    const closeout = install({ process: fakeProcess(), deadline: 10 });

    closeout.hideCursor(recordingTty(log));
    register({
      name: 'acme',
      handlers: [{ name: 'never', phase: 'flush', run: () => new Promise<void>(() => undefined) }],
    });
    attach(closeout.registry);

    // The deadline breaches, and the report names the plugin's handler by its contributed
    // id — the one thing `PluginHandler.name` is required for (design R3, R12).
    await expect(closeout.registry.run(EXITED)).resolves.toMatchObject({ timedOut: true, unfinished: ['acme:never'] });

    // The deadline stops the *waiting*, not the remaining phases. A hung plugin that could
    // strand a hidden cursor would be this package failing at its own stated job.
    expect(log).toEqual(['restore']);
  });

  it('keeps the phases in their declared order across two plugins', async () => {
    reset();
    const log: string[] = [];
    const closeout = install({ process: fakeProcess() });

    closeout.hideCursor(recordingTty(log));
    register({ name: 'late', handlers: [{ name: 'release', phase: 'release', run: () => { log.push('late:release'); } }] });
    register({ name: 'early', handlers: [{ name: 'flush', phase: 'flush', run: () => { log.push('early:flush'); } }] });
    attach(closeout.registry);

    await closeout.registry.run(EXITED);

    // `early` registered second and still runs first: the phase decides, not the arrival.
    expect(log).toEqual(['early:flush', 'late:release', 'restore']);
  });

  it('holds on the synchronous path too, which is the one `process.on("exit")` takes', () => {
    reset();
    const log: string[] = [];
    const closeout = install({ process: fakeProcess() });

    closeout.hideCursor(recordingTty(log));
    register({ name: 'acme', handlers: [{ name: 'unlock', run: () => { log.push('acme:unlock'); } }] });
    attach(closeout.registry);

    closeout.registry.runSync(EXITED);

    expect(log).toEqual(['acme:unlock', 'restore']);
  });
});

describe('the contributed handlers, read without running them', () => {
  it('projects the shutdown sequence as data', () => {
    reset();
    register({ name: 'late', handlers: [{ name: 'b', phase: 'release', run: () => undefined }] });
    register({ name: 'early', handlers: [{ name: 'a', phase: 'flush', run: () => undefined }] });

    expect(contributions().map((c) => `${c.phase} ${c.id}`)).toEqual(['flush early:a', 'release late:b']);
  });

  it('defaults an unphased handler to release, which is before restore', () => {
    reset();
    register({ name: 'acme', handlers: [{ name: 'unlock', run: () => undefined }] });

    expect(contributions().map((c) => c.phase)).toEqual(['release']);
  });

  it('takes the handlers back off again', async () => {
    reset();
    const run = vi.fn();
    const closeout = install({ process: fakeProcess() });
    register({ name: 'acme', handlers: [{ name: 'unlock', run }] });

    attach(closeout.registry)();
    await closeout.registry.run(EXITED);

    expect(run).not.toHaveBeenCalled();
  });
});

describe('the door', () => {
  it('keeps another layer’s object without complaining (R1)', () => {
    reset();
    // A flagstaff plugin, registered here. Its keys are not closeout's business and are not
    // an error — that is what makes one object work on any subset of the family.
    register({
      name: 'acme',
      contract: 1,
      tokens: { error: '#ff0000' },
      glyphs: { ok: '✔' },
      spinners: { dots: { frames: ['.'], interval: 80, static: '…' } },
      components: { bar: { static: () => 'bar' } },
    });

    expect(registered().map((p) => p.name)).toEqual(['acme']);
    expect(contributions()).toEqual([]);
  });

  it('refuses a handler in the restore phase, because "never after it" has to be enforced somewhere', () => {
    expect(() => { validate({ name: 'acme', handlers: [{ name: 'x', phase: 'restore', run: () => undefined }] }); })
      .toThrow(/not a phase a plugin may use/);
  });

  it('names the phases a plugin may use, so the fix is readable from the message', () => {
    try {
      validate({ name: 'acme', handlers: [{ name: 'x', phase: 'teardown', run: () => undefined }] });
      expect.unreachable('an unknown phase must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(PluginError);
      expect((error as PluginError).code).toBe('E_PLUGIN_SCHEMA');
      expect((error as PluginError).fix).toContain('flush, release');
    }
  });

  it('refuses a handler with no run(), rather than registering something that cannot clean up', () => {
    expect(() => { validate({ name: 'acme', handlers: [{ name: 'x' }] }); }).toThrow(/has no run\(\)/);
  });

  it('refuses a handler with no name, because the deadline report has to name it', () => {
    expect(() => { validate({ name: 'acme', handlers: [{ run: () => undefined }] }); }).toThrow(/has no name/);
  });

  it('refuses handlers that are not an array', () => {
    expect(() => { validate({ name: 'acme', handlers: { unlock: () => undefined } }); }).toThrow(/must be an array/);
  });

  it('refuses a newer contract than this closeout knows (R6)', () => {
    try {
      validate({ name: 'acme', contract: 2 });
      expect.unreachable('a newer contract must be refused');
    } catch (error) {
      expect((error as PluginError).code).toBe('E_PLUGIN_CONTRACT');
      expect((error as PluginError).fix).toContain('upgrade closeout');
    }
  });

  it('refuses an unnamed plugin, and a plugin that is not an object', () => {
    expect(() => { validate({ handlers: [] }); }).toThrow(/needs a name/);
    expect(() => { validate(() => undefined); }).toThrow(/plain object/);
  });

  it('does not keep a plugin it refused', () => {
    reset();
    expect(() => { register({ name: 'acme', handlers: [{ name: 'x', phase: 'restore', run: () => undefined }] }); }).toThrow(PluginError);
    expect(registered()).toEqual([]);
  });
});
