/**
 * `burgee/meow` at the edges its own suite reaches only through a whole program (`meow.ts`):
 * the parser settings one by one, strict mode's reading of `--help`, `--version` and words after
 * `--`, which spellings `flags` drops, and the version a package supplies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import meow from './meow.js';
import { host } from './runtime.js';

/** What meow wrote to stdout and stderr, with `exit` turned into a throw so the call returns here. */
let out = '';
let err = '';
beforeEach(() => {
  out = '';
  err = '';
  vi.spyOn(host.stdout, 'write').mockImplementation((chunk) => ((out += String(chunk)), true));
  vi.spyOn(host.stderr, 'write').mockImplementation((chunk) => ((err += String(chunk)), true));
  vi.spyOn(host, 'exit').mockImplementation((code) => {
    throw new Error(`exit ${String(code)}`);
  });
  vi.spyOn(host, 'setTitle').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const pkg = { name: 'tool', version: '1.2.3' };
/** meow over `argv` with `settings`, and no package lookup. */
const run = (argv: string[], settings: Record<string, unknown> = {}): ReturnType<typeof meow> => meow({ pkg, argv, ...settings } as never);
const strict = { allowUnknownFlags: false };

describe('the settings', () => {
  it('merges a second settings object into the first', () => {
    expect(meow({ pkg, argv: [] } as never, { help: 'merged' } as never).help).toContain('merged');
  });

  it('refuses a command list with a bad command in it', () => {
    expect(() => run([], { commands: ['ok', '-x'] })).toThrow('do not start with `-`');
  });

  it('needs no importMeta when a package is given', () => {
    expect(() => run([])).not.toThrow();
  });
});

describe('the parser settings', () => {
  it('keeps the camel-cased spelling and drops the dashed one', () => {
    expect(run(['--foo-bar', 'x']).unnormalizedFlags).toEqual({ fooBar: 'x' });
  });

  it('takes one word per occurrence of a multiple flag', () => {
    const cli = run(['--tag', 'a', 'b'], { flags: { tag: { type: 'string', isMultiple: true } } });
    expect(cli.flags['tag']).toEqual(['a']);
    expect(cli.input).toEqual(['b']);
  });

  it('leaves everything after a command word to the child', () => {
    expect(run(['go', '--fast'], { commands: ['go'] }).input).toEqual(['--fast']);
  });

  it('reads numbers as typed unless inferType asks', () => {
    expect(run(['--n', '5', '7']).unnormalizedFlags).toEqual({ n: '5' });
    expect(run(['--n', '5', '7']).input).toEqual(['7']);
    expect(run(['--n', '5', '7'], { inferType: true }).unnormalizedFlags).toEqual({ n: 5 });
    expect(run(['--n', '5', '7'], { inferType: true }).input).toEqual([7]);
  });
});

describe('strict mode', () => {
  it('knows --help and --version by name beside other words, unless meow is not answering them', () => {
    expect(run(['--help', 'x'], strict).flags).toMatchObject({ help: true });
    expect(run(['--version', 'x'], strict).flags).toMatchObject({ version: true });
    expect(() => run(['--help', 'x'], { ...strict, autoHelp: false })).toThrow('exit 2');
    expect(() => run(['--version', 'x'], { ...strict, autoVersion: false })).toThrow('exit 2');
  });

  it('reports a flag-like command word as an unknown flag, unless it came after --', () => {
    expect(() => run(['-x'], { ...strict, commands: ['go'] })).toThrow('exit 2');
    expect(err).toBe('Unknown flag\n-x\n');
    err = '';
    expect(() => run(['--', '-x'], { ...strict, commands: ['go'] })).toThrow('exit 2');
    expect(err).toContain('Unknown command: -x\n');
    err = '';
    expect(() => run(['-x', '--', '-x'], { ...strict, commands: ['go'] })).toThrow('exit 2');
    expect(err).toMatch(/^Unknown flags?\n-x\n/u);
  });

  it('checks only the flags before the first word that is not one, numbers included', () => {
    expect(() => run(['-x', '5', '-y'], { ...strict, commands: ['go'], inferType: true })).toThrow('exit 2');
    expect(err).toBe('Unknown flag\n-x\n');
  });

  it('names the unknown command and the known ones', () => {
    expect(() => run(['nope'], { commands: ['go', 'stop'] })).toThrow('exit 2');
    expect(err).toMatch(/^Unknown command: nope\nAvailable commands: go, stop\n/u);
  });

  it('reads words after -- as input, and leaves them to a declared -- flag', () => {
    expect(run(['a', '--', '-x'], strict).input).toEqual(['a', '-x']);
    expect(run(['a', '--', '-x'], { ...strict, flags: { '--': {} } }).flags['--']).toEqual(['-x']);
    expect(() => run(['-x', '--', 'a'], strict)).toThrow('exit 2');
    expect(() => run(['a', '-x'], strict)).toThrow('exit 2');
  });
});

describe('--help and --version', () => {
  it('answer only as the whole command line, and only while meow answers them', () => {
    expect(() => run(['--version'])).toThrow('exit 0');
    expect(out).toBe('1.2.3\n');
    expect(() => run(['--help'])).toThrow('exit 0');
    expect(run(['--version', '--help']).flags).toMatchObject({ version: true, help: true });
    expect(run(['--foo']).flags).toEqual({ foo: true });
    expect(run(['--version'], { autoVersion: false }).flags).toEqual({ version: true });
    expect(run(['--help'], { autoHelp: false }).flags).toEqual({ help: true });
  });

  it('take the version from the package only when it is a string with something in it', () => {
    expect((meow({ pkg: { version: '' }, argv: [] } as never) as unknown as { version: string }).version).toBe('No version found');
    expect((meow({ pkg: { version: 1 }, argv: [] } as never) as unknown as { version: string }).version).toBe('No version found');
  });
});

describe('the result', () => {
  it('drops a short flag’s spelling from flags and keeps it in unnormalizedFlags', () => {
    const cli = run(['-n', 'ada'], { flags: { name: { type: 'string', shortFlag: 'n' } } });
    expect(cli.flags).toEqual({ name: 'ada' });
    expect(cli.unnormalizedFlags).toMatchObject({ n: 'ada', name: 'ada' });
  });

  it('carries a command only when one was named', () => {
    expect(run([])).not.toHaveProperty('command');
  });

  it('refuses a flag set twice', () => {
    expect(() => run(['--name', 'a', '--name', 'b'], { flags: { name: { type: 'string' } } })).toThrow('The flag --name can only be set once.');
  });

  it('titles the process after the package', () => {
    run([]);
    expect(host.setTitle).toHaveBeenCalledWith('tool');
  });
});
