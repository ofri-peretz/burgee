/**
 * What a failure teaches: the failing command's own usage, so the next step is in the refusal
 * rather than one `--help` away (E3, D-20260930-failures-teach-recovery).
 *
 * Reached only from `failure.js` and `surfaces.js`, both loaded on the paths that print them, so
 * a run that succeeds never loads a byte of this. It is a reminder and not a help screen (E2):
 * one usage line and at most `ROWS` rows, with the command that lists the rest when some were
 * left out.
 */
import { widest, width } from 'linegauge';

import { type ArgumentSpec, type CommandNode, type Manifest, type OptionSpec } from './manifest.js';
import { flagsOf, kebab } from './names.js';

/** Rows listed before pointing at `--help`: enough for most commands, bounded for every one. */
const ROWS = 8;

export interface UsageRow {
  /** `--code <value>`, `-n, --name <value>`, or a command word. */
  name: string;
  description: string;
}

/** The envelope's `error.usage`, and what the prose renders. */
export interface Usage {
  /** The command line from the program name: `demo greet [options] <name>`. */
  command: string;
  /** A runnable command's options, as typed. */
  options?: UsageRow[];
  /** A group's commands, for a word it does not know. */
  commands?: UsageRow[];
  /** The command that lists every row, present only when some were left out. */
  more?: string;
}

const argumentTerm = (a: ArgumentSpec): string => {
  const name = a.variadic === true ? `${a.name}...` : a.name;
  return a.required === false ? `[${name}]` : `<${name}>`;
};

function optionRow(name: string, spec: OptionSpec): UsageRow {
  const short = spec.short === undefined ? '' : `-${spec.short}, `;
  const fallback = spec.type === 'number' ? 'n' : 'value';
  const value = spec.type === 'boolean' ? '' : ` <${spec.placeholder ?? fallback}>`;
  const notes = [
    spec.description ?? '',
    spec.required === true ? '(required)' : '',
    spec.default === undefined ? '' : `(default: ${String(spec.default)})`,
    spec.choices === undefined ? '' : `(one of: ${spec.choices.join(', ')})`,
    spec.dependsOn === undefined || spec.dependsOn.length === 0 ? '' : `(requires ${flagsOf(spec.dependsOn).join(', ')})`,
    spec.exclusive === undefined || spec.exclusive.length === 0 ? '' : `(conflicts with ${flagsOf(spec.exclusive).join(', ')})`,
    spec.env === undefined ? '' : `[env: ${spec.env}]`,
  ];
  return { name: `${short}--${kebab(name)}${value}`, description: notes.filter((n) => n !== '').join(' ') };
}

function bounded(usage: Usage, key: 'options' | 'commands', rows: UsageRow[], more: string): Usage {
  if (rows.length === 0) return usage;
  return { ...usage, [key]: rows.slice(0, ROWS), ...(rows.length > ROWS ? { more } : {}) };
}

/** A runnable command's usage line and its visible options. */
export function commandUsage(node: CommandNode): Usage {
  const at = node.path.join(' ');
  const rows = Object.entries(node.options)
    .filter(([, spec]) => spec.hidden !== true)
    .map(([name, spec]) => optionRow(name, spec));
  const command = [at, ...(rows.length > 0 ? ['[options]'] : []), ...(node.arguments ?? []).map(argumentTerm)].join(' ');
  return bounded({ command }, 'options', rows, `${at} --help`);
}

/** The visible commands one level below `node`, in declaration order. */
export const childrenOf = (manifest: Manifest, node: CommandNode): CommandNode[] =>
  manifest.commands.filter((c) => c.hidden !== true && c.path.length === node.path.length + 1 && node.path.every((seg, i) => c.path[i] === seg));

/** Whether `c` is `group` or sits anywhere below it. */
const within = (c: CommandNode, group: CommandNode): boolean => group.path.length <= c.path.length && group.path.every((seg, i) => c.path[i] === seg);

/** Every visible command that runs, at any depth below `node`, in declaration order; a hidden group hides what it holds. */
export const runnableBelow = (manifest: Manifest, node: CommandNode): CommandNode[] =>
  manifest.commands.filter(
    (c) => c.run !== undefined && c.path.length > node.path.length && within(c, node) && !manifest.commands.some((g) => g.hidden === true && g.path.length > node.path.length && within(c, g)),
  );

/** A command as typed from `from`, with what it takes: `config get <key>`. */
export const signature = (c: CommandNode, from: CommandNode): string => [...c.path.slice(from.path.length), ...(c.arguments ?? []).map(argumentTerm)].join(' ');

/**
 * A group's usage line and its commands, each with what it takes.
 *
 * When every command that runs below the group fits in the rows, those are the rows —
 * `config get <key>`, not `config` — so the line to run is in the refusal. B1's agents ran
 * `config user.name` after a list that said only `config` in 15 of the 40 runs of the two tasks
 * that read config, each a turn spent learning that the word was `get <key>`. A tree too large
 * for the rows lists its own level, as before.
 */
export function groupUsage(manifest: Manifest, node: CommandNode): Usage {
  const at = node.path.join(' ');
  const below = runnableBelow(manifest, node);
  const rows = (below.length <= ROWS ? below : childrenOf(manifest, node)).map((c) => ({ name: signature(c, node), description: c.summary ?? c.description ?? '' }));
  return bounded({ command: `${at} <command>` }, 'commands', rows, `${at} --help`);
}

/** The prose: `usage:`, then the rows under their heading, then where the rest are. */
export function usageText(usage: Usage): string {
  const rows = usage.options ?? usage.commands ?? [];
  const column = widest(rows.map((r) => r.name));
  const body = rows.map((r) => `  ${r.description === '' ? r.name : `${r.name}${' '.repeat(column - width(r.name))}  ${r.description}`}\n`).join('');
  const label = usage.options === undefined ? 'commands:\n' : 'options:\n';
  const heading = rows.length === 0 ? '' : label;
  return `usage: ${usage.command}\n${heading}${body}${usage.more === undefined ? '' : `  … the rest: ${usage.more}\n`}`;
}
