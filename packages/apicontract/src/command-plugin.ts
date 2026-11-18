import { resolve } from 'node:path';
/**
 * `apicontract plugin new <name> [--kind generator|extractor|adapter] [--out <dir>]`
 * (apicontract-kit R3): a plugin file, its conformance test and a README, passing the suite as
 * written. `idempotent`, and earned: every file is the user's, so a second run writes nothing and
 * never overwrites a file the user has changed.
 */
import { defineCommand } from 'burgee';

import { writeFiles } from './scaffold-write.js';
import { KINDS, scaffold } from './scaffold.js';

export const command = defineCommand({
  name: 'plugin',
  description: 'Scaffold a plugin that passes the conformance suite as generated',
  arguments: [
    { name: 'action', description: '`new`: scaffold a plugin', choices: ['new'], required: true },
    { name: 'name', description: 'the plugin name: lowercase letters, digits and single dashes', required: true },
  ],
  options: {
    kind: { type: 'string', choices: KINDS, default: 'generator', description: 'what the plugin contributes: spec to code, code to spec, or an input format' },
    out: { type: 'string', placeholder: 'dir', description: 'directory to write into. Defaults to the current directory' },
  },
  effects: 'idempotent',
  examples: [
    { command: 'apicontract plugin new my-target', description: 'a generator plugin, its conformance test and a README' },
    { command: 'apicontract plugin new my-source --kind extractor --out plugins', description: 'an extractor, written under plugins/' },
  ],
  run: async ({ args, options }) => {
    const files = scaffold(args.name, options.kind);
    const written = await writeFiles(resolve(options.out ?? ''), files);
    return { changed: written.written.length > 0, ...written, next: `node --test plugin-${args.name}.test.ts` };
  },
});
