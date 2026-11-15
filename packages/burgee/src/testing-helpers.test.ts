import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import { captureConsole, codeOf, fakeClock, fakeRuntime, finish, processRuntime, RuntimeExit, stripAnsi, swapEnv } from './testing.js';

describe('fakeRuntime', () => {
  it('captures both streams and reports the TTY-ness the test asked for', () => {
    const rt = fakeRuntime({ argv: ['x'], tty: { stdout: true } });
    rt.stdout.write('a');
    rt.stderr.write('b');
    expect(rt.out).toEqual(['a']);
    expect(rt.err).toEqual(['b']);
    expect(rt.isTTY).toEqual({ stdin: false, stdout: true, stderr: false });
  });

  it('exit unwinds with the code instead of ending the process', () => {
    const rt = fakeRuntime({ argv: [] });
    expect(() => rt.exit(ExitCode.CONFIG)).toThrow(RuntimeExit);
    try {
      rt.exit(ExitCode.CONFIG);
    } catch (e) {
      expect(codeOf(e)).toBe(ExitCode.CONFIG);
    }
  });

  it('turns a string stdin into a readable', async () => {
    const rt = fakeRuntime({ argv: [], stdin: 'hello\n' });
    let text = '';
    for await (const chunk of rt.stdin) text += String(chunk);
    expect(text).toBe('hello\n');
  });
});

// The byte-for-byte R7 lock is `testing-helpers-env.test.ts`, which a mutation run skips
// (`scripts/mutation.ts` says why). These hold what it does without depending on key order.
describe('swapEnv, by value', () => {
  it('swaps the real env in place for the injected one, and puts back every key and value', () => {
    // A key of its own, so a restore that puts nothing back fails here even when the env this
    // test inherited was already empty.
    process.env.SWAP_ENV_KEPT = 'from before the swap';
    try {
      const env = process.env;
      const before = { ...process.env };
      const restore = swapEnv({ ONLY: 'this' });
      expect(process.env).toBe(env);
      expect({ ...process.env }).toEqual({ ONLY: 'this' });
      restore();
      expect(process.env).toBe(env);
      expect({ ...process.env }).toEqual(before);
      expect(process.env.SWAP_ENV_KEPT).toBe('from before the swap');
      expect(process.env.ONLY).toBeUndefined();
    } finally {
      delete process.env.SWAP_ENV_KEPT;
    }
  });

  it('without an env to inject, touches nothing and restores nothing', () => {
    const before = { ...process.env };
    const restore = swapEnv(undefined);
    expect({ ...process.env }).toEqual(before);
    process.env.SWAP_ENV_PROBE = 'set after the swap';
    try {
      restore();
      expect(process.env.SWAP_ENV_PROBE).toBe('set after the swap');
    } finally {
      delete process.env.SWAP_ENV_PROBE;
    }
  });
});

describe('captureConsole', () => {
  it('routes console output into the runtime and restores the real console', () => {
    const rt = fakeRuntime({ argv: [] });
    const original = console.log;
    const restore = captureConsole(rt);
    console.log('to', 'stdout');
    console.error('to stderr');
    restore();
    expect(rt.out).toEqual(['to stdout\n']);
    expect(rt.err).toEqual(['to stderr\n']);
    expect(console.log).toBe(original);
  });
});

describe('finish (R2)', () => {
  it('parses stdout under --json and fails the run when it does not parse', () => {
    const ok = fakeRuntime({ argv: ['--json'] });
    ok.out.push('{"a":1}\n');
    expect(finish(ok, ExitCode.OK, performance.now()).json).toEqual({ a: 1 });

    const bad = fakeRuntime({ argv: ['--json'] });
    bad.out.push('not json');
    const r = finish(bad, ExitCode.OK, performance.now());
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toContain('--json output did not parse');
  });

  it('leaves json unset without --json', () => {
    const rt = fakeRuntime({ argv: [] });
    rt.out.push('{"a":1}');
    expect(finish(rt, ExitCode.OK, performance.now()).json).toBeUndefined();
  });
});

describe('clock (R14 of cli-output-stack)', () => {
  it('the fake clock moves only on tick, and runs what falls due in order', () => {
    const clock = fakeClock();
    const ran: string[] = [];
    clock.schedule(() => ran.push('b'), 20);
    clock.schedule(() => ran.push('a'), 10);
    clock.schedule(() => ran.push('a2'), 10);
    const cancel = clock.schedule(() => ran.push('never'), 15);
    expect(clock.now()).toBe(0);
    expect(clock.pending()).toBe(4);
    clock.tick(5);
    expect(ran).toEqual([]);
    expect(clock.now()).toBe(5);
    cancel();
    clock.tick(10);
    expect(ran).toEqual(['a', 'a2']);
    expect(clock.now()).toBe(15);
    clock.tick(100);
    expect(ran).toEqual(['a', 'a2', 'b']);
    expect(clock.now()).toBe(115);
    expect(clock.pending()).toBe(0);
  });

  it('a callback sees the time it was due at, and one it schedules inside the window runs in the same tick', () => {
    const clock = fakeClock(1000);
    const seen: number[] = [];
    clock.schedule(() => {
      seen.push(clock.now());
      clock.schedule(() => seen.push(clock.now()), 5);
    }, 10);
    clock.tick(30);
    expect(seen).toEqual([1010, 1015]);
    expect(clock.now()).toBe(1030);
  });

  it('a callback that reschedules itself at zero delay fails the tick at the cap instead of hanging', () => {
    const clock = fakeClock();
    let runs = 0;
    const again = (): void => {
      runs += 1;
      clock.schedule(again, 0);
    };
    clock.schedule(again, 0);
    expect(() => clock.tick(1)).toThrow(/ran 1000 callbacks \(TICK_CAP\)/);
    expect(runs).toBe(1000);
  });

  it('cancelling twice, or after the callback ran, is harmless', () => {
    const clock = fakeClock();
    let runs = 0;
    const cancel = clock.schedule(() => {
      runs += 1;
    }, 1);
    clock.tick(1);
    cancel();
    cancel();
    expect(runs).toBe(1);
  });

  it('fakeRuntime carries a fake clock, its own or the one the test passes', () => {
    const own = fakeRuntime({ argv: [] });
    expect(own.clock.now()).toBe(0);
    own.clock.tick(3);
    expect(own.clock.now()).toBe(3);
    const shared = fakeClock(7);
    expect(fakeRuntime({ argv: [], clock: shared }).clock).toBe(shared);
  });

  it('the process runtime reads performance.now and setTimeout, and the returned function cancels', async () => {
    const t0 = processRuntime.clock.now();
    expect(typeof t0).toBe('number');
    let fired = false;
    const cancel = processRuntime.clock.schedule(() => {
      fired = true;
    }, 0);
    cancel();
    await new Promise((r) => setTimeout(r, 5));
    expect(fired).toBe(false);
    expect(processRuntime.clock.now()).toBeGreaterThanOrEqual(t0);
  });
});

describe('codeOf and stripAnsi', () => {
  it('maps an error carrying an E1 exitCode, and RUNTIME otherwise', () => {
    expect(codeOf({ exitCode: ExitCode.USAGE })).toBe(ExitCode.USAGE);
    expect(codeOf({ exitCode: 99 })).toBe(ExitCode.RUNTIME);
    expect(codeOf(new Error('x'))).toBe(ExitCode.RUNTIME);
  });

  it('strips colour sequences and nothing else', () => {
    expect(stripAnsi('[31mred[0m plain')).toBe('red plain');
  });

  // The regex this used to be, `ESC[[0-9;]*[A-Za-z]`, left each of these in the text.
  it.each([
    ['a private mode', '\u001B[?25lspinning\u001B[?25h', 'spinning'],
    ['the colon form of a truecolor SGR', '\u001B[38:2::255:0:0mred\u001B[39m', 'red'],
    ['an OSC 8 hyperlink', '\u001B]8;;https://example.com\u0007docs\u001B]8;;\u0007', 'docs'],
  ])('strips %s', (_what, input, expected) => {
    expect(stripAnsi(input)).toBe(expected);
  });
});

/**
 * The parts of the harness the cases above reach only on their happy path: the defaults a
 * runtime starts from, every console method, a clock handed its callbacks out of order, and a
 * failed run's envelope behind a blank stdout.
 */
describe('the harness, past its happy path', () => {
  it('names the exit it unwinds with', () => {
    const e = new RuntimeExit(ExitCode.CONFIG);
    expect(e.name).toBe('RuntimeExit');
    expect(e.message).toBe(`runtime.exit(${String(ExitCode.CONFIG)})`);
  });

  it('starts at the root, with an empty stdin that is a stream, and with no TTY unless asked', async () => {
    const rt = fakeRuntime({ argv: [] });
    expect(rt.cwd).toBe('/');
    expect(rt.stdin).toBeInstanceOf(Readable);
    let text = '';
    for await (const chunk of rt.stdin) text += String(chunk);
    expect(text).toBe('');
    expect(rt.isTTY).toEqual({ stdin: false, stdout: false, stderr: false });
    expect(fakeRuntime({ argv: [], stdin: 'x' }).stdin).toBeInstanceOf(Readable);
  });

  it('reads tty as all, none, or each stream it names', () => {
    expect(fakeRuntime({ argv: [], tty: true }).isTTY).toEqual({ stdin: true, stdout: true, stderr: true });
    expect(fakeRuntime({ argv: [], tty: false }).isTTY).toEqual({ stdin: false, stdout: false, stderr: false });
    expect(fakeRuntime({ argv: [], tty: { stderr: true } }).isTTY).toEqual({ stdin: false, stdout: false, stderr: true });
  });

  it('routes every console method and puts every one back', () => {
    const originals = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error };
    const rt = fakeRuntime({ argv: [] });
    const restore = captureConsole(rt);
    try {
      console.info('i');
      console.debug('d');
      console.warn('w');
    } finally {
      restore();
    }
    expect(rt.out).toEqual(['i\n', 'd\n']);
    expect(rt.err).toEqual(['w\n']);
    for (const m of ['log', 'info', 'debug', 'warn', 'error'] as const) expect(console[m]).toBe(originals[m]);
  });

  it('runs what falls due earliest first, whatever order it was scheduled in, and ties in that order', () => {
    const clock = fakeClock();
    const ran: string[] = [];
    clock.schedule(() => ran.push('late'), 20);
    clock.schedule(() => ran.push('early'), 10);
    clock.schedule(() => ran.push('tie 1'), 15);
    clock.schedule(() => ran.push('tie 2'), 15);
    clock.schedule(() => ran.push('tie 3'), 15);
    clock.tick(30);
    expect(ran).toEqual(['early', 'tie 1', 'tie 2', 'tie 3', 'late']);
  });

  it('cancelling a callback that already ran leaves the others scheduled', () => {
    const clock = fakeClock();
    const cancel = clock.schedule(() => undefined, 1);
    clock.schedule(() => undefined, 50);
    clock.tick(1);
    cancel();
    expect(clock.pending()).toBe(1);
  });

  it('times the run from the moment it was handed', () => {
    const r = finish(fakeRuntime({ argv: [] }), ExitCode.OK, performance.now());
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.durationMs).toBeLessThan(60_000);
  });

  it('under --json, takes a failed run’s envelope from stderr when stdout is only whitespace', () => {
    const rt = fakeRuntime({ argv: ['--json'] });
    rt.out.push('\n');
    rt.err.push('{"error":"x"}\nmore\n');
    const r = finish(rt, ExitCode.USAGE, performance.now());
    expect(r.json).toEqual({ error: 'x' });
    expect(r.code).toBe(ExitCode.USAGE);
  });

  it('reads no exit code off null', () => {
    expect(codeOf(null)).toBe(ExitCode.RUNTIME);
  });
});
