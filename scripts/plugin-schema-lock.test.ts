/**
 * Plugin schema lock — `plugin-contract` R2 and R8.
 *
 * The contract is one object and one schema file. Today exactly one package hosts plugins,
 * which is precisely when this lock is worth writing: a lock added *after* the second copy
 * exists is a lock written against a bug that already shipped.
 *
 * Three things are asserted, and which packages they apply to is derived from the tree
 * rather than listed here — a package hosts plugins when `src/plugin.ts` exists, so a new
 * host is covered by this lock the moment it is created and cannot be forgotten:
 *
 *   1. a host has `src/schema.json` beside its `src/plugin.ts`;
 *   2. every host's copy is byte-identical (R2 — the identity half, which only bites at two
 *      hosts and up, and is here so that the second host lands against it);
 *   3. a host exports `./schema.json`, because its own `E_PLUGIN_SCHEMA` error tells a
 *      plugin author to compare their object against exactly that specifier (R8). An error
 *      whose `fix` does not resolve is worse than no `fix` at all.
 *
 * (3) is the one that fails on main as of 2026-09-08: flagstaff says "compare the object
 * against flagstaff/schema.json" and `flagstaff/schema.json` is not in its `exports`, so
 * following the advice gets `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

/** The subpath a host's own error message names, so the two cannot drift apart. */
const SCHEMA_SUBPATH = './schema.json';

interface Host {
  name: string;
  dir: string;
  schema: string;
  pkg: { exports?: Record<string, unknown> };
}

/**
 * Every package that hosts plugins, found by looking rather than by a list. `src/plugin.ts`
 * is the marker: it is the file that owns `register()` and `validate()`, and a package that
 * has one is making the promise this lock checks.
 */
function hosts(): Host[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'src/plugin.ts')))
    .map((e) => {
      const dir = join(PACKAGES, e.name);
      return {
        name: e.name,
        dir,
        schema: join(dir, 'src/schema.json'),
        pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Host['pkg'],
      };
    });
}

const found = hosts();

describe('the plugin schema', () => {
  it('is hosted by at least one package — otherwise this lock is asserting nothing', () => {
    expect(found.map((h) => h.name)).not.toHaveLength(0);
  });

  it.each(found)('$name: has a schema.json beside its plugin.ts', (host) => {
    expect(existsSync(host.schema), `${host.name}/src/plugin.ts exists but ${host.name}/src/schema.json does not`).toBe(true);
  });

  it.each(found)('$name: exports "./schema.json", the specifier its own E_PLUGIN_SCHEMA fix names', (host) => {
    expect(
      Object.keys(host.pkg.exports ?? {}),
      `${host.name} tells a plugin author to compare against \`${host.name}/schema.json\`, so that subpath has to resolve`,
    ).toContain(SCHEMA_SUBPATH);
  });

  /**
   * R2, the identity half. One host makes this a tautology and that is fine — it is here so
   * that the day a second `src/plugin.ts` appears, its schema is compared against
   * flagstaff's before the PR merges rather than after the two have drifted.
   */
  /**
   * And it describes the key each host actually validates.
   *
   * The two assertions above are satisfied by seven byte-identical copies of a file that is
   * wrong for six of them — which is what this repository had. Every host shipped *flagstaff's*
   * schema, `$id` and title included, describing `tokens`, `glyphs`, `spinners`, `borders`,
   * `components` and `capabilities` and **nothing else**. `caique`'s `widgets`, `closeout`'s
   * `handlers`, `seniority`'s `sources` and `bellpull`'s `resolvers` passed validation only
   * because the root sets `additionalProperties: true`.
   *
   * So a consumer writing a caique widget fetched a schema that said nothing about widgets, and
   * a lock on *identity* reported all seven as correct. Identity is the cheap half; this is the
   * half that makes the shared file worth sharing.
   */
  /**
   * Keys a host validates that the shared schema does not describe — and why the obvious fix
   * is not one.
   *
   * Adding them is a two-line edit, and it **breaks the family**: the schema is byte-identical
   * across all seven hosts by design, so the moment it describes `widgets`, *flagstaff* starts
   * validating `widgets` too. Measured — flagstaff's own suite caught it immediately:
   *
   *     PluginError: plugin.widgets.later: expected object, got boolean
   *
   * That case exists to prove a host **ignores** keys it does not own, which is what lets one
   * plugin object contribute to several hosts at once. So describing every key requires each
   * host to validate only its own first — a change across seven packages and the plugin
   * contract's semantics, not a schema edit. Recorded here so the next attempt starts from the
   * measurement rather than repeating it.
   */
  const UNDESCRIBED: Record<string, string> = {
    widgets: "caique's; needs per-host validation scoping before the shared schema can name it",
    handlers: "closeout's; same",
    sources: "seniority's; same",
    resolvers: "bellpull's; same",
    commands: "burgee's; same — and burgee is the framework the shared shape is declared *by*, which makes it the oddest of the five to leave undescribed",
    hooks: "burgee's; same",
    enforce: "burgee's, and not a contribution key at all — it orders hooks, so describing it would need the schema to say that",
  };

  it.each(found.map((h) => h.name))('%s: the schema describes the key that package hosts', (name) => {
    const host = found.find((h) => h.name === name) as Host;
    const declared = [...(/^export interface Plugin \{$([\s\S]*?)^\}$/m.exec(readFileSync(join(host.dir, 'src/plugin.ts'), 'utf8'))?.[1] ?? '').matchAll(/^ {2}([a-zA-Z]+)\??:/gm)]
      .map((m) => m[1] as string)
      .filter((k) => k !== 'name' && k !== 'contract');
    const described = Object.keys((JSON.parse(readFileSync(host.schema, 'utf8')) as { properties: Record<string, unknown> }).properties);
    const missing = declared.filter((k) => !described.includes(k));
    expect(missing.filter((k) => UNDESCRIBED[k] === undefined), `${name} validates these keys and its schema does not mention them`).toEqual([]);
  });

  it('keeps that list honest — a key the schema now describes must leave it', () => {
    const described = new Set(Object.keys((JSON.parse(readFileSync(found[0]?.schema ?? '', 'utf8')) as { properties: Record<string, unknown> }).properties));
    expect(Object.keys(UNDESCRIBED).filter((k) => described.has(k)), 'these are described now — delete them from UNDESCRIBED').toEqual([]);
  });

  it('is byte-identical everywhere it is hosted', () => {
    const bytes = found.map((h) => ({ name: h.name, text: readFileSync(h.schema, 'utf8') }));
    const first = bytes[0];
    if (!first) return;
    for (const other of bytes.slice(1)) {
      const line = firstDifference(first.text, other.text);
      expect(other.text, `${other.name}/src/schema.json differs from ${first.name}'s at line ${line}`).toBe(first.text);
    }
  });
});

/** 1-based line of the first difference, so a failure says where to look. */
function firstDifference(a: string, b: string): number {
  const left = a.split('\n');
  const right = b.split('\n');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return i + 1;
  }
  return 0;
}

/**
 * A host that validates against one definition imports that definition, not the family schema —
 * and the fragment it imports cannot drift from the definition it was cut from.
 *
 * D-108 is why the fragments exist: every host that imported `schema.json` to validate paid for
 * every other host's definitions, and making `linegauge` the ninth host cost paratext's default
 * import **1,343 bytes** for a definition paratext never reads. paratext only ever read
 * `$defs.capability` — 2,121 of the schema's 8,141 minified bytes — so it imports that alone now,
 * and still publishes the whole contract at `paratext/schema.json` as data.
 *
 * The risk a fragment introduces is the one byte-identity exists to prevent: two copies of a
 * definition, free to disagree. So each fragment is compared structurally against the source's
 * `$defs`, and `scripts/schema-sync.mjs` writes them — the same script that keeps the copies
 * identical, so there is one place a definition changes.
 */
describe('schema fragments', () => {
  const FRAGMENTS = [{ at: 'paratext/src/capability.schema.json', def: 'capability' }];
  const source = JSON.parse(readFileSync(join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'packages/flagstaff/src/schema.json'), 'utf8')) as {
    $defs: Record<string, unknown>;
  };

  it.each(FRAGMENTS)('$at is exactly $def from the family schema', ({ at, def }) => {
    const path = join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'packages', at);
    expect(existsSync(path), `${at} is missing — run \`node scripts/schema-sync.mjs\``).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')), `${at} drifted from $defs.${def} — run \`node scripts/schema-sync.mjs\``).toEqual(source.$defs[def]);
  });

  it.each(FRAGMENTS)('$at is imported instead of the whole schema', ({ at }) => {
    const [pkg] = at.split('/');
    const host = readFileSync(join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'packages', pkg ?? '', 'src/capability.ts'), 'utf8');
    expect(host, `${pkg} still imports the whole family schema, so its users pay for every host's definitions`).not.toMatch(/from '\.\/schema\.json'/);
  });
});
