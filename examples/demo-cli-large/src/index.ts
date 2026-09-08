/**
 * The large demo (cli-modularity): 30 commands across 5 groups, shared options declared
 * once, three handlers loaded lazily, one deprecated command, and a plugin contributing
 * two more. The manifest is complete from the declarations here; no handler module is
 * imported until its command is dispatched (M2), which `loads()` lets a test prove.
 */
import { defineCommand, definePlugin, defineProgram, sharedOptions, type AnyCommand } from 'burgee';

/** M4: declared once, spread into each command that takes them, never global. */
const common = sharedOptions('common', {
  verbose: { type: 'boolean', description: 'say more' },
  dryRun: { type: 'boolean', description: 'show what would happen' },
});

const GROUPS = ['Repository:', 'Packages:', 'Environments:', 'Reports:', 'Maintenance:'] as const;
/** Two groups of six and three of five: 27 eager commands, plus three lazy ones, make the thirty. */
const LARGER_GROUPS = 2;
const PER_LARGER_GROUP = 6;
const PER_GROUP = 5;
/** The command name is the heading's first four letters: `repo-1`, `pack-1`. */
const STEM = 4;

/** 27 eagerly declared commands, five to six per group, each with the shared set and one of its own. */
function eager(): AnyCommand[] {
  const out: AnyCommand[] = [];
  for (const [g, group] of GROUPS.entries()) {
    const perGroup = g < LARGER_GROUPS ? PER_LARGER_GROUP : PER_GROUP;
    for (let i = 0; i < perGroup; i++) {
      const name = `${group.slice(0, -1).toLowerCase().slice(0, STEM)}-${i + 1}`;
      out.push(
        defineCommand({
          name,
          description: `${group.slice(0, -1)} command ${i + 1}`,
          group,
          effects: 'read_only',
          options: { ...common, limit: { type: 'number', description: 'how many', default: 10 } },
          run: ({ options }) => ({ command: name, limit: options.limit, verbose: options.verbose === true }),
        }),
      );
    }
  }
  return out;
}

/** M2: three commands whose handlers load on dispatch; everything help and --schema need is declared here. */
const lazy: AnyCommand[] = [
  defineCommand({
    name: 'inspect',
    description: 'Inspect a target',
    group: 'Reports:',
    effects: 'read_only',
    arguments: [{ name: 'target', description: 'what to inspect', required: true }],
    options: common,
    load: () => import('./cmds/inspect.js'),
  }),
  defineCommand({
    name: 'sync',
    description: 'Synchronise a target',
    group: 'Maintenance:',
    effects: 'idempotent',
    arguments: [{ name: 'target', required: true }],
    options: common,
    load: () => import('./cmds/sync.js'),
  }),
  defineCommand({
    name: 'purge',
    description: 'Purge a target',
    group: 'Maintenance:',
    effects: 'non_idempotent',
    arguments: [{ name: 'target', required: true }],
    options: common,
    load: () => import('./cmds/purge.js'),
  }),
];

/** M5: the old name still works, warns once, and names its replacement in help and schema. */
const deprecated = defineCommand({
  name: 'clean',
  description: 'Remove build output',
  group: 'Maintenance:',
  effects: 'idempotent',
  deprecated: 'purge',
  run: () => ({ changed: false }),
});

/** M3: what a plugin contributes is declared, and attributed in the manifest by its name. */
export const auditPlugin = definePlugin({
  name: 'audit',
  commands: [
    { path: ['large', 'audit'], description: 'Audit the tree', group: 'Reports:', effects: 'read_only', options: {}, run: () => ({ findings: 0 }) },
    { path: ['large', 'audit-fix'], description: 'Audit and fix', group: 'Reports:', effects: 'idempotent', options: {}, run: () => ({ changed: false }) },
  ],
});

export const program = defineProgram({
  name: 'large',
  version: '1.0.0',
  description: 'The 30-command demo',
  commands: [...eager(), ...lazy, deprecated],
});
program.use(auditPlugin);

export { loads, reset } from './cmds/loads.js';
