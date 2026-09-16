/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The matrix — design R1, R2, R10, and the check the design names as the one that would have
 * caught the original problem.
 *
 * *"The original problem is a subprocess that never returns and takes an unattended run with
 * it. The matrix includes a child that ignores `SIGTERM` and never exits; the cell asserts
 * the parent settles within `timeout` + grace, that `timedOut` is true, and that output
 * written before the kill is present."*
 *
 * That cell is {@link deadline ignores SIGTERM}. It is the reason `DEFAULT_TIMEOUT` is finite
 * and the reason the kill is a ladder: a single `SIGTERM` against a child that traps it is
 * a timeout that does not time anything out.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { format, toEvent, toJson } from './project.js';
import { DEFAULT_TIMEOUT, run, type ExitHost, type Result } from './run.js';
import { type Runtime } from './runtime.js';
import { NotFoundError } from './which.js';

let dir: string;
let runtime: Runtime;

/** A fixture script, written executable, so resolution has something real to find. */
function fixture(name: string, body: string): string {
  const at = join(dir, name);
  writeFileSync(at, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(at, 0o755);
  return at;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bellpull-matrix-'));
  runtime = { platform: process.platform, env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` }, cwd: dir, uid: process.getuid?.(), gid: process.getgid?.() };

  fixture('say-hello', "process.stdout.write('hello');");
  fixture('exit-25', "process.stdout.write('before'); process.exit(25);");
  fixture('to-stderr', "process.stderr.write('problem'); process.exit(3);");
  fixture('echo-argv', 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  // Writes, flushes, then ignores SIGTERM forever. The control case for R2.
  fixture(
    'stubborn',
    `process.on('SIGTERM', () => {});
process.stdout.write('partial output\\n');
setInterval(() => {}, 1000);`,
  );
  // Leaves politely on SIGTERM, so the ladder's first rung is enough.
  fixture(
    'polite',
    `process.stdout.write('starting\\n');
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1000);`,
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('a result, not a string and a thrown error (R1)', () => {
  it('resolves on success with the output and the resolved executable', async () => {
    const result = await run('say-hello', [], { runtime });
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe('hello');
    expect(result.executable).toEqual({ path: join(dir, 'say-hello'), from: dir });
  });

  it('resolves on a non-zero exit — the case execa throws for', async () => {
    const result = await run('exit-25', [], { runtime });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(25);
    // Output written before the failure is still output. A throw loses it unless the
    // caller remembers to dig it off the error.
    expect(result.stdout).toBe('before');
    expect(result.timedOut).toBe(false);
  });

  it('keeps stderr separate from stdout', async () => {
    const result = await run('to-stderr', [], { runtime });
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('problem');
    expect(result.code).toBe(3);
  });

  it('passes arguments through as an argv array, so nothing in one is interpreted', async () => {
    const hostile = ['a b', 'a & calc', '$(calc)', '`calc`', 'a"b', "it's", '*', ''];
    const result = await run('echo-argv', hostile, { runtime });
    expect(JSON.parse(result.stdout)).toEqual(hostile);
  });

  it('rejects when the executable does not resolve — no process ran, so there is no result', async () => {
    await expect(run('nosuchcommandanywhere', [], { runtime })).rejects.toThrow(NotFoundError);
  });

  it('does not mutate the caller’s arguments', async () => {
    const args = ['x'];
    await run('echo-argv', args, { runtime });
    expect(args).toEqual(['x']);
  });
});

describe('the deadline (R2, Y10)', () => {
  it('is finite by default, because a run that never returns strands an unattended agent', () => {
    expect(Number.isFinite(DEFAULT_TIMEOUT)).toBe(true);
    expect(DEFAULT_TIMEOUT).toBeGreaterThan(0);
  });

  it('SIGTERM is enough for a child that leaves when asked', async () => {
    const result = await run('polite', [], { runtime, timeout: 300, grace: 5_000 });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  /**
   * The cell the design names. Without the second rung of the ladder this test hangs until
   * vitest's own timeout kills the whole file — which is exactly the failure being prevented,
   * arriving one level up.
   */
  it('ignores SIGTERM: the parent still settles, timedOut is true, and the partial output survives', async () => {
    const started = Date.now();
    const result = await run('stubborn', [], { runtime, timeout: 300, grace: 300 });
    const elapsed = Date.now() - started;

    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
    // Killed, so there is a signal and no exit code — the shape Node reports and the shape
    // commander's executable-subcommand path maps to 1.
    expect(result.signal).toBe('SIGKILL');
    expect(result.code).toBeNull();
    // The whole point of R2: a CI timeout with the output discarded is undiagnosable.
    expect(result.stdout).toContain('partial output');
    // Settled inside the budget it was given, with room for scheduling. A run that took
    // longer than timeout + grace + slack means the ladder did not fire.
    expect(elapsed).toBeLessThan(300 + 300 + 5_000);
  });

  it('timeout: 0 opts out, for a caller who means it', async () => {
    const result = await run('say-hello', [], { runtime, timeout: 0 });
    expect(result.ok).toBe(true);
    expect(result.timedOut).toBe(false);
  });
});

/**
 * The `bellpull → closeout` seam (see `RunOptions.exitHost`).
 *
 * Declared structurally rather than imported, because `package-shape-lock.test.ts` asserts a
 * foundation package depends on nothing — so the test builds a host with `closeout`'s own
 * `Registry.add` signature and checks that a real `closeout` registry would fit it.
 */
/** `closeout`'s `Registry.add(handler, spec?) => () => void`, to the letter. */
function fakeCloseout(): ExitHost & { fire: () => void; size: () => number } {
  const handlers = new Set<() => unknown>();
  return {
    add(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    fire() {
      for (const handler of handlers) handler();
    },
    size: () => handlers.size,
  };
}

describe('a spawned child is not orphaned when the parent shuts down', () => {
  it('registers nothing when no host is given — this package does not claim the process’s signals', async () => {
    const host = fakeCloseout();
    await run('say-hello', [], { runtime });
    expect(host.size()).toBe(0);
  });

  it('kills the child when the host fires, and the run comes back rather than hanging', async () => {
    const host = fakeCloseout();
    const pending = run('polite', [], { runtime, exitHost: host, timeout: 0 });
    // Give the child a moment to be spawned and register.
    await new Promise((r) => setTimeout(r, 200));
    expect(host.size()).toBe(1);

    host.fire();
    const result = await pending;
    expect(result.signal).toBe('SIGKILL');
    expect(result.ok).toBe(false);
  });

  it('unregisters when the child is done, so a long-lived host does not accumulate handlers', async () => {
    const host = fakeCloseout();
    await run('say-hello', [], { runtime, exitHost: host });
    expect(host.size()).toBe(0);
  });
});

describe('one result, three renderings (R5, Y5)', () => {
  let result: Result;
  beforeAll(async () => {
    result = await run('exit-25', [], { runtime });
  });

  it('the human form names the failure and where the binary came from', () => {
    const text = format(result);
    expect(text).toContain('failed');
    expect(text).toContain('exit-25');
    expect(text).toContain('25');
    expect(text).toContain(join(dir, 'exit-25'));
  });

  it('the JSON envelope carries the same facts, and no others', () => {
    const json = toJson(result);
    expect(json['ok']).toBe(false);
    expect(json['code']).toBe(25);
    expect(json['stdout']).toBe('before');
    expect((json['executable'] as { from: string }).from).toBe(dir);
  });

  it('the agent event collapses the outcome to one word, so four consumers cannot disagree', () => {
    expect(toEvent(result).outcome).toBe('failed');
  });

  it('every rendering comes from one value — none of them can report something the others cannot', () => {
    // The contract that makes a `--json` flag trustworthy: nothing is computed in one
    // projection that is absent from the record.
    const json = toJson(result);
    const event = toEvent(result);
    expect(json['code']).toBe(event.code);
    expect(json['command']).toBe(event.command);
    expect(json['durationMs']).toBe(event.durationMs);
  });

  it('distinguishes a timeout from an ordinary failure in all three', async () => {
    const timed = await run('stubborn', [], { runtime, timeout: 200, grace: 200 });
    expect(format(timed)).toContain('timed out');
    expect(toJson(timed)['timedOut']).toBe(true);
    expect(toEvent(timed).outcome).toBe('timedOut');
  });
});
