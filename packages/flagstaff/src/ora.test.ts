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
