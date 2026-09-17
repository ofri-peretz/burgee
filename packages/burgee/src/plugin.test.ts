/**
 * The plugin host refuses what it cannot host — `plugin-contract` R1, R6, R8, and V5.
 *
 * burgee is the one package in this family whose extension point is **published**: 0.6.1 is
 * on npm, `definePlugin` was `return plugin;`, and `Manifest.use()` called `this.add()`
 * directly rather than going through the guards `defineCommand` runs. So every refusal here
 * is a refusal that used to be a silent acceptance, and the one this file is named for is the
 * first test below: a plugin contributing a command with an option named `json` overwrote the
 * envelope flag in the parse config, on an agent-native CLI whose whole contract is that
 * `--json` means machine-readable output.
 *
 * Each `it` was run against the unfixed tree before the fix existed. The two characterisation
 * tests at the end are the exception and are labelled as such: they pin the *consequence* the
 * guards exist to prevent, by building the same manifest through the unguarded `add()` path,
 * and they passed before and after. They are here so that if a later change removes a guard,
 * the failure above is explained by the test below it rather than by a commit message.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCommand } from './execute.js';
import { definePlugin, Manifest, type Plugin } from './index.js';

/** The refusal's code, or what was thrown instead — so a raw `TypeError` reads as one. */
function refusal(fn: () => unknown): { code?: string; message: string } {
  try {
    fn();
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { ...(e.code === undefined ? {} : { code: e.code }), message: e.message ?? String(error) };
  }
  return { message: '(nothing was thrown)' };
}

/**
 * A plugin as a plugin author writes one: a bare object, which is what `use()` receives.
 *
 * Cast rather than typed, deliberately. Half of what this file proves is that a *malformed*
 * plugin is refused, and a malformed plugin is by definition one the types would have caught
 * — in a language a plugin author may not be writing in, from a package boundary the compiler
 * never crosses. The refusals have to hold at run time or they hold nowhere.
 */
const plugin = (extra: Record<string, unknown>): Plugin => ({ name: 'acme', contract: 1, ...extra }) as unknown as Plugin;

/** A function is not a plain object, and neither is the array beside it in the case list below. */
const noop = (): undefined => undefined;

const command = (options: Record<string, unknown>): Record<string, unknown> => ({ path: ['audit'], description: 'Audit the tree', options });

describe('a plugin command gets the same guards a first-party command gets', () => {
  /**
   * The load-bearing one. `toParseConfig` seeds `json: { type: 'boolean' }` and then writes
   * every declared option over the top of it, so a plugin option named `json` did not clash
   * with the envelope flag — it replaced it. `defineCommand` has refused this since V5 was
   * written; `use()` never called it.
   */
  it('refuses a plugin option named json, which would overwrite the envelope flag', () => {
    const manifest = new Manifest();
    expect(refusal(() => manifest.use(plugin({ commands: [command({ json: { type: 'string' } })] })))).toMatchObject({
      code: 'E_PLUGIN_SCHEMA',
      message: expect.stringMatching(/reserved/),
    });
  });

  it('refuses the reserved names in their kebab form too, not only as written', () => {
    const manifest = new Manifest();
    for (const name of ['help', 'schema', 'mcp', 'version', 'explain']) {
      expect(refusal(() => manifest.use(plugin({ commands: [command({ [name]: { type: 'boolean' } })] }))).code, name).toBe('E_PLUGIN_SCHEMA');
    }
  });

  /** `checkDefinition`'s four: unknown type, two shorts, two names that meet on the line, a bound on a non-number. */
  it('runs checkDefinition over a plugin command, which use() never did', () => {
    const manifest = new Manifest();
    const cases: Record<string, unknown>[] = [
      { a: { type: 'text' } },
      { a: { type: 'boolean', short: 'v' }, b: { type: 'boolean', short: 'v' } },
      { dryRun: { type: 'boolean' }, 'dry-run': { type: 'boolean' } },
      { a: { type: 'string', minimum: 1 } },
    ];
    for (const options of cases) {
      expect(refusal(() => manifest.use(plugin({ commands: [command(options)] }))).code, JSON.stringify(options)).toBe('E_PLUGIN_SCHEMA');
    }
  });

  it('refuses before the command lands, so a refused plugin contributes nothing', () => {
    const manifest = new Manifest();
    refusal(() => manifest.use(plugin({ commands: [command({ json: { type: 'string' } })] })));
    expect(manifest.commands).toEqual([]);
    expect(manifest.plugins).toEqual([]);
  });

  it('still accepts a plugin command that breaks no rule', () => {
    const manifest = new Manifest();
    manifest.use(plugin({ commands: [command({ deep: { type: 'boolean' } })] }));
    expect(manifest.commands.map((c) => c.plugin)).toEqual(['acme']);
  });
});

describe('the contract number decides how strictly a plugin is read', () => {
  /**
   * The published-extension-point case. A plugin built against 0.6.1 carries no `contract`,
   * because that burgee had no such key — and it may carry exactly the `json` option above.
   * Refusing it names the version rather than changing what it does behind its back.
   */
  it('refuses a plugin that declares no contract, and says which burgee it was written for', () => {
    const manifest = new Manifest();
    const thrown = refusal(() => manifest.use({ name: 'acme', commands: [] } as never));
    expect(thrown.code).toBe('E_PLUGIN_CONTRACT');
    expect(thrown.message).toMatch(/0\.6\.1/);
    expect(thrown.message).toMatch(/contract/);
  });

  it('refuses a contract from a burgee this one does not know', () => {
    const manifest = new Manifest();
    expect(refusal(() => manifest.use(plugin({ contract: 2 }))).code).toBe('E_PLUGIN_CONTRACT');
    expect(refusal(() => manifest.use(plugin({ contract: 1.5 }))).code).toBe('E_PLUGIN_CONTRACT');
  });

  /** `definePlugin` stamps the contract it was compiled against, so an author never types it. */
  it('stamps the contract onto a plugin declared with definePlugin', () => {
    expect(definePlugin({ name: 'acme' })).toMatchObject({ name: 'acme', contract: 1 });
  });

  it('leaves a contract the author declared alone', () => {
    expect(definePlugin({ name: 'acme', contract: 1 }).contract).toBe(1);
  });
});

describe('the plugin object itself', () => {
  it('refuses a plugin that is not a plain object', () => {
    const manifest = new Manifest();
    for (const value of [undefined, null, 'acme', [], noop]) {
      expect(refusal(() => manifest.use(value as never)).code, String(value)).toBe('E_PLUGIN_SCHEMA');
    }
  });

  /** Accepted before: the commands carried `plugin: undefined`, so M3 attribution was lost in silence. */
  it('refuses a plugin with no name, which used to lose its own attribution', () => {
    const manifest = new Manifest();
    expect(refusal(() => manifest.use({ contract: 1, commands: [] } as never)).code).toBe('E_PLUGIN_SCHEMA');
    expect(refusal(() => manifest.use({ name: '', contract: 1 } as never)).code).toBe('E_PLUGIN_SCHEMA');
  });

  /**
   * `enforce: 'mid'` was accepted and `ORDER['mid']` is `undefined`, so the comparator
   * returned `NaN` and the hook order became whatever the sort implementation did with it.
   */
  it("refuses an enforce that is not 'pre' or 'post'", () => {
    const manifest = new Manifest();
    const thrown = refusal(() => manifest.use(plugin({ enforce: 'mid' })));
    expect(thrown.code).toBe('E_PLUGIN_SCHEMA');
    expect(thrown.message).toMatch(/enforce/);
  });

  it('refuses a hook whose handler is not a function, at registration rather than one run later', () => {
    const manifest = new Manifest();
    expect(refusal(() => manifest.use(plugin({ hooks: { preRun: { handler: 'nope' } }}))).code).toBe('E_PLUGIN_SCHEMA');
    expect(refusal(() => manifest.use(plugin({ hooks: { postRun: {} } }))).code).toBe('E_PLUGIN_SCHEMA');
    expect(refusal(() => manifest.use(plugin({ hooks: 'nope' }))).code).toBe('E_PLUGIN_SCHEMA');
  });

  it('refuses a commands key that is not an array of command nodes with a path', () => {
    const manifest = new Manifest();
    expect(refusal(() => manifest.use(plugin({ commands: 'nope' }))).code).toBe('E_PLUGIN_SCHEMA');
    expect(refusal(() => manifest.use(plugin({ commands: [{ options: {} }] }))).code).toBe('E_PLUGIN_SCHEMA');
    expect(refusal(() => manifest.use(plugin({ commands: [{ path: [], options: {} }] }))).code).toBe('E_PLUGIN_SCHEMA');
  });

  /**
   * A collision resolved inconsistently: `find()` returns the first match and `resolve()`
   * lets the last registered node win a tie, so the same path answered two different nodes
   * depending on which projection asked. Refused at the door rather than reconciled — which
   * of the two is right for a *first-party* duplicate is a decision about every program, not
   * about plugins.
   */
  it('refuses a plugin command whose path is already taken', () => {
    const manifest = new Manifest();
    manifest.add({ path: ['audit'], options: {} });
    expect(refusal(() => manifest.use(plugin({ commands: [command({})] }))).message).toMatch(/audit/);
    expect(refusal(() => manifest.use(plugin({ commands: [command({})] }))).code).toBe('E_PLUGIN_SCHEMA');
  });
});

describe('what the guards prevent (characterisation: true before the fix and after)', () => {
  /** Built through `add()`, the unguarded path, because `use()` now refuses to build it. */
  function shadowed(): Manifest {
    const manifest = new Manifest();
    manifest.rootPath = ['app'];
    manifest.add({ path: ['app'], options: {} });
    manifest.add({ path: ['app', 'audit'], options: { json: { type: 'string' } }, run: () => ({ ok: 1 }), plugin: 'acme' });
    return manifest;
  }

  it('an option named json takes --json away from the caller', async () => {
    const { stdout } = await runCommand(shadowed(), ['audit', '--json', 'x']);
    // The envelope would be `{"ok":true,…}`; instead `--json` consumed "x" as a plugin value.
    expect(stdout.startsWith('{"ok":true')).toBe(false);
  });

  it('two nodes on one path answer differently to find() and resolve()', () => {
    const manifest = new Manifest();
    manifest.add({ path: ['audit'], description: 'first', options: {} });
    manifest.add({ path: ['audit'], description: 'second', options: {} });
    expect(manifest.find(['audit'])?.description).toBe('first');
    expect(manifest.resolve(['audit']).node?.description).toBe('second');
  });
});

/**
 * R8 and `plugin-contract` 1.7 — the host is reachable by the specifier that names it.
 *
 * `scripts/plugin-contract-lock.test.ts` recorded burgee in `NO_PLUGIN_SUBPATH`: the one
 * package in the family that hosts plugins and published no `./plugin`, so the lock had to
 * import `../packages/burgee/src/plugin.js` by path to read the host the rest of the family
 * registers against. It is the shape `plugin-schema-lock.test.ts` caught in flagstaff — a
 * refusal whose `fix` names something the author cannot reach — and burgee's version was
 * quieter, because the `fix` named no specifier at all: it said *rebuild it against this
 * burgee, `definePlugin` stamps the contract*, and left the author to work out where
 * `definePlugin` lives. The answer the rest of the family teaches is `<host>/plugin`, and
 * `burgee/plugin` threw `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * Both halves are asserted, because a packaging-only fix leaves the second one wrong: the
 * subpath resolves, **and** the sentence that sends an author looking for it says its name.
 */
describe('the plugin host is reachable by the specifier the family names', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
    exports: Record<string, { import?: string; types?: string } | string>;
  };

  it('publishes "./plugin", the subpath every other host publishes', () => {
    expect(Object.keys(pkg.exports), 'burgee declares the plugin shape the family registers against and was the only host that could not be imported as one').toContain('./plugin');
  });

  it('points it at the host module itself', () => {
    expect(pkg.exports['./plugin']).toMatchObject({ types: './dist/plugin.d.ts', import: './dist/plugin.js' });
  });

  it('names that specifier in the refusal an author who never read the README will meet', () => {
    const manifest = new Manifest();
    let thrown: { code?: string; fix?: string } = {};
    try {
      manifest.use({ name: 'acme' } as unknown as Plugin);
    } catch (error) {
      thrown = error as { code?: string; fix?: string };
    }
    expect(thrown.code).toBe('E_PLUGIN_CONTRACT');
    expect(thrown.fix, 'the fix names `definePlugin` and has never said where `definePlugin` is').toContain('burgee/plugin');
  });
});
