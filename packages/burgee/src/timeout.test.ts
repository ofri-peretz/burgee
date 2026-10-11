/**
 * agent-lint-conformance R3 — `--timeout <duration>` is global, and a timeout has its own exit
 * code. On expiry `ctx.signal` aborts, the run's exit handlers run once inside closeout's
 * deadline, and the process leaves with `ExitCode.TIMEOUT` — 6, not GNU's 124, because 124 is
 * inside the 7–125 range `defineError` publishes to authors (D-20261011-timeout-exit-code).
 *
 * A deadline the caller sets is the difference between an agent that retries with more time
 * and one that waits on a hang it cannot see.
 */
import { describe, expect, it } from 'vitest';

import { duration } from './globals.js';
import { defineCommand, defineProgram, ExitCode, runCommand } from './index.js';

let signal: AbortSignal | undefined;
let cleaned = 0;

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'hang',
      description: 'Wait forever',
      effects: 'read_only',
      examples: [{ command: 'app hang --timeout 5s' }],
      run: async (ctx) => {
        signal = ctx.signal;
        ctx.onExit(() => void (cleaned += 1), 'count the cleanup');
        // A handle, so the wait is a real one: a handler waiting on a socket looks like this.
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        return 'never';
      },
    }),
    defineCommand({
      name: 'quick',
      effects: 'read_only',
      examples: [{ command: 'app quick' }],
      run: (ctx) => {
        signal = ctx.signal;
        return 'done';
      },
    }),
    defineCommand({ name: 'mine', effects: 'read_only', options: { timeout: { type: 'number', description: 'seconds to wait' } }, run: ({ options }) => String(options.timeout) }),
  ],
});

describe('--timeout <duration> ends the run, with its own exit code (R3)', () => {
  it('a handler awaiting forever under --timeout 50 exits TIMEOUT, its cleanup ran once, and ctx.signal aborted', async () => {
    cleaned = 0;
    const started = performance.now();
    const r = await runCommand(program, ['hang', '--timeout', '50']);
    const took = performance.now() - started;
    expect(r.code).toBe(ExitCode.TIMEOUT);
    expect(ExitCode.TIMEOUT).toBe(6);
    // 50 ms plus closeout's deadline for the exit handlers; nowhere near the handler's 60 s.
    expect(took).toBeGreaterThanOrEqual(45);
    expect(took).toBeLessThan(5000);
    expect(cleaned).toBe(1);
    expect(signal?.aborted).toBe(true);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(`error: timed out after 50 ms\nhint: run it again with a larger --timeout\n${JSON.stringify({ error: { kind: 'timeout', code: 6, message: 'timed out after 50 ms' } })}\n`);
  });

  it('says so in the --json envelope, with the code, on stdout', async () => {
    const r = await runCommand(program, ['hang', '--timeout=20ms', '--json']);
    expect(r.code).toBe(ExitCode.TIMEOUT);
    expect(JSON.parse(r.stdout)).toEqual({ ok: false, error: { kind: 'timeout', code: 6, message: 'timed out after 20 ms', hint: 'run it again with a larger --timeout' } });
  });

  it.each([
    ['250', 250],
    ['250ms', 250],
    ['1s', 1000],
    ['2m', 120_000],
  ])('reads %s as %i ms: ms, s and m, and a bare number as milliseconds', async (typed, ms) => {
    expect(duration(typed)).toBe(ms);
    expect(await runCommand(program, ['quick', '--timeout', typed])).toEqual({ code: 0, stdout: 'done\n', stderr: '' });
    expect(await runCommand(program, ['quick', `--timeout=${typed}`])).toEqual({ code: 0, stdout: 'done\n', stderr: '' });
    expect(signal?.aborted).toBe(false);
  });

  it.each(['soon', '0', '-5', '1h', '1.5s', ''])('refuses the duration "%s", as a usage error naming the forms it takes', async (typed) => {
    const r = await runCommand(program, ['quick', `--timeout=${typed}`]);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toMatch(/^error: --timeout takes a duration such as 500ms, 5s or 2m, not "/);
  });

  it('refuses --timeout as the last word, with nothing to read', async () => {
    expect((await runCommand(program, ['quick', '--timeout'])).stderr).toMatch(/^error: --timeout takes a duration such as 500ms, 5s or 2m, not ""\n/);
  });

  it('a handler that fails before the deadline fails as itself, not as a timeout', async () => {
    const failing = defineProgram({ name: 'app', commands: [defineCommand({ name: 'boom', effects: 'read_only', run: () => Promise.reject(new Error('it broke')) })] });
    const r = await runCommand(failing, ['boom', '--timeout', '5s']);
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toMatch(/^error: it broke\n/);
  });

  it('a run without --timeout still has a signal, which never aborts', async () => {
    expect((await runCommand(program, ['quick'])).code).toBe(0);
    expect(signal?.aborted).toBe(false);
  });

  it('is listed under Global options, and steps aside for a command that declares its own', async () => {
    expect((await runCommand(program, ['--help'])).stdout).toMatch(/^ {2}--timeout <duration> +end the run after this long, exit 6: 500ms, 5s, 2m/m);
    expect((await runCommand(program, ['mine', '--timeout', '3'])).stdout).toBe('3\n');
    expect((await runCommand(program, ['mine', '--help'])).stdout).not.toContain('--timeout <duration>');
  });
});
