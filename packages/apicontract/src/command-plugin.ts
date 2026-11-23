import { resolve } from 'node:path';
/**
 * `apicontract plugin new <name> [--kind generator|extractor|adapter|rules] [--from <finding.json>] [--out <dir>]`
 * (apicontract-kit R3, apicontract-lint R7): a plugin file, its conformance test and a README,
 * passing the suite as written; `--from` seeds a rule from one finding. `idempotent`, and earned: every file is the user's, so a second run writes nothing and
 * never overwrites a file the user has changed.
 */
import { defineCommand } from 'burgee';

import { UsageError } from './run-config.js';
import { seedOf } from './scaffold-seed.js';
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
    kind: { type: 'string', choices: KINDS, default: 'generator', description: 'what the plugin contributes: spec to code, code to spec, an input format, or lint rules' },
    from: { type: 'string', placeholder: 'finding.json', description: 'with --kind rules: seed the rule from one finding of `apicontract lint --json`' },
    out: { type: 'string', placeholder: 'dir', description: 'directory to write into. Defaults to the current directory' },
  },
  effects: 'idempotent',
  examples: [
    { command: 'apicontract plugin new my-target', description: 'a generator plugin, its conformance test and a README' },
    { command: 'apicontract plugin new my-source --kind extractor --out plugins', description: 'an extractor, written under plugins/' },
    { command: 'apicontract plugin new no-bare-ids --kind rules --from finding.json', description: 'a lint rule that finds the mistake one finding named, with that as its sample' },
  ],
  run: async ({ args, options }) => {
    if (options.from !== undefined && options.kind !== 'rules') throw new UsageError(`--from seeds a rule, and --kind is ${options.kind}. fix: pass --kind rules with --from`);
    // Stryker disable next-line StringLiteral: equivalent, `resolve` reads '' as '.', the folder it is run in
    const files = scaffold(args.name, options.kind, options.from === undefined ? undefined : seedOf(options.from, '.'));
    const written = await writeFiles(resolve(options.out ?? ''), files);
    return { changed: written.written.length > 0, ...written, next: `node --test plugin-${args.name}.test.ts` };
  },
});
