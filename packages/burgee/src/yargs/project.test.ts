/**
 * The pure half of burgee on yargs syntax: a snapshot in, the manifest's options and nodes
 * out. burgee.test.ts reaches it through whole programs, which is the contract; these are the
 * fields a program registers less often — through an alias, deferred for y18n, hidden,
 * deprecated, demanded, defaulted to a list — each asserted on the spec it produces.
 */
import { describe, expect, it } from 'vitest';

import { Manifest } from '../manifest.js';

import yargs from '../yargs.js';

import { optionSpecs, projectManifest, render, type Snapshot } from './burgee.js';

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  name: 'y',
  hasHandler: false,
  keys: [],
  aliases: {},
  boolean: [],
  number: [],
  string: [],
  count: [],
  array: [],
  hiddenOptions: [],
  demanded: {},
  deprecated: {},
  choices: {},
  conflicts: {},
  implies: {},
  examples: [],
  defaults: {},
  descriptions: {},
  skip: [],
  positionals: { demanded: [], optional: [] },
  commands: [],
  ...over,
});

describe('optionSpecs', () => {
  it('types an option by what its alias was declared as', () => {
    const specs = optionSpecs(snapshot({ keys: ['verbose', 'n'], aliases: { verbose: ['V'], n: ['num'] }, boolean: ['V'], number: ['num'] }));
    expect(specs['verbose']).toMatchObject({ type: 'boolean' });
    expect(specs['n']).toMatchObject({ type: 'number' });
  });

  it('reads a description deferred for y18n without its marker, and one given on an alias', () => {
    const specs = optionSpecs(
      snapshot({ keys: ['a', 'b'], aliases: { b: ['bee'] }, descriptions: { a: '__yargsString__:the a option', bee: 'described on the alias' } }),
    );
    expect(specs['a']?.description).toBe('the a option');
    expect(specs['b']?.description).toBe('described on the alias');
  });

  it('marks an option demanded by its own name or an alias as required', () => {
    const specs = optionSpecs(snapshot({ keys: ['a', 'b', 'c'], aliases: { b: ['bb'] }, demanded: { a: undefined, bb: 'need it' } }));
    expect([specs['a']?.required, specs['b']?.required, specs['c']?.required]).toEqual([true, true, undefined]);
  });

  it('keeps a default that is a list of strings, and drops one that is a list of anything else', () => {
    const specs = optionSpecs(snapshot({ keys: ['tags', 'nums', 'obj'], defaults: { tags: ['a', 'b'], nums: ['a', 1], obj: { x: 1 } } }));
    expect(specs['tags']?.default).toEqual(['a', 'b']);
    expect(specs['nums']).not.toHaveProperty('default');
    expect(specs['obj']).not.toHaveProperty('default');
  });

  it('carries hidden and a deprecation, and not a deprecation of false', () => {
    const specs = optionSpecs(snapshot({ keys: ['h', 'old', 'kept'], hiddenOptions: ['h'], deprecated: { old: 'use --new', kept: false } }));
    expect(specs['h']?.hidden).toBe(true);
    expect(specs['old']?.deprecated).toBe('use --new');
    expect(specs['kept']).not.toHaveProperty('deprecated');
    expect(specs['old']).not.toHaveProperty('hidden');
  });

  it('reads an alias map for a key it does not register as not making anything an alias', () => {
    const specs = optionSpecs(snapshot({ keys: ['x'], aliases: { gone: ['x'] } }));
    expect(Object.keys(specs)).toEqual(['x']);
  });
});

describe('optionSpecs, field by field', () => {
  it('projects exactly the fields an option registered, and no others', () => {
    const specs = optionSpecs(snapshot({ keys: ['plain', 'blank'], descriptions: { blank: '' } }));
    expect(specs['plain']).toStrictEqual({ type: 'string' });
    expect(specs['blank']).toStrictEqual({ type: 'string' });
  });

  it('takes the short flag from the one-letter alias that is not a digit', () => {
    const specs = optionSpecs(snapshot({ keys: ['force', 'level', 'n'], aliases: { force: ['long', '1', 'f'], level: ['9'], n: ['ten'] } }));
    expect(specs['force']?.short).toBe('f');
    expect(specs['level']).not.toHaveProperty('short');
    expect(specs['n']).not.toHaveProperty('short');
  });

  it('reads a description, a list and choices off whichever alias carries them', () => {
    const specs = optionSpecs(
      snapshot({ keys: ['tag'], aliases: { tag: ['t1', 't2'] }, descriptions: { t2: 'on the second alias' }, array: ['t2'], choices: { t2: ['a', 1] } }),
    );
    expect(specs['tag']).toStrictEqual({ type: 'string', description: 'on the second alias', multiple: true, choices: ['a', '1'] });
  });

  it('keeps a string, a boolean or a number default', () => {
    const specs = optionSpecs(snapshot({ keys: ['s', 'b', 'n'], defaults: { s: 'x', b: false, n: 3 } }));
    expect([specs['s']?.default, specs['b']?.default, specs['n']?.default]).toEqual(['x', false, 3]);
  });

  it('leaves out a positional, by any of its names, from the options', () => {
    const specs = optionSpecs(
      snapshot({ keys: ['file', 'rest', 'out'], positionals: { demanded: [{ cmd: ['file'], variadic: false }], optional: [{ cmd: ['rest'], variadic: true }] } as never }),
    );
    expect(Object.keys(specs)).toEqual(['out']);
  });

  it('keys each option as an ordinary, enumerable and writable property', () => {
    const specs = optionSpecs(snapshot({ keys: ['dry-run'] }));
    expect(Object.getOwnPropertyDescriptor(specs, 'dryRun')).toMatchObject({ enumerable: true, writable: true, configurable: true });
  });
});

describe('projectManifest', () => {
  it('keeps a plugin’s nodes and drops the ones a previous projection added', () => {
    const m = new Manifest();
    m.commands.push({ path: ['y', 'stale'], options: {} }, { path: ['y', 'from-plugin'], options: {}, plugin: 'p' });
    projectManifest(m, snapshot({ description: 'the tool', version: '1.2.3' }));
    expect(m.commands.map((c) => c.path.join(' '))).toEqual(['y from-plugin', 'y']);
    expect(m.version).toBe('1.2.3');
    expect(m.find(['y'])?.description).toBe('the tool');
  });

  it('adds only what a node registered: one example, $0 named, and no empty fields', () => {
    const m = new Manifest();
    projectManifest(m, snapshot({ examples: [['$0 run', 'runs it']], positionals: { demanded: [{ cmd: ['file'], variadic: false }], optional: [] } as never }));
    const root = m.find(['y']);
    expect(root?.examples).toEqual([{ command: 'y run', description: 'runs it' }]);
    expect(root?.arguments).toStrictEqual([{ name: 'file', required: true, variadic: false }]);
    expect(root).not.toHaveProperty('effects');
    const bare = new Manifest();
    projectManifest(bare, snapshot());
    expect(bare.find(['y'])).not.toHaveProperty('arguments');
    expect(bare.find(['y'])).not.toHaveProperty('examples');
  });

  it('projects a deprecated command, a command with no description, and a handler that runs', () => {
    const m = new Manifest();
    const child = (over: Partial<Snapshot>): Snapshot => snapshot({ ...over });
    projectManifest(
      m,
      snapshot({
        commands: [
          { name: 'old', description: 'the old way', deprecated: 'use new', child: child({ hasHandler: true }) },
          { name: 'quiet', description: false, deprecated: false, child: child({}) },
        ],
      }),
    );
    expect(m.version).toBeUndefined();
    const old = m.find(['y', 'old']);
    expect(old).toMatchObject({ description: 'the old way', deprecated: 'use new' });
    // yargs runs the handler itself; the node's `run` only marks it runnable and returns nothing.
    expect(old?.run?.({} as never)).toBeUndefined();
    const quiet = m.find(['y', 'quiet']);
    expect(quiet).not.toHaveProperty('description');
    expect(quiet).not.toHaveProperty('deprecated');
    expect(quiet).not.toHaveProperty('run');
  });
});

describe('render — a handler’s return value on the injected stream', () => {
  it('prints a string as a line, an object as key: value lines, and anything else as JSON', () => {
    expect(render(undefined)).toBe('');
    expect(render(null)).toBe('');
    expect(render('done')).toBe('done\n');
    expect(render({ name: 'ada', tags: ['x'] })).toBe('name: ada\ntags: ["x"]\n');
    expect(render([1, 2])).toBe('[1,2]\n');
    expect(render(7)).toBe('7\n');
  });
});

describe('the version on a manifest projected again', () => {
  it('drops a version turned off since the last access, as --version and --schema stop reporting it', () => {
    const y = yargs([]).scriptName('app').version('1.2.3');
    expect(y.manifest.version).toBe('1.2.3');
    y.version(false);
    expect(y.manifest.version).toBeUndefined();
  });
});
