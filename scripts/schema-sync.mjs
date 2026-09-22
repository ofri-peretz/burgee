#!/usr/bin/env node
/**
 * Copy the plugin schema from its source package into every other package that hosts
 * plugins, so `plugin-schema-lock.test.ts` can assert the copies are byte-identical.
 *
 * The source is flagstaff's: it is where the schema was written and where every `$defs`
 * entry is exercised by a suite. A host is found by looking — a package hosts plugins when
 * `src/plugin.ts` exists — so a new host is synced the moment it is created.
 *
 * `--check` reports what would change and exits non-zero, for a hook that wants to ask
 * rather than act. With no flag it writes.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packages = join(root, 'packages');
const SOURCE = join(packages, 'flagstaff/src/schema.json');
const check = process.argv.includes('--check');

const hosts = readdirSync(packages, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(packages, e.name, 'src/plugin.ts')))
  .map((e) => join(packages, e.name, 'src/schema.json'))
  .filter((target) => target !== SOURCE);

const source = readFileSync(SOURCE);
let stale = 0;
for (const target of hosts) {
  const current = existsSync(target) ? readFileSync(target) : undefined;
  if (current !== undefined && current.equals(source)) continue;
  stale += 1;
  const rel = target.slice(root.length);
  if (check) process.stdout.write(`stale: ${rel}\n`);
  else {
    copyFileSync(SOURCE, target);
    process.stdout.write(`synced: ${rel}\n`);
  }
}

/**
 * Fragments: what a host validates against at runtime, written on its own — one `$defs` entry,
 * or a host's slice of the whole: the top-level keys it reads and the definitions they name.
 *
 * The published `schema.json` stays one byte-identical file — that is the contract, and a plugin
 * author validates against all of it. But a host that *imports* the schema to validate pulls every
 * host's definitions into its users' bundles, and D-108 measured what that costs: making
 * `linegauge` the ninth host grew paratext's default import by **1,343 bytes** for a definition
 * paratext never reads, and paratext only ever read one — `$defs.capability`, 2,121 of the
 * schema's 8,141 minified bytes. So a host names the definition it validates against here, gets
 * exactly that, and ships the whole contract as data it does not import. flagstaff took a slice
 * on 2026-09-23, when the schema grew to describe all nine hosts: it was the one host importing
 * the whole file, so every host's definitions were landing in its users' bundles.
 *
 * Generated rather than hand-copied, and `plugin-schema-lock.test.ts` asserts each fragment
 * deep-equals its definition in the source, so a fragment can go stale in neither direction.
 */
const FRAGMENTS = [
  { target: 'paratext/src/capability.schema.json', def: 'capability' },
  // A host fragment: the top-level keys the host reads and the definitions they reference, so
  // flagstaff validates its own contributions without carrying seven other hosts' definitions.
  { target: 'flagstaff/src/plugin.schema.json', keys: ['name', 'contract', 'tokens', 'glyphs', 'spinners', 'borders', 'components'], defs: ['spinner', 'component', 'border'] },
];
const family = JSON.parse(source.toString('utf8'));
/** The document a fragment entry describes — one definition, or a host's slice of the whole. */
const fragmentOf = (entry) =>
  entry.def !== undefined
    ? family.$defs[entry.def]
    : {
        type: family.type,
        required: family.required,
        additionalProperties: family.additionalProperties,
        properties: Object.fromEntries(entry.keys.map((k) => [k, family.properties[k]])),
        $defs: Object.fromEntries(entry.defs.map((d) => [d, family.$defs[d]])),
      };
for (const entry of FRAGMENTS) {
  const { target } = entry;
  const want = `${JSON.stringify(fragmentOf(entry), null, 2)}\n`;
  const at = join(packages, target);
  const current = existsSync(at) ? readFileSync(at, 'utf8') : undefined;
  if (current === want) continue;
  stale += 1;
  if (check) process.stdout.write(`stale: packages/${target}\n`);
  else {
    writeFileSync(at, want);
    process.stdout.write(`synced: packages/${target}\n`);
  }
}

if (stale === 0) process.stdout.write(`schema: ${hosts.length + 1} host(s) and ${FRAGMENTS.length} fragment(s) in sync\n`);
process.exit(check && stale > 0 ? 1 : 0);
