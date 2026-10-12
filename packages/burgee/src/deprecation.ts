/**
 * M5 — a deprecated command says so once per process, on stderr, and still runs: exit OK.
 *
 * Moved out of `execute.ts` on 2026-10-11 to pay for agent-lint-conformance R1–R3 in the core
 * (U5): the warning runs only for a command that is deprecated, so `execute.ts` imports this
 * chunk on that path alone, and the `.` entry carries the call instead of the body. The set of
 * warned commands is module state, so "once per process" still holds across runs.
 */
import { type CommandNode } from './manifest.js';

const warned = new Set<string>();

/** `quiet` is the caller's `--quiet` (agent-lint-conformance R2): a framework hint is decoration, and it silences it. */
export function warnDeprecated(node: CommandNode, io: { err: { write: (s: string) => unknown } }, quiet?: boolean): void {
  const key = node.path.join(' ');
  if (quiet === true || warned.has(key)) return;
  warned.add(key);
  const typed = node.path.slice(1).join(' ') || key;
  const use = typeof node.deprecated === 'string' ? `, use '${node.deprecated}'` : '';
  io.err.write(`warning: '${typed}' is deprecated${use}\n`);
}
