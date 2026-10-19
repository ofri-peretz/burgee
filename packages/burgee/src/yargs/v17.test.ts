/**
 * `burgee/yargs/v17` (`previous-majors` R3): the three places yargs 17 behaves as 18 does not,
 * each beside 18's own answer from `burgee/yargs`, so a switch that leaked into the current
 * major, or vanished from the older one, is red here. yargs 17.7.3's own suite grades the entry
 * in `compat-oracle` (`yargs-17`); this pins each switch in process. The `require()` singleton
 * (R4) is `v17-require.test.ts`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import Current from '../yargs.js';

import { yargs17 } from './v17-factory.js';
import factory17 from './v17-yargs.js';
import Yargs17, { Parser } from './v17.js';

const root = mkdtempSync(join(tmpdir(), 'burgee-v17-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A command module, as CommonJS, at `rel` under a fresh directory. */
function commands(files: Record<string, string | undefined>): string {
  const dir = mkdtempSync(join(root, 'cmd-'));
  for (const [rel, name] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    const command = name === undefined ? '' : `command: '${name}', `;
    writeFileSync(join(dir, rel), `module.exports = { ${command}describe: 'about ${rel}', builder: {}, handler() {} };\n`);
  }
  return dir;
}

/**
 * An instance as these cases drive it: 17's `commandDir()` options (`recurse: 'yes'`, a two-argument
 * `include`) and the internals seam are not on 18's declared `Argv`, so each factory is read
 * through this shape rather than its own types.
 */
type Link = (...args: unknown[]) => Chain;
interface Chain {
  addDirectory: Link;
  command: Link;
  commandDir: Link;
  detectLocale: Link;
  getCommandHandlers: Link;
  getCommandInstance: Link;
  getCommands: Link;
  getInternalMethods: Link;
  getUsageInstance: Link;
  locale: Link;
  parse: Link;
}
type Loose = (processArgs?: string[]) => Chain;
const Y17 = Yargs17 as unknown as Loose;
const Y18 = Current as unknown as Loose;
const make17 = (modules?: NodeJS.Dict<NodeJS.Module>): Loose => yargs17(modules) as unknown as Loose;

/** The command instance behind an instance, through yargs' own internals seam. */
const commandsOf = (y: Chain): Chain => y.getInternalMethods().getCommandInstance();

/** The commands an instance registered, in registration order. */
const registered = (y: Chain): string[] => commandsOf(y).getCommands() as unknown as string[];

describe('the string table is 17\'s: never reset by building an instance', () => {
  it('starts at `en`, where 18 sets `en_US` on every instance', () => {
    expect(make17()([]).detectLocale(false).locale()).toBe('en');
    expect(Y18([]).detectLocale(false).locale()).toBe('en_US');
  });

  it('keeps a locale one instance set for the next, as 17 does within one load', () => {
    const make = make17();
    make([]).locale('pirate');
    expect(make([]).detectLocale(false).locale()).toBe('pirate');
  });

  it('is its own per factory, so one load of the entry never sees another\'s', () => {
    make17()([]).locale('fr');
    expect(make17()([]).detectLocale(false).locale()).toBe('en');
  });
});

describe("commandDir() walks as 17's require-directory does", () => {
  const tree = { 'dream.cjs': 'dream', 'deep/within.cjs': 'within', 'deep/deeper/inception.cjs': 'inception', 'deep/deeper/abyss/limbo.cjs': 'limbo' };

  it('depth first, a directory before the files beside it', () => {
    const dir = commands(tree);
    expect(registered(Y17([]).commandDir(dir, { recurse: true, extensions: ['cjs'] }))).toEqual(['limbo', 'inception', 'within', 'dream']);
    expect(registered(Y18([]).commandDir(dir, { recurse: true, extensions: ['cjs'] }))).toEqual(['dream', 'within', 'inception', 'limbo']);
  });

  it('reads only the directory itself unless `recurse` is `true`', () => {
    const dir = commands(tree);
    expect(registered(Y17([]).commandDir(dir, { extensions: ['cjs'] }))).toEqual(['dream']);
    expect(registered(Y17([]).commandDir(dir, { recurse: 'yes', extensions: ['cjs'] }))).toEqual(['dream']);
  });

  it('reads `.js` when no extensions are given', () => {
    expect(registered(Y17([]).commandDir(commands(tree), { recurse: true }))).toEqual([]);
  });

  it('hands `visit` the module itself, its path and its file name, and drops what it refuses', () => {
    const dir = commands(tree);
    const seen: unknown[][] = [];
    const y = Y17([]).commandDir(dir, {
      extensions: ['cjs'],
      visit: (module: unknown, path: string, file: string) => {
        seen.push([module, path, file]);
        return false;
      },
    });
    expect(seen).toEqual([[createRequire(import.meta.url)(join(dir, 'dream.cjs')), join(dir, 'dream.cjs'), 'dream.cjs']]);
    expect(Object.getPrototypeOf(seen[0]?.[0])).toBe(Object.prototype);
    expect(registered(y)).toEqual([]);
  });

  it('tests `include` and `exclude` against the whole path, and hands a function the file name too', () => {
    const dir = commands(tree);
    expect(registered(Y17([]).commandDir(dir, { recurse: true, extensions: ['cjs'], exclude: /deep/ }))).toEqual(['dream']);
    expect(registered(Y17([]).commandDir(dir, { recurse: true, extensions: ['cjs'], include: /deeper/ }))).toEqual(['limbo', 'inception']);
    const calls: string[][] = [];
    const only = (path: string, file: string): boolean => {
      calls.push([path, file]);
      return file === 'within.cjs';
    };
    expect(registered(Y17([]).commandDir(dir, { recurse: true, extensions: ['cjs'], include: only }))).toEqual(['within']);
    expect(calls).toContainEqual([join(dir, 'deep', 'within.cjs'), 'within.cjs']);
    expect(registered(Y17([]).commandDir(dir, { recurse: true, extensions: ['cjs'], exclude: only }))).toEqual(['limbo', 'inception', 'dream']);
  });

  it('names a module that names no command after its file, and leaves the module as it was', () => {
    const dir = commands({ 'nameless.cjs': undefined });
    expect(registered(Y17([]).commandDir(dir, { extensions: ['cjs'] }))).toEqual(['nameless']);
    expect(createRequire(import.meta.url)(join(dir, 'nameless.cjs'))).not.toHaveProperty('command');
  });

  it('registers a file once, however often its directory is read', () => {
    const dir = commands({ 'dream.cjs': 'dream' });
    const y = Y17([]).commandDir(dir, { extensions: ['cjs'] }).commandDir(dir, { extensions: ['cjs'] });
    expect(y.getInternalMethods().getUsageInstance().getCommands()).toHaveLength(1);
  });

  it('skips the file that called it', () => {
    const dir = commands({ 'dream.cjs': 'dream', 'self.cjs': 'self' });
    const y = Y17([]);
    commandsOf(y).addDirectory(dir, createRequire(import.meta.url), join(dir, 'self.cjs'), { extensions: ['cjs'] });
    expect(registered(y)).toEqual(['dream']);
  });
});

describe('a command module named by its file, through the CommonJS module cache', () => {
  const module = { describe: 'no name', builder: {}, handler: () => undefined };
  const cache = { '/x/lib/nameless.cjs': { exports: module, filename: '/x/lib/nameless.cjs' } } as unknown as NodeJS.Dict<NodeJS.Module>;

  it('finds the module by its exports and names it after its file, as 17\'s `require()` entry does', () => {
    expect(registered(make17(cache)([]).command(module))).toEqual(['nameless']);
    expect(module).not.toHaveProperty('command');
  });

  it('keeps the aliases a nameless module declares', () => {
    const aliased = { ...module, aliases: ['nl'] };
    const withAliases = { '/x/nameless.cjs': { exports: aliased, filename: '/x/nameless.cjs' } } as unknown as NodeJS.Dict<NodeJS.Module>;
    const y = make17(withAliases)([]).command(aliased);
    expect(commandsOf(y).getCommandHandlers()).toHaveProperty('nameless');
    expect(registered(y)).toEqual(['nameless', 'nl']);
  });

  it('refuses one it cannot find, and the `import` entry, which has no cache, finds none', () => {
    expect(() => make17(cache)([]).command({ ...module })).toThrow(/No command name given for module/);
    expect(() => Y17([]).command(module)).toThrow(/No command name given for module/);
  });

  it('leaves a module that names its command, or several, as it is', () => {
    const named = { ...module, command: 'serve' };
    const listed = { ...module, command: ['run', 'go'] };
    const both = { ...cache, '/x/serve.cjs': { exports: named, filename: '/x/serve.cjs' }, '/x/run.cjs': { exports: listed, filename: '/x/run.cjs' } } as unknown as NodeJS.Dict<NodeJS.Module>;
    expect(registered(make17(both)([]).command(named).command(listed))).toEqual(['serve', 'run', 'go']);
  });

  it('passes every other form of `.command()` through', () => {
    let ran = '';
    make17(cache)(['hi', 'there']).command('hi <who>', 'greet', {}, (argv: { who: unknown }) => {
      ran = String(argv.who);
    }).parse();
    expect(ran).toBe('there');
  });
});

describe('the `import` entry and `burgee/yargs/v17/yargs`', () => {
  it('imports 17\'s factory: every call a fresh instance, no singleton methods on it', () => {
    expect(Yargs17(['--n', '1']).parse()).toMatchObject({ n: 1 });
    expect(Yargs17).not.toHaveProperty('option');
    expect(Yargs17).not.toHaveProperty('argv');
  });

  it('is 17\'s `yargs/yargs`: the factory carrying exactly its three statics', () => {
    expect(Object.keys(factory17)).toEqual(['applyExtends', 'hideBin', 'Parser']);
    expect(factory17.Parser).toBe(Parser);
    expect(factory17.hideBin(['node', 'app.js', '--x'])).toEqual(['--x']);
    expect(factory17(['--n', '2']).parse()).toMatchObject({ n: 2 });
    expect(Object.keys(Current)).toEqual([]);
  });
});
