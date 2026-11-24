/**
 * The burgee declarations for `gen` and `extract`, the two commands that write files. Both are
 * `idempotent`: the same inputs write the same bytes, so a rerun is safe (R-A1). Every flag is a
 * burgee option, so it appears in `--help`, `--schema` and `--mcp` with no code.
 */
import { defineCommand } from 'burgee';

import { builtins } from './plugins.js';
import { extract } from './run-extract.js';
import { gen } from './run-gen.js';

/**
 * The extractors contractdiff ships, read from the built-in plugins so `--help` names only what
 * runs: the NestJS, Hono and tRPC extractors are planned (apicontract-extract) and not built yet.
 */
export const BUILTIN_EXTRACTORS = builtins.flatMap((plugin) => Object.keys(plugin.extractors ?? {}));

const writing = {
  check: { type: 'boolean', description: 'write nothing; exit 1 and list the files that are stale' },
  dryRun: { type: 'boolean', description: 'write nothing; print the diff a run would write' },
  force: { type: 'boolean', description: 'overwrite a generated file that was edited by hand' },
  config: { type: 'string', description: 'the config file (default: contractdiff.config.json, .mjs or .ts in this folder)', placeholder: 'path' },
} as const;

/**
 * The folder the user ran the command in, as a path every `node:path` `resolve` turns into the
 * working directory. The process itself is named only by the program's bin (process-reference lock).
 */
// Stryker disable next-line StringLiteral: equivalent, `resolve('', name)` and `resolve('.', name)` are both the working directory
const HERE = '.';

export const genCommand = defineCommand({
  name: 'gen',
  description: 'Code from a spec, one plugin per target: TypeScript types, validators, NestJS modules',
  effects: 'idempotent',
  options: {
    ...writing,
    target: { type: 'string', multiple: true, description: 'run only this target (repeatable)', placeholder: 'name' },
  },
  run: async ({ options }) =>
    gen({ cwd: HERE, config: options.config, targets: options.target, check: options.check, dryRun: options.dryRun, force: options.force }),
});

export const extractCommand = defineCommand({
  name: 'extract',
  description: 'A spec from your code, one plugin per source: Standard Schema exports (Zod 4, Valibot, ArkType, truefit), ts-rest contracts, routes declared with schemas',
  effects: 'idempotent',
  options: {
    ...writing,
    from: { type: 'string', description: `the extractor to run: ${BUILTIN_EXTRACTORS.join(', ')}, or a plugin's (default: \`extract.from\` in the config)`, placeholder: 'extractor' },
    out: { type: 'string', description: 'the spec file to write (default: spec.json)', placeholder: 'file' },
  },
  run: async ({ options }) =>
    extract({ cwd: HERE, config: options.config, from: options.from, out: options.out, check: options.check, dryRun: options.dryRun, force: options.force }),
});
