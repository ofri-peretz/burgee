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
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
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

if (stale === 0) process.stdout.write(`schema: ${hosts.length + 1} host(s) in sync\n`);
process.exit(check && stale > 0 ? 1 : 0);
