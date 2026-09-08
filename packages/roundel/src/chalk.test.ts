/**
 * R6 — the chalk façade, from this side of the seam. chalk's own suite (vendored into
 * compat-oracle) grades the API; this file locks what the suite cannot see: the level is
 * detected once at import through the policy, the escapes come from tokens and nowhere
 * else, and the mutable level is honoured inside the façade only.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import chalk, {
  backgroundColorNames,
  Chalk,
  chalkStderr,
  colorNames,
  foregroundColorNames,
  modifierNames,
  supportsColor,
  supportsColorStderr,
  underlineColorNames,
} from './chalk.js';
import { colorLevel, flown, type ColorLevel } from './policy.js';
import { error } from './tokens.js';

/** Escape sequences spelled out, so a reader can check them against ECMA-48 by eye. */
const E = '\u001B[';

// The policy's answer for this very process — env, argv and the stream.
const policy = (stream: 'stdout' | 'stderr'): ColorLevel =>
  colorLevel({ env: process.env, argv: process.argv, isTTY: { stdout: process[stream].isTTY === true } });

// Since R2's 2026-09-08 revision the level obeys an explicit instruction in any mode, so a
// developer running `FORCE_COLOR=1 npm test` would legitimately see a level above 0. The
// concrete assertion below names the ordinary case and steps aside for the instructed one.
const INSTRUCTED =
  process.env['FORCE_COLOR'] !== undefined ||
  process.env['NO_COLOR'] !== undefined ||
  ('TF_BUILD' in process.env && 'AGENT_NAME' in process.env);

describe('the level is decided once, at import, through the policy', () => {
  it.skipIf(INSTRUCTED)('is 0 through this suite’s own pipe, because nothing asked for colour (R2)', () => {
    expect(chalk.level).toBe(0);
    expect(chalkStderr.level).toBe(0);
    expect(supportsColor).toBe(false);
    expect(supportsColorStderr).toBe(false);
  });

  it('is the policy’s answer for this process, read per stream — argv, env and that stream’s TTY', () => {
    expect(chalk.level).toBe(policy('stdout'));
    expect(chalkStderr.level).toBe(policy('stderr'));
    expect(supportsColor).toEqual(chalk.level === 0 ? false : expect.objectContaining({ level: chalk.level }));
    expect(supportsColorStderr).toEqual(chalkStderr.level === 0 ? false : expect.objectContaining({ level: chalkStderr.level }));
  });

  it('at level 0 every chain is the identity and `visible` is empty', () => {
    // A fresh instance, not `chalk.level = 0`: the module singleton is shared with every
    // other test in this file, and R6 keeps a mutated level inside its own façade.
    const c = new Chalk({ level: 0 });
    expect(c.red.bold.underline('x')).toBe('x');
    expect(c.hex('#ff0000')('x')).toBe('x');
    expect(c.visible('x')).toBe('');
    expect(c('a', 'b')).toBe('a b');
  });
});

describe('chaining, at level 3', () => {
  const c = new Chalk({ level: 3 });

  it('opens in order and closes in reverse', () => {
    expect(c.red.bgGreen.underline('foo')).toBe(`${E}31m${E}42m${E}4mfoo${E}24m${E}49m${E}39m`);
  });

  it('re-opens an outer colour after a nested close', () => {
    expect(c.red(`a${c.yellow('b')}c`)).toBe(`${E}31ma${E}33mb${E}39m${E}31mc${E}39m`);
  });

  it('closes before a line break and re-opens after it', () => {
    expect(c.grey('hello\r\nworld')).toBe(`${E}90mhello${E}39m\r\n${E}90mworld${E}39m`);
  });

  it('finds the same link twice, so a destructured style is a stable function', () => {
    const { red } = c;
    expect(c.red).toBe(red);
    expect(c.rgb).toBe(c.rgb);
    expect(red.bold('x')).toBe(`${E}31m${E}1mx${E}22m${E}39m`);
  });

  it('keeps Function.prototype: bind, call and apply are the real ones', () => {
    expect(c.red.bind(null)('x')).toBe(`${E}31mx${E}39m`);
    expect(Reflect.apply(c.red, null, [])).toBe('');
  });
});

describe('colour models and their fallbacks', () => {
  it('hex and rgb are truecolor at level 3', () => {
    const c = new Chalk({ level: 3 });
    expect(c.hex('#ff6159')('x')).toBe(`${E}38;2;255;97;89mx${E}39m`);
    expect(c.bgRgb(255, 97, 89)('x')).toBe(`${E}48;2;255;97;89mx${E}49m`);
    expect(c.ansi256(196)('x')).toBe(`${E}38;5;196mx${E}39m`);
  });

  it('fall to the nearest of 256 at level 2', () => {
    const c = new Chalk({ level: 2 });
    expect(c.hex('#ff6159')('x')).toBe(`${E}38;5;210mx${E}39m`);
    expect(c.rgb(255, 0, 0)('x')).toBe(`${E}38;5;196mx${E}39m`);
    expect(c.underlineHex('#ff0000')('x')).toBe(`${E}58;5;196mx${E}59m`);
  });

  it('fall to the nearest of 16 at level 1, as chalk rounds', () => {
    const c = new Chalk({ level: 1 });
    expect(c.hex('#f00')('x')).toBe(`${E}91mx${E}39m`);
    expect(c.bgAnsi256(196)('x')).toBe(`${E}101mx${E}49m`);
    expect(c.ansi256(232)('x')).toBe(`${E}30mx${E}39m`);
    expect(c.underlineRgb(255, 0, 0)('x')).toBe(`${E}58;5;9mx${E}59m`);
  });
});

describe('instances and the mutable level', () => {
  it('`new Chalk({ level })` is its own instance; a chain reads and writes the instance it came from', () => {
    const a = new Chalk({ level: 1 });
    const b = new Chalk({ level: 0 });
    const chain = a.red.bold;
    expect(a.red('x')).toBe(`${E}31mx${E}39m`);
    expect(b.red('x')).toBe('x');
    chain.level = 0;
    expect(a.level).toBe(0);
    expect(chain('x')).toBe('x');
  });

  // Same guard as above: the assertion that the rejected assignment left the singleton
  // alone names the ordinary level, 0, and a run instructed to colour has a different one.
  it.skipIf(INSTRUCTED)('rejects a level outside 0–3, in the option and on assignment', () => {
    expect(() => new Chalk({ level: 4 as never })).toThrow(/integer from 0 to 3/);
    expect(() => {
      chalk.level = 1.5 as never;
    }).toThrow(/integer from 0 to 3/);
    expect(chalk.level).toBe(0);
  });

  it('detects when the level is omitted or undefined', () => {
    expect(new Chalk().level).toBe(new Chalk({ level: undefined }).level);
  });

  it('is honoured inside the façade only: the tokens keep reading the policy (R6)', () => {
    chalk.level = 3;
    try {
      expect(chalk.red('x')).toBe(`${E}31mx${E}39m`);
      expect(flown.level).toBe(0);
      expect(error('x')).toBe('x');
    } finally {
      chalk.level = 0;
    }
  });

  it('`chalkStderr` is a second instance with its own level', () => {
    chalkStderr.level = 2;
    try {
      expect(chalkStderr.red('x')).toBe(`${E}31mx${E}39m`);
      expect(chalk.red('x')).toBe('x');
    } finally {
      chalkStderr.level = 0;
    }
  });
});

describe('the names chalk exports', () => {
  it('are chalk 6 tables: 13 modifiers, 18 colours per family, underline colours apart', () => {
    expect(modifierNames).toHaveLength(13);
    expect(foregroundColorNames).toHaveLength(18);
    expect(backgroundColorNames).toHaveLength(18);
    expect(underlineColorNames).toHaveLength(18);
    expect(colorNames).toEqual([...foregroundColorNames, ...backgroundColorNames]);
    expect(colorNames).not.toContain('underlineRed');
    expect(foregroundColorNames.slice(0, 11)).toEqual(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'blackBright', 'gray', 'grey']);
  });
});

describe('R3 — only tokens emits an escape', () => {
  it('the façade source carries no ESC: it computes parameters and hands them to `sgr()`', () => {
    const source = readFileSync(fileURLToPath(new URL('chalk.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/\\u001[bB]|\\x1[bB]|\\e\[|\u001B/);
  });
});
