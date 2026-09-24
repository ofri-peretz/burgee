#!/usr/bin/env node
/**
 * Copy `src/schema.json` into `dist/` for a package that ships the schema but does not
 * import it.
 *
 * flagstaff's build needs none of this: `plugin.ts` imports the schema and validates
 * against it, so tsc emits the JSON as part of the module graph. roundel publishes the same
 * file as the contract a plugin author reads and validates structurally in code, so nothing
 * imports it and nothing would copy it. Run from the package directory, after tsc.
 */
import { copyFileSync } from 'node:fs';
import process from 'node:process';

// Copy and handle the failure, rather than checking first: between an existsSync and a
// copy the file can go, and the check buys nothing the catch does not.
// `program-schema.json` too: burgee publishes the shape of its own `--schema` document beside
// the plugin schema (F1, D-123), and nothing imports that file either.
for (const file of ['schema.json', 'program-schema.json']) {
  try {
    copyFileSync(`src/${file}`, `dist/${file}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (file === 'schema.json') process.stdout.write('no src/schema.json — nothing to copy\n');
  }
}
