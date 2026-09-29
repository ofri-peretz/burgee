/**
 * `burgee/meow` on the paths meow.test.ts does not take: the help-text-first call, argv from
 * the process, a type read off a default, `input.type`, the `--` collector, `aliases`, unknown
 * commands, and the package it reads and names the process after. Every expectation is meow
 * 14.1.0's behaviour, in-process, with `process.exit` stubbed to throw where meow's run ends.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import meow from './meow.js';
import { buildHelp, normalizePackage, readPackageUp, setProcessTitle } from './meow/present.js';

const importMeta = import.meta;
const pkg = { name: 'demo', version: '1.2.3' };

class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${String(code)}`);
  }
}

let out: string;
let err: string;
beforeEach(() => {
  out = '';
  err = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => ((out += String(s)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => ((err += String(s)), true));
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new Exit(code === null ? undefined : Number(code));
  });
});
afterEach(() => vi.restoreAllMocks());

/** Runs `meow`, returning how the run ended: the result, or the exit it asked for. */
function run(options: Record<string, unknown>): { exit?: number | undefined; cli?: ReturnType<typeof meow> } {
  try {
    return { cli: meow(options as never) };
  } catch (error) {
    if (error instanceof Exit) return { exit: error.code };
    throw error;
  }
}

/** What `cli.showVersion()` prints before it exits 0. */
function printedVersion(cli: ReturnType<typeof meow> | undefined): string {
  out = '';
  try {
    cli?.showVersion();
  } catch (error) {
    if (!(error instanceof Exit) || error.code !== 0) throw error;
  }
  return out;
}

describe('how meow is called', () => {
  it('takes the help text first, and the options second', () => {
    const cli = meow('  Usage: demo <file>', { importMeta, pkg, argv: [] });
    expect(cli.help).toBe('\n  Usage: demo <file>\n');
  });
  it('merges a second options object into the first', () => {
    const cli = (meow as unknown as (a: object, b: object) => ReturnType<typeof meow>)({ importMeta, argv: ['x'] }, { pkg: { name: 'merged', version: '9.0.0' } });
    expect(printedVersion(cli)).toBe('9.0.0\n');
  });
  it('reads argv from the process when none is given', () => {
    const argv = process.argv;
    try {
      process.argv = ['node', 'cli.js', 'from-process'];
      expect(meow({ importMeta, pkg }).input).toEqual(['from-process']);
    } finally {
      process.argv = argv;
    }
  });
  it('refuses an input.isRequired that is neither a boolean nor a function', () => {
    expect(() => run({ importMeta, pkg, argv: [], input: { isRequired: 'yes' } })).toThrow(new TypeError('The `input.isRequired` option must be a boolean or a function.'));
  });
  it('prints the declared version, as a string', () => {
    // `showVersion` prints `version` and exits 0; String(7), not the number, is what it prints.
    const { cli } = run({ importMeta, pkg, argv: [], version: 7 });
    expect(printedVersion(cli)).toBe('7\n');
    expect((cli as unknown as { version: unknown }).version).toBe('7');
  });
});

describe('flags', () => {
  it('types a flag with no type by its default, and leaves one with neither untyped', () => {
    const flags = { count: { default: 1 }, loud: { default: false }, label: { default: 'x' }, free: {} };
    const { cli } = run({ importMeta, pkg, argv: ['--count', '3', '--loud', 'word', '--label', '007', '--free', 'value'], flags });
    // A boolean takes no value, so `word` is input; the untyped flag takes the word after it.
    expect(cli?.flags).toMatchObject({ count: 3, loud: true, label: '007', free: 'value' });
    expect(cli?.input).toEqual(['word']);
    // Typed by its string default, a bare --label is still a string; untyped, it would be a switch.
    expect(typeof run({ importMeta, pkg, argv: ['--label'], flags }).cli?.flags['label']).toBe('string');
    // Where it shows: under inferType an untyped `7` is a number, a string flag keeps it a string.
    expect(run({ importMeta, pkg, argv: ['--label', '7', '--free', '7'], flags, inferType: true }).cli?.flags).toMatchObject({ label: '7', free: 7 });
  });
  it('types a list default by its first element, and an object default not at all', () => {
    const flags = { sizes: { default: [1] }, names: { default: ['a'] }, extra: { default: { k: 1 } } };
    const { cli } = run({ importMeta, pkg, argv: ['--sizes', '5', '--names', '5', '--extra', 'value'], flags });
    expect(cli?.flags).toMatchObject({ sizes: 5, names: '5', extra: 'value' });
  });
  it('collects everything after -- when -- is declared, and an empty list when nothing follows', () => {
    // `--` is not a flag of its own: no default, no type, only the collector.
    const flags = { '--': { type: 'string', isMultiple: true } };
    expect(run({ importMeta, pkg, argv: ['a', '--', 'b', 'c'], flags }).cli?.flags).toEqual({ '--': ['b', 'c'] });
    expect(run({ importMeta, pkg, argv: ['a'], flags }).cli?.flags).toEqual({ '--': [] });
  });
  it('drops each of `aliases` from flags, and keeps it in unnormalizedFlags', () => {
    const { cli } = run({ importMeta, pkg, argv: ['--foo=baz'], flags: { fooBar: { type: 'string', aliases: ['foo'] } } });
    expect(cli?.flags).toEqual({ fooBar: 'baz' });
    expect(cli?.unnormalizedFlags).toMatchObject({ fooBar: 'baz', foo: 'baz' });
  });
});

describe('input', () => {
  it('coerces by input.type, a string one or the object form', () => {
    expect(run({ importMeta, pkg, argv: ['7'], input: 'number' }).cli?.input).toEqual([7]);
    expect(run({ importMeta, pkg, argv: ['7'], input: { type: 'string' }, inferType: true }).cli?.input).toEqual(['7']);
  });
  it('keeps the parser’s own type under inferType, and a string otherwise', () => {
    expect(run({ importMeta, pkg, argv: ['7'], inferType: true }).cli?.input).toEqual([7]);
    expect(run({ importMeta, pkg, argv: ['7'] }).cli?.input).toEqual(['7']);
  });
});

describe('commands', () => {
  const commands = ['run', 'list'];
  it('has no command and no input when nothing was typed', () => {
    const { cli } = run({ importMeta, pkg, argv: [], commands });
    expect(cli?.input).toEqual([]);
    expect(cli?.command).toBeUndefined();
  });
  it('refuses an unknown command on stderr with the list and the help, exit 2', () => {
    expect(run({ importMeta, pkg, argv: ['deploy'], commands, help: 'Usage: demo' }).exit).toBe(2);
    expect(err).toBe('Unknown command: deploy\nAvailable commands: run, list\n\nUsage: demo\n\n');
  });
  it('under strict flags, reports the parent flags before an unknown command word', () => {
    expect(run({ importMeta, pkg, argv: ['--nope', '--also'], commands, allowUnknownFlags: false }).exit).toBe(2);
    expect(err).toBe('Unknown flags\n--nope\n--also\n');
  });
  it('under strict flags, treats a dash word after -- as a command word, not a flag', () => {
    expect(run({ importMeta, pkg, argv: ['--', '-x'], commands, allowUnknownFlags: false }).exit).toBe(2);
    expect(err).toMatch(/^Unknown command: -x\n/);
  });
  it('under strict flags, an unknown plain word is only an unknown command', () => {
    expect(run({ importMeta, pkg, argv: ['deploy'], commands, allowUnknownFlags: false }).exit).toBe(2);
    expect(err).toMatch(/^Unknown command: deploy\n/);
  });
});

describe('the package meow reads and names the process after', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('steps over a package.json that does not parse to the next one up, and reads none without importMeta', () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-meow-pkg-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'outer-pkg' }));
    mkdirSync(join(dir, 'inner'));
    writeFileSync(join(dir, 'inner', 'package.json'), '{ broken');
    expect(readPackageUp({ url: pathToFileURL(join(dir, 'inner', 'cli.js')).href } as ImportMeta)).toEqual({ name: 'outer-pkg' });
    expect(readPackageUp(undefined)).toEqual({});
    // Only the broken one: nothing above a temp directory is a package, so nothing is read.
    expect(readPackageUp({ url: pathToFileURL(join(dir, 'inner', 'cli.js')).href } as ImportMeta)).toEqual({ name: 'outer-pkg' });
    rmSync(join(dir, 'package.json'));
    expect(readPackageUp({ url: pathToFileURL(join(dir, 'inner', 'cli.js')).href } as ImportMeta)).toEqual({});
  });

  it('normalizes a string bin only when there is a name, and leaves a version it has', () => {
    expect(normalizePackage({ bin: 'cli.js', version: '1.0.0' })).toEqual({ bin: 'cli.js', version: '1.0.0' });
    expect(normalizePackage({ name: '@scope/tool', bin: 'cli.js' })).toEqual({ name: '@scope/tool', bin: { tool: 'cli.js' }, version: '' });
  });

  it('titles the process by the first bin, by the name when bin is empty, and not at all with no name', () => {
    const titles: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(process, 'title') as PropertyDescriptor;
    Object.defineProperty(process, 'title', { configurable: true, get: () => titles.at(-1) ?? '', set: (t: string) => void titles.push(t) });
    try {
      setProcessTitle({ name: 'pkg-name', bin: { first: 'a.js', second: 'b.js' } });
      setProcessTitle({ name: 'pkg-name', bin: {} });
      setProcessTitle({ bin: 'cli.js' });
      setProcessTitle({ name: 42 });
    } finally {
      Object.defineProperty(process, 'title', descriptor);
    }
    expect(titles).toEqual(['first', 'pkg-name']);
  });

  it('leaves a multi-line help with no content on any line as it is', () => {
    expect(buildHelp({ help: ' \n ' }, {})).toBe('\n \n \n');
  });
});
