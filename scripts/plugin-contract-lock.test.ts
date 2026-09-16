/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Plugin contract lock — `.sdlc/PLAN.md` 1.7, and `plugin-contract` R1, R5a, R6 and R13.
 *
 * `plugin-schema-lock.test.ts` already checks the *files*: that each host has a schema, that
 * the copies are byte-identical, that `./schema.json` resolves. What it cannot check is the
 * claim those files exist to make — **one plain object registers into every host**. That is
 * R1, it is the whole reason the schema is shared rather than per package, and until this
 * file nothing executed it.
 *
 * Three assertions, matching 1.7's own wording:
 *
 *   1. every `./plugin` export validates against the one schema — every host is reachable by
 *      the specifier its README and its errors name, and `validate()` on each accepts the
 *      family object;
 *   2. **one plugin object registers into every host** — the same frozen object, in one pass,
 *      through each host's real `register()`;
 *   3. every host README carries a `## Plugins` section, generated rather than written.
 *
 * And 1.7's done-when: *"a mutation removing any host's key goes red."* `it.each` over
 * `HOST_KEYS` is that mutation, run once per host: the object minus that host's key must
 * still be *accepted* (a plugin need not contribute to every layer) while the host's
 * contribution must actually disappear from `registered()`. A host that reports a
 * contribution it was never given is the failure this catches, and it is not hypothetical —
 * `flagstaff`'s registry once reported a key from a previous test's object because `reset()`
 * did not clear it.
 *
 * Hosts are derived from the tree (`src/plugin.ts` exists), never listed, so a new layer is
 * covered the moment it is created. The **keys** are listed, because a key is a promise the
 * layer makes to plugin authors and a derived list would silently shrink when one was
 * dropped — which is exactly the mutation this is here to catch.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as bellpull from '../packages/bellpull/src/plugin.js';
// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as burgee from '../packages/burgee/src/plugin.js';
// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as caique from '../packages/caique/src/plugin.js';
// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as closeout from '../packages/closeout/src/plugin.js';
// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as flagstaff from '../packages/flagstaff/src/plugin.js';
// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as paratext from '../packages/paratext/src/plugin.js';
// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as roundel from '../packages/roundel/src/plugin.js';
// eslint-disable-next-line import-next/no-namespace, import-next/no-relative-packages -- the source, by path, on purpose: `burgee` hosts plugins and publishes no `./plugin`, so the package-name form cannot reach the one host this lock most needs to read — and reading `dist/` would measure the last build rather than the tree
import * as seniority from '../packages/seniority/src/plugin.js';

/**
 * The hosts' own modules, imported statically because `node-security` forbids a dynamic
 * `import()` and it is right to: a specifier built from a directory listing is a specifier
 * nobody reviewed. The cost is that this map can fall behind the tree, so the two are
 * compared below — a package that grows a `src/plugin.ts` and no entry here fails.
 */
interface PluginModule {
  CONTRACT?: number;
  validate?: (plugin: unknown) => void;
  register?: (plugin: unknown) => void;
  registered?: () => unknown;
  reset?: () => void;
  definePlugin?: (plugin: unknown) => unknown;
}

const MODULES: Record<string, PluginModule> = { bellpull, burgee, caique, closeout, flagstaff, paratext, roundel, seniority };

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

/**
 * What each layer hosts — `plugin-contract` R4, R5, R5a and the wave-1 rows 1.2–1.6.
 *
 * `linegauge` is deliberately absent and that absence is R5a's other half: it hosts nothing
 * and says so in its README, which assertion 3 below still checks. A layer added here
 * without a `src/plugin.ts` fails the first case, and a layer with one and no row here fails
 * the coverage case — so the table cannot drift from the tree in either direction.
 */
const HOST_KEYS: Record<string, string> = {
  roundel: 'tokens',
  flagstaff: 'glyphs',
  caique: 'widgets',
  closeout: 'handlers',
  seniority: 'sources',
  bellpull: 'resolvers',
  paratext: 'capabilities',
  burgee: 'commands',
};

/**
 * `burgee` hosts plugins and does not publish `./plugin`.
 *
 * Recorded as a declared gap rather than asserted away: `packages/burgee/**` is the engine
 * lane's path and this file is the integrator's, so the export is not this lane's to add.
 * The shape is the one `plugin-schema-lock.test.ts` caught in `flagstaff` — a host whose own
 * `E_PLUGIN_SCHEMA` message names a specifier that does not resolve — and it is the reason
 * assertion 1 reads `src/plugin.ts` directly instead of importing the published subpath.
 */
const NO_PLUGIN_SUBPATH = new Set(['burgee']);

/**
 * `burgee` declares the plugin *shape* the family registers against and hosts no key of its
 * own — `readme-benchmarks.ts` says exactly that in its generated section, and saying "hosts
 * no plugins" of the package that defines what a plugin is would be true and useless. It
 * still validates `commands`, which is why it has a `HOST_KEYS` row for the R1 cases below.
 */
const DEFINES_THE_SHAPE = new Set(['burgee']);

const PLUGIN_SUBPATH = './plugin';

interface Host {
  name: string;
  dir: string;
  key: string;
}

/** Every package that hosts plugins, found by looking rather than by a list. */
function hosts(): Host[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'src/plugin.ts')))
    .map((e) => ({ name: e.name, dir: join(PACKAGES, e.name), key: HOST_KEYS[e.name] ?? '' }));
}

const found = hosts();

/** The subpath a host publishes its plugin surface at, when it publishes one. */
const exportsPlugin = (host: Host): boolean =>
  Object.keys((JSON.parse(readFileSync(join(host.dir, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> }).exports ?? {}).includes(PLUGIN_SUBPATH);

describe('one contract, every host', () => {
  it('finds hosts at all — otherwise every case below is vacuous', () => {
    expect(found.map((h) => h.name).sort()).not.toHaveLength(0);
  });

  it('has a row in HOST_KEYS for every host in the tree', () => {
    expect(found.filter((h) => h.key === '').map((h) => h.name), 'these packages have a src/plugin.ts and no key declared in this lock').toEqual([]);
  });

  it('has a host in the tree for every row in HOST_KEYS', () => {
    const present = new Set(found.map((h) => h.name));
    expect(Object.keys(HOST_KEYS).filter((n) => !present.has(n)), 'these rows name a package that no longer hosts plugins').toEqual([]);
  });

  it.each(found.filter((h) => !NO_PLUGIN_SUBPATH.has(h.name)))('$name: publishes "./plugin", the specifier its README names', (host) => {
    expect(exportsPlugin(host), `${host.name} hosts plugins and does not export ${PLUGIN_SUBPATH}`).toBe(true);
  });

  it('records every host that does not publish "./plugin" — and no more', () => {
    const missing = found.filter((h) => !exportsPlugin(h)).map((h) => h.name);
    expect(missing.sort(), 'a host silently stopped publishing ./plugin, or one started and NO_PLUGIN_SUBPATH was not trimmed').toEqual([...NO_PLUGIN_SUBPATH].sort());
  });
});

/**
 * R13 / PLAN 5.2 — a layer either hosts plugins and documents the key, or says why it hosts
 * none, and either way the paragraph is **generated**.
 *
 * 1.7's wording asks for a `## Plugins` section; what `scripts/readme-benchmarks.ts` actually
 * generates is `## Where it sits`, whose first sentence names the keys. That is the section
 * `readme-lock.test.ts` regenerates and compares, so it is the one that cannot rot, and this
 * asserts against it rather than against the heading the plan wrote before the generator
 * existed. Two packages (`linegauge`, `closeout`) also carry a hand-written `## Plugins`; it
 * is prose beside the generated fact, not the fact.
 *
 * Checked over every package with a README, not only the hosts — `linegauge` is the
 * interesting case, and R5a's other half is that it says it hosts nothing.
 */
describe('every layer says what it hosts, in the generated section', () => {
  // Published packages only. `compat-oracle` is `"private": true` — internal tooling, never
  // on npm, and `readme-benchmarks.ts` does not generate into it.
  const layers = readdirSync(PACKAGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'README.md')))
    .filter((e) => (JSON.parse(readFileSync(join(PACKAGES, e.name, 'package.json'), 'utf8')) as { private?: boolean }).private !== true)
    .map((e) => ({ name: e.name, readme: join(PACKAGES, e.name, 'README.md') }));

  it('has layers to check', () => {
    expect(layers).not.toHaveLength(0);
  });

  it.each(layers)('$name: its README carries the generated `## Where it sits`', (layer) => {
    expect(readFileSync(layer.readme, 'utf8'), `${layer.name}'s README has no generated \`## Where it sits\` section`).toMatch(/^## Where it sits$/m);
  });

  it.each(layers.filter((l) => HOST_KEYS[l.name] !== undefined && !DEFINES_THE_SHAPE.has(l.name)))('$name: that section names the key it hosts', (layer) => {
    expect(readFileSync(layer.readme, 'utf8'), `${layer.name} hosts \`${HOST_KEYS[layer.name] ?? ''}\` and its README never names the key`).toContain(`\`${HOST_KEYS[layer.name] ?? ''}\``);
  });

  it('linegauge hosts nothing and its README says so — R5a\'s other half', () => {
    expect(existsSync(join(PACKAGES, 'linegauge/src/plugin.ts')), 'linegauge grew a plugin host; this case and 1.6 both need rewriting').toBe(false);
    expect(readFileSync(join(PACKAGES, 'linegauge/README.md'), 'utf8')).toMatch(/hosts no plugin key of its own/);
  });
});

/**
 * R1, executed — the assertion this whole file exists for.
 *
 * One frozen object, carrying every layer's key at once, passed through each host's real
 * `register()`. Not a copy per host: the same reference, so a host that mutates what it is
 * given breaks the next host in line and the failure names which one.
 *
 * The source module is imported rather than the published subpath, because `burgee` hosts
 * plugins and does not publish `./plugin` (see `NO_PLUGIN_SUBPATH`) — and a lock that could
 * only run on the hosts whose packaging is already right would not have caught that.
 */
describe('one object registers into every host', () => {
  /**
   * Every value here is the shape its host actually accepts, and three of them were wrong on
   * the first run — which is the point. `closeout.handlers` and `burgee.commands` are
   * **arrays**, not objects, and `roundel.tokens` keys are a closed set of ten semantic
   * names. None of those three constraints is in `schema.json`, the file every host tells a
   * plugin author to validate against (see `the schema-agreement cases below).
   */
  const PLUGIN = Object.freeze({
    name: 'contract-lock',
    contract: 1,
    tokens: { ok: '#336699' },
    glyphs: { ok: '+' },
    widgets: {},
    handlers: [],
    sources: {},
    resolvers: {},
    capabilities: {},
    commands: [],
  });

  it('imports a module for every host in the tree, and no more', () => {
    expect(Object.keys(MODULES).sort(), 'MODULES and the tree disagree — a host was added or removed without updating this file').toEqual(found.map((h) => h.name).sort());
  });

  it.each(found)('$name: validate() accepts the family object', (host) => {
    const mod = MODULES[host.name] as PluginModule;
    expect(typeof mod.validate, `${host.name}/src/plugin.ts exports no validate()`).toBe('function');
    expect(() => (mod.validate as (p: unknown) => void)(PLUGIN)).not.toThrow();
  });

  it.each(found)('$name: register() accepts it, and it is still frozen afterwards', (host) => {
    const mod = MODULES[host.name] as PluginModule;
    if (typeof mod.register !== 'function') {
      // A host may validate without registering — `burgee` composes plugins through
      // `definePlugin`/`use()` rather than a module-level registry. Named, not skipped.
      expect(typeof (mod as { definePlugin?: unknown }).definePlugin, `${host.name} has neither register() nor definePlugin()`).toBe('function');
      return;
    }
    mod.reset?.();
    expect(() => (mod.register as (p: unknown) => void)(PLUGIN)).not.toThrow();
    expect(Object.isFrozen(PLUGIN), `${host.name}.register() mutated the object it was given`).toBe(true);
    mod.reset?.();
  });

  /**
   * 1.7's done-when: *a mutation removing any host's key goes red.* One case per host, each
   * removing exactly that host's key.
   *
   * The object without the key must still validate — a plugin contributing to one layer is
   * not obliged to contribute to the others — and the host's `registered()` must show the
   * absence. A host that reports a contribution it was never given is what this catches.
   */
  it.each(found)('$name: dropping its key leaves the host with nothing to report', (host) => {
    const mod = MODULES[host.name] as PluginModule;
    const { [host.key]: _dropped, ...without } = PLUGIN as Record<string, unknown>;
    expect(() => mod.validate?.(without), `${host.name} refuses a plugin that simply does not contribute to it`).not.toThrow();
    if (typeof mod.register !== 'function' || typeof mod.registered !== 'function') return;
    mod.reset?.();
    mod.register(without);
    expect(JSON.stringify(mod.registered()), `${host.name} reports a \`${host.key}\` contribution from a plugin that has none`).not.toContain(`"${host.key}":{"`);
    mod.reset?.();
  });
});

/**
 * R2, the half `plugin-schema-lock.test.ts` cannot reach — a key the schema **does** describe,
 * described wrongly.
 *
 * That lock records the keys the schema never mentions (`widgets`, `handlers`, `sources`,
 * `resolvers`, `commands`) and why naming them in a file all eight hosts share would make
 * every host validate every other host's key. This is the sharper failure: `tokens` was in
 * the schema as "any name to a `#rrggbb` colour" while `roundel`'s `validate()` accepted ten
 * names and refused the rest. A plugin author doing exactly what their own `E_PLUGIN_SCHEMA`
 * error told them — validate against `roundel/schema.json` — got a green from the schema and
 * a throw from `register()`.
 *
 * Found by this file on 2026-09-16, with `{ accent: '#336699' }`, and fixed in the same pass:
 * the schema now carries `propertyNames.enum`. These two cases keep the enum and the runtime
 * set equal from both sides, so neither can grow a name the other does not know.
 */
describe('the shared schema and the host that enforces it agree', () => {
  const tokens = (JSON.parse(readFileSync(join(PACKAGES, 'roundel/src/schema.json'), 'utf8')) as {
    properties: Record<string, { propertyNames?: { enum?: string[] } }>;
  }).properties['tokens'];

  it('the schema names the token set at all', () => {
    expect(tokens?.propertyNames?.enum, 'roundel/src/schema.json stopped constraining token names').toBeDefined();
  });

  it.each((tokens?.propertyNames?.enum ?? []).map((n) => [n]))('roundel accepts %s, which the schema promises', (token) => {
    const mod = roundel as unknown as { validate: (p: unknown) => void };
    expect(() => mod.validate({ name: 'schema-agreement', tokens: { [token]: '#336699' } })).not.toThrow();
  });

  it('and refuses one the schema does not promise', () => {
    const mod = roundel as unknown as { validate: (p: unknown) => void };
    const unknown = 'accent';
    expect(tokens?.propertyNames?.enum, 'this case needs a name the schema does NOT list').not.toContain(unknown);
    expect(() => mod.validate({ name: 'schema-agreement', tokens: { [unknown]: '#336699' } })).toThrow(/is not a token/);
  });
});
