/**
 * The façade's own locks, on top of the 99 tests ora's suite contributes through
 * `compat-oracle`.
 *
 * The one that matters is R5 on a migration: `output-stack-compat` constraint 2 says a
 * façade may not lower the layer's guarantees, and the guarantee here is that nothing but
 * text leaves the process off a terminal. ora already honours it — `isInteractive()` is
 * false for a pipe and for CI, and a disabled spinner writes one static line per state —
 * which is why the port keeps that path byte for byte instead of reinterpreting it. Its own
 * suite never asserts this, because every frame test there passes `isEnabled: true` to
 * force the animation on; so it is asserted here, on the default a real program gets.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import ora, { oraPromise, spinners } from './ora.js';

/**
 * The complaint R5 exists for (clack #510): frames separated by carriage returns, captured
 * whole by whatever read the pipe. Escapes are asserted with them: off a terminal a
 * disabled spinner writes a plain line, and the log symbol only carries colour when chalk
 * says the real process can take it.
 */
const CARRIAGE_RETURN_OR_ESCAPE = /[\r\u001B]/;

/** A stream shaped like a pipe: writable, not a terminal, remembering what it was given. */
function pipe(): { write: (s: string) => boolean; text: () => string } {
  const chunks: string[] = [];
  return {
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
    text: () => chunks.join(''),
  };
}

describe('R5 · a migrated spinner on a pipe writes text and nothing else', () => {
  it('one static line per state, and no carriage return anywhere in it', () => {
    const stream = pipe();
    const spinner = ora({ stream, text: 'building' });
    expect(spinner.isEnabled).toBe(false);
    spinner.start();
    spinner.text = 'linking';
    spinner.succeed('built');
    expect(stream.text()).toMatch(/^- building\n[✔√] built\n$/);
    expect(stream.text()).not.toMatch(CARRIAGE_RETURN_OR_ESCAPE);
  });

  it('under CI the same, even when the stream claims to be a terminal', () => {
    const stream = { ...pipe(), isTTY: true };
    const before = process.env['CI'];
    process.env['CI'] = 'true';
    try {
      const spinner = ora({ stream, text: 'building' });
      expect(spinner.isEnabled).toBe(false);
      spinner.start();
      spinner.fail('broke');
      expect(stream.text()).not.toMatch(CARRIAGE_RETURN_OR_ESCAPE);
    } finally {
      if (before === undefined) delete process.env['CI'];
      else process.env['CI'] = before;
    }
  });

  it('an explicitly enabled spinner does animate — the escape hatch ora programs use', () => {
    const stream = pipe();
    ora({ stream, text: 'x', isEnabled: true, color: false }).start().stop();
    expect(stream.text()).toContain(' x');
  });
});

/**
 * ora resolves a *named* style only where the terminal can draw it; without unicode it
 * substitutes `line` before it ever looks at the name, and so never rejects one either.
 * Its own suite handles this by picking the expected character off `process.platform`;
 * these two cases skip instead, because what they assert is the naming, not the fallback —
 * which is asserted below, on every platform.
 */
const namesResolve = ora({ spinner: 'moon' }).spinner === spinners['moon'];

describe('the corpus travels with the façade', () => {
  it('re-exports every cli-spinners style', () => {
    expect(Object.keys(spinners).length).toBeGreaterThan(80);
    expect(spinners['dots']?.frames).toHaveLength(10);
  });

  it.skipIf(!namesResolve)('names one by string', () => {
    expect(ora({ spinner: 'moon' }).spinner).toBe(spinners['moon']);
  });

  it.skipIf(!namesResolve)('refuses a style it does not have, with the name in the message', () => {
    expect(() => ora({ spinner: 'nope' })).toThrow(/no built-in spinner named 'nope'/);
  });

  it('falls back to a drawable style rather than failing, wherever unicode is missing', () => {
    const chosen = ora({ spinner: 'moon' }).spinner;
    expect(chosen).toBe(namesResolve ? spinners['moon'] : spinners['line']);
  });

  it('takes a spinner object whatever the terminal can draw', () => {
    const custom = { frames: ['a', 'b'], interval: 100 };
    expect(ora({ spinner: custom }).spinner).toBe(custom);
    expect(() => ora({ spinner: { frames: [] } })).toThrow(/non-empty `frames` array/);
  });
});

describe('oraPromise', () => {
  it('lands on the success symbol and returns the value', async () => {
    const stream = pipe();
    await expect(oraPromise(Promise.resolve(7), { stream, text: 'work' })).resolves.toBe(7);
    expect(stream.text()).toMatch(/[✔√] work\n$/);
  });

  it('lands on the failure symbol and rethrows', async () => {
    const stream = pipe();
    await expect(oraPromise(Promise.reject(new Error('no')), { stream, text: 'work' })).rejects.toThrow('no');
    expect(stream.text()).toMatch(/[✖×] work\n$/);
  });
});

/**
 * The cursor restore, which ora's suite cannot see. Every frame test upstream drives a
 * spinner in-process and lets it stop cleanly; none of them kills the process. So the 99
 * are silent about the guarantee a migrating program is most likely to notice losing:
 * Ctrl+C mid-spin, and a terminal left with no cursor.
 *
 * This runs the **built** entry (`dist/ora.js`, guaranteed by turbo's `test → build`),
 * because what is under test is what ships. fd 2 is handed to the child already pointing
 * at a file — writes to a file descriptor are synchronous in node, so nothing is lost when
 * the process is killed outright — and the child claims it is a terminal, which is the
 * only condition the cursor path checks.
 *
 * Proven to fail on the unfixed state (`process.once('exit', …)` and nothing else): show
 * was 0 for all three signals, because node does not run `'exit'` listeners for a process
 * terminated by a signal that has no listener.
 *
 * Skipped on Windows, where `process.kill(process.pid, …)` is an unconditional terminate
 * rather than a real signal delivery, so the assertion would be grading node's emulation
 * rather than this file. The listeners are still installed there, `SIGBREAK` included.
 */
const HIDE_CURSOR = '\u001B[?25l';
const SHOW_CURSOR = '\u001B[?25h';

const distOra = new URL('../dist/ora.js', import.meta.url).href;

interface SignalOutcome {
  hide: number;
  show: number;
  killedBy: string | null;
  status: number | null;
}

function spinThenSignal(signal: string, ownHandler = false): SignalOutcome {
  const dir = mkdtempSync(join(tmpdir(), 'flagstaff-ora-signal-'));
  const log = join(dir, 'fd2');
  const child = join(dir, 'child.mjs');
  writeFileSync(
    child,
    [
      'process.stderr.isTTY = true;',
      'process.stderr.columns = 80;',
      'process.stderr.cursorTo = () => true;',
      'process.stderr.clearLine = () => true;',
      'process.stderr.moveCursor = () => true;',
      // A program that took SIGINT over itself must survive: a spinner does not get to
      // terminate a process whose author asked to handle the signal.
      ownHandler ? "process.on('SIGINT', () => { setTimeout(() => process.exit(7), 300); });" : '',
      `const { default: ora } = await import(${JSON.stringify(distOra)});`,
      "ora({ isEnabled: true, hideCursor: true, discardStdin: false, text: 'probe' }).start();",
      `setTimeout(() => process.kill(process.pid, '${signal}'), 80);`,
      'setTimeout(() => process.exit(0), 5000);',
    ].join('\n'),
  );

  const fd = openSync(log, 'w');
  // `execFileSync` throws when the child does not exit 0 — which is every case here, since
  // the point is that the signal still terminates it. The throw carries `.status` and
  // `.signal`, and that is the whole result.
  let killedBy: string | null = null;
  let status: number | null = 0;
  try {
    execFileSync(process.execPath, [child], { stdio: ['ignore', 'pipe', fd], timeout: 20_000 });
  } catch (error) {
    const failure = error as { status?: number | null; signal?: string | null };
    killedBy = failure.signal ?? null;
    status = failure.status ?? null;
  } finally {
    closeSync(fd);
  }

  const written = readFileSync(log, 'utf8');
  const count = (needle: string): number => written.split(needle).length - 1;
  return { hide: count(HIDE_CURSOR), show: count(SHOW_CURSOR), killedBy, status };
}

describe.skipIf(process.platform === 'win32')('a cursor hidden mid-spin comes back when the process is signalled', () => {
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'])(
    '%s puts the cursor back, and still terminates',
    (signal) => {
      const observed = spinThenSignal(signal);
      expect(observed.hide).toBe(1);
      expect(observed.show).toBe(1);
      // The re-raise. Suppressing node's default action would be a worse bug than the one
      // this test was written for.
      expect(observed.killedBy).toBe(signal);
    },
    30_000,
  );

  it(
    'does not terminate a program that installed its own SIGINT handler',
    () => {
      const observed = spinThenSignal('SIGINT', true);
      expect(observed.show).toBe(1);
      expect(observed.killedBy).toBeNull();
      expect(observed.status).toBe(7);
    },
    30_000,
  );
});
