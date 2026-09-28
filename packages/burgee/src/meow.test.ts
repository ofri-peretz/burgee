/**
 * `burgee/meow` — the behaviours meow's own suite grades, restated here so a change to the
 * façade fails in this package before it fails in the oracle.
 *
 * Each block is one of the fourteen cases the drop-in failed at 132 / 148 (2026-09-21) and
 * passes at 146 / 148, plus two neighbours the same reading of meow's source turned up. Every
 * expectation is what meow 14.1.0 does, read from its `build/` and checked against its suite;
 * none is a burgee opinion. In-process with `argv`, `process.exit` stubbed to throw so a run
 * that would end stops where meow's would.
 */
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import meow, { type AnyFlags, type Flag, type Result, type TypedFlags } from './meow.js';
import { cutTrailingTabs, trimNewlines } from './meow/present.js';

const importMeta = import.meta;
const pkg = { name: 'demo', version: '1.2.3' };
/** meow's own fixture help: a template literal whose last line is `  \t`. */
const HELP = `
		Usage
		  foo <input>
  	`;

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
afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs `meow`, returning how the run ended: the result, or the exit it asked for. */
function run(options: Parameters<typeof meow>[0]): { exit?: number | undefined; cli?: ReturnType<typeof meow> } {
  try {
    return { cli: meow(options) };
  } catch (error) {
    if (error instanceof Exit) return { exit: error.code };
    throw error;
  }
}

describe('the help block is built the way meow builds it', () => {
  it('keeps the whitespace-only last line of a template-literal help, so the screen ends on a blank line', () => {
    const { cli } = run({ importMeta, pkg, argv: [], description: 'Custom description', help: HELP });
    expect(cli?.help).toBe('\n  Custom description\n\n  Usage\n    foo <input>\n\n');
  });

  it('prints that block, and exits 0, for a lone --help', () => {
    expect(run({ importMeta, pkg, argv: ['--help'], description: 'Custom description', help: HELP }).exit).toBe(0);
    expect(out).toBe('\n  Custom description\n\n  Usage\n    foo <input>\n\n\n');
  });

  it('leaves a one-line help flush, and a lone description unindented', () => {
    expect(run({ importMeta, pkg, argv: [], description: false, help: 'single line' }).cli?.help).toBe('\nsingle line\n');
    expect(run({ importMeta, pkg, argv: [], description: 'only this' }).cli?.help).toBe('\nonly this\n');
  });
});

describe('--help and --version answer only a command line of one argument', () => {
  const declared = { help: { type: 'boolean' as const, shortFlag: 'h' }, version: { type: 'boolean' as const, shortFlag: 'v' } };

  it('answers -h even when the caller declared `help` with that short flag', () => {
    expect(run({ importMeta, pkg, argv: ['-h'], help: HELP, allowUnknownFlags: false, flags: declared }).exit).toBe(0);
    expect(out).toContain('Usage');
  });

  it('answers -v even when the caller declared `version` with that short flag', () => {
    expect(run({ importMeta, pkg, argv: ['-v'], allowUnknownFlags: false, flags: declared }).exit).toBe(0);
    expect(out).toBe('1.2.3\n');
  });

  it('answers neither for `--version --help`: both arrive as flags', () => {
    const { cli, exit } = run({ importMeta, pkg, argv: ['--version', '--help'], help: HELP });
    expect(exit).toBeUndefined();
    expect(cli?.flags).toMatchObject({ version: true, help: true });
  });
});

describe('allowUnknownFlags: false checks tokens, not parsed keys', () => {
  const flags = { foo: { type: 'string' as const }, noAutoHelp: { type: 'boolean' as const }, noAutoVersion: { type: 'boolean' as const } };

  it('does not report `--no-auto-help` against a declared `noAutoHelp`, though the parser also sets `auto-help`', () => {
    expect(run({ importMeta, pkg, argv: ['--help', '--no-auto-help'], autoHelp: false, allowUnknownFlags: false, flags }).exit).toBe(2);
    expect(err).toBe('Unknown flag\n--help\n');
  });

  it('does the same for `--no-auto-version`', () => {
    expect(run({ importMeta, pkg, argv: ['--version', '--no-auto-version'], autoVersion: false, allowUnknownFlags: false, flags }).exit).toBe(2);
    expect(err).toBe('Unknown flag\n--version\n');
  });

  it('reports every unknown token as typed, and leaves negative numbers and what follows `--` alone', () => {
    expect(run({ importMeta, pkg, argv: ['--foo', 'bar', '--un-a', '--un-b', 'x'], allowUnknownFlags: false, flags }).exit).toBe(2);
    expect(err).toBe('Unknown flags\n--un-a\n--un-b\n');
    expect(run({ importMeta, pkg, argv: ['-1'], allowUnknownFlags: false, flags }).exit).toBeUndefined();
    expect(run({ importMeta, pkg, argv: ['--', '--un-a'], allowUnknownFlags: false, flags }).exit).toBeUndefined();
  });

  it('with commands, reports the parent’s unknown flag and not the child’s', () => {
    const options = { importMeta, pkg, allowUnknownFlags: false, flags: { parentFlag: { type: 'boolean' as const } }, commands: ['run', 'list'] };
    expect(run({ ...options, argv: ['--unknown', 'run', '--child', 'value'] }).exit).toBe(2);
    expect(err).toBe('Unknown flag\n--unknown\n');
    const { cli } = run({ ...options, argv: ['--parent-flag', 'run', '--child', 'value'] });
    expect(cli).toMatchObject({ command: 'run', input: ['--child', 'value'], flags: { parentFlag: true } });
  });
});

describe('declarations meow refuses before it parses', () => {
  it('refuses `flags: null` rather than reading it as no flags', () => {
    expect(() => meow({ importMeta, pkg, argv: [], flags: null as never })).toThrow('The `flags` option must be an object.');
  });

  it('refuses choices of another type than their flag', () => {
    // Typed `never` because meow's own types refuse this declaration too; the check is for the
    // JavaScript caller the compiler cannot see.
    const flags = { number: { type: 'number', choices: [1, '2'] }, boolean: { type: 'boolean', choices: [true, 'false'] } } as never;
    expect(() => meow({ importMeta, pkg, argv: [], flags })).toThrow(
      "Each value of the option `choices` must be of the same type as its flag. Invalid flags: (`--number`, type: 'number'), (`--boolean`, type: 'boolean')",
    );
  });

  it('refuses `booleanDefault: null` for a boolean flag with no default of its own', () => {
    expect(() => meow({ importMeta, pkg, argv: ['--foo'], booleanDefault: null as never, flags: { foo: { type: 'boolean' } } })).toThrow(
      new TypeError('Expected "foo" default value to be of type "boolean", got "null"'),
    );
  });
});

describe('flags as meow hands them back', () => {
  it('keeps a single-character flag’s case: -F is F', () => {
    expect(run({ importMeta, pkg, argv: ['-F'] }).cli?.flags).toMatchObject({ F: true });
  });

  it('counts an empty string as a value for a required flag', () => {
    const flags = { test: { type: 'string' as const, shortFlag: 't', isRequired: true }, number: { type: 'number' as const, isRequired: true } };
    expect(run({ importMeta, pkg, argv: ['--test', ''], flags }).exit).toBe(2);
    expect(err).toBe('Missing required flag\n\t--number\n');
  });

  it('names a repeated flag the way it was declared', () => {
    expect(() => meow({ importMeta, pkg, argv: ['--foo-bar', 'a', '--foo-bar', 'b'], flags: { fooBar: { type: 'string' } } })).toThrow('The flag --fooBar can only be set once.');
  });

  it('hands `input.isRequired` the input alone', () => {
    const seen: unknown[] = [];
    run({ importMeta, pkg, argv: ['x'], input: { isRequired: (...args: unknown[]) => (seen.push(...args), true) } });
    expect(seen).toEqual([['x']]);
  });
});

describe('pkg is normalized lazily, in place', () => {
  it('leaves the caller’s object alone until `cli.pkg` is read, then normalizes that same object', () => {
    const own: Record<string, unknown> = { name: 'browser-sync', bin: './bin/browser-sync.js' };
    const { cli } = run({ importMeta, pkg: own, argv: [] });
    expect(own['bin']).toBe('./bin/browser-sync.js');
    expect(Object.keys(own)).not.toContain('version');
    expect((cli?.pkg['bin'] as Record<string, string>)['browser-sync']).toBe('./bin/browser-sync.js');
    expect(cli?.pkg).toBe(own);
    expect(own['version']).toBe('');
  });
});

describe('meow’s own types, so a type-only import migrates', () => {
  it('types a declared flag as meow does: required or defaulted is never undefined', () => {
    const { cli } = run({
      importMeta,
      pkg,
      argv: ['-r', '--name', 'x'],
      flags: { rainbow: { type: 'boolean', shortFlag: 'r' }, name: { type: 'string', isRequired: true }, sizes: { type: 'number', isMultiple: true, default: [1] } },
    });
    expect(cli?.flags).toMatchObject({ rainbow: true, name: 'x', sizes: [1] });
    const typed = meow({ importMeta, pkg, argv: ['--name', 'x'], flags: { rainbow: { type: 'boolean' }, name: { type: 'string', isRequired: true }, sizes: { type: 'number', isMultiple: true, default: [1] } } });
    expectTypeOf(typed.flags.rainbow).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(typed.flags.name).toEqualTypeOf<string>();
    expectTypeOf(typed.flags.sizes).toEqualTypeOf<number[]>();
    expectTypeOf(typed).toMatchTypeOf<Result<{ rainbow: Flag<'boolean', boolean> }>>();
    expectTypeOf<TypedFlags<{ n: { type: 'number' }; m: { type: 'string'; default: 'a' } }>>().toEqualTypeOf<{ n: number | undefined; m: string }>();
    expectTypeOf<AnyFlags>().toEqualTypeOf<Record<string, import('./meow.js').AnyFlag>>();
  });
});

/** Every string over `alphabet` up to `max` characters long. */
function strings(alphabet: string, max: number): string[] {
  const out = [''];
  for (let n = 1; n <= max; n += 1) {
    const prev = out.filter((x) => x.length === n - 1);
    for (const p of prev) for (const c of alphabet) out.push(p + c);
  }
  return out;
}

describe('help trimming answers as meow\'s regexes did, in linear time (CodeQL #99, #100)', () => {
  it('matches the upstream regexes on every short string of tabs, newlines, spaces and text', () => {
    for (const s of strings('\t\n\r a', 6)) {
      expect(trimNewlines(s), JSON.stringify(s)).toBe(s.replace(/^[\r\n]+|[\r\n]+$/gu, ''));
      expect(cutTrailingTabs(s), JSON.stringify(s)).toBe(s.replace(/\t+\n*$/u, ''));
    }
  });

  it('trims 200,000 newlines and tabs that never reach the end well under the quadratic cost', () => {
    const newlines = `a${'\n'.repeat(200_000)}b`;
    const tabs = `a${'\t'.repeat(200_000)}b`;
    const started = performance.now();
    expect(trimNewlines(newlines)).toBe(newlines);
    expect(cutTrailingTabs(tabs)).toBe(tabs);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
