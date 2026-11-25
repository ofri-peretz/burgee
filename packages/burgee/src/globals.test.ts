/**
 * The global options read off argv (`globals.ts`): each word's own reading, unit by unit. The
 * end-to-end behaviour (a run that times out, help's `Global options:` section) is held by
 * `timeout.test.ts` and `help.test.ts`; this file holds the parts those runs cannot tell apart.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { globalRows, globalsOf, leadingGlobals } from './globals.js';
import { type CommandNode } from './manifest.js';

const bare: CommandNode = { path: ['x'], options: {} };
/** A command with an option of its own whose short flag is `q`. */
const shortQ = { path: ['x'], options: { query: { type: 'string', short: 'q' } } } as unknown as CommandNode;
/** A command with an option of its own, `-v`, that is nothing to do with `-q`. */
const shortV = { path: ['x'], options: { verbose: { type: 'boolean', short: 'v' } } } as unknown as CommandNode;
/** A command that declares `quiet` itself. */
const ownQuiet = { path: ['x'], options: { quiet: { type: 'boolean' } } } as unknown as CommandNode;

describe('globalsOf', () => {
  it('reads --color=auto as detection: no instruction at all', () => {
    expect(globalsOf(['--color=auto'], bare).color).toEqual([]);
    expect(globalsOf([], bare).color).toEqual([]);
    expect(globalsOf(['--color', 'never'], bare).color).toEqual(['--color=never']);
  });

  it('refuses a colour or a duration it cannot read, naming the fix', () => {
    expect(() => globalsOf(['--color=sometimes'], bare)).toThrow(expect.objectContaining({ hint: 'pass --no-color to turn colour off' }));
    expect(() => globalsOf(['--timeout=soon'], bare)).toThrow(expect.objectContaining({ hint: 'a bare number is milliseconds; it must be above 0' }));
  });

  it('takes a switch alone: the word after --quiet is the command’s', () => {
    expect(globalsOf(['--quiet', 'ada'], bare)).toMatchObject({ quiet: true, args: ['ada'] });
    expect(globalsOf(['--no-color', 'ada'], bare)).toMatchObject({ color: ['--no-color'], args: ['ada'] });
  });

  it('leaves everything after -- to the handler, and nothing before it twice', () => {
    expect(globalsOf(['ada', '--quiet', '--', '--quiet'], bare)).toMatchObject({ quiet: true, args: ['ada', '--', '--quiet'] });
  });

  it('lets -q be the global unless the command owns quiet or the short flag q', () => {
    expect(globalsOf(['-q'], bare)).toMatchObject({ quiet: true, args: [] });
    expect(globalsOf(['-q'], shortV)).toMatchObject({ quiet: true, args: [] });
    expect(globalsOf(['-q'], shortQ)).toMatchObject({ quiet: false, args: ['-q'] });
    expect(globalsOf(['-q'], ownQuiet)).toMatchObject({ quiet: false, args: ['-q'] });
  });

  it('reads a word that is not a flag as the command’s, whatever it spells', () => {
    expect(globalsOf(['quiet', 'color=never', 'zzquiet'], bare)).toMatchObject({ quiet: false, color: [], args: ['quiet', 'color=never', 'zzquiet'] });
  });
});

describe('the deadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears its timer once the handler settles, either way', async () => {
    vi.useFakeTimers();
    const fine = globalsOf(['--timeout=5s'], bare);
    await expect(fine.within(Promise.resolve('done'))).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
    const failed = globalsOf(['--timeout=5s'], bare);
    await expect(failed.within(Promise.reject(new Error('no')))).rejects.toThrow('no');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('leadingGlobals', () => {
  it('moves the globals typed before the command, and a valued one’s value with it', () => {
    expect(leadingGlobals(['--quiet', '--timeout', '5s', 'greet', 'ada'])).toEqual({ globals: ['--quiet', '--timeout', '5s'], words: ['greet', 'ada'] });
  });
});

/** Help's `--quiet` row for `node`. */
const quietRow = (node: CommandNode): string | undefined => globalRows(node).find((row) => row.term.endsWith('--quiet'))?.term;

describe('globalRows', () => {
  it('names -q beside --quiet only where -q is the global', () => {
    expect(quietRow(bare)).toBe('-q, --quiet');
    expect(quietRow(shortQ)).toBe('--quiet');
  });
});
