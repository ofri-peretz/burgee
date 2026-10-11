/**
 * What the engine adds to the root's help, beyond the rows the program declares: the `completion`
 * command it serves (agent-lint-conformance R5), the exit-code contract (R4) and, when the root
 * declares no examples of its own, one example per top-level command (R6).
 *
 * All three are handed to `help.ts` rather than computed there, the way `listed` already is: the
 * `./help` door renders what it is given and has no bytes to spare for these words (its budget
 * in `weight.test.ts`). The completion node and the exit codes are rows of the command list, each
 * carrying its own `group`, which is the one thing `help.ts` reads off a row it does not find in
 * the manifest. Read from `surfaces.ts` and `schema-surface.ts`, both lazy, so a run that prints
 * no help and no schema loads none of it.
 */
import { ExitCode } from './exit-code.js';
import { type CommandNode, type Example, type Manifest } from './manifest.js';

/**
 * R4 — what each code asks of the caller. Keyed by `ExitCode`'s own names and typed as a
 * `Record` over them, so a code added to the contract without a line here is a compile error,
 * and the section is generated from the contract rather than typed beside it.
 */
export const EXIT_ADVICE: Readonly<Record<keyof typeof ExitCode, string>> = {
  OK: 'the command completed',
  RUNTIME: 'it ran and failed; read the message',
  USAGE: 'bad arguments or an unknown command; rewrite the command',
  CONFIG: 'the config or environment did not load; fix it, not the command',
  CANCELLED: 'cancelled, or a decision is needed; decide, then run a next command',
  AUTH: 'a credential is missing or refused; log in and run it again',
  TIMEOUT: 'the --timeout deadline passed; run it again with more time',
  SIGINT: 'interrupted; stop',
};

/** R4 — the contract as rows under `Exit codes:`, in `ExitCode`'s order: the code, its name, the advice. */
export const exitRows = (root: readonly string[]): CommandNode[] =>
  Object.entries(ExitCode).map(([name, code]) => ({
    path: [...root, String(code)],
    summary: `${name.toLowerCase()}: ${EXIT_ADVICE[name as keyof typeof ExitCode]}`,
    group: 'Exit codes:',
    options: {},
  }));

/**
 * R5 — the `completion` command the engine synthesises (D2), as a node, so root help can list it
 * and `--schema` can publish it beside the commands the program declares. It was served and never
 * named. `undefined` when the program declares its own, which wins, the way `serve` stands aside.
 * The shells are written out; `help-snapshot.test.ts` holds them equal to `SHELLS`.
 */
export function completionNode(manifest: Manifest): CommandNode | undefined {
  const path = [...manifest.rootPath, 'completion'];
  if (manifest.find(path) !== undefined) return undefined;
  return {
    path,
    description: 'Print a shell completion script: bash, zsh, fish, pwsh or fig',
    effects: 'read_only',
    arguments: [{ name: 'shell', description: 'bash, zsh, fish, pwsh or fig', required: true }],
    examples: [{ command: `${manifest.rootPath.join(' ')} completion bash` }],
    options: {},
  };
}

/**
 * R6 — the root's examples: its own, or, when it declares none, the first example of each
 * top-level command, from that command or the first one below it that has one, in declaration
 * order. A reader of the root screen is choosing a command, and one runnable line per command is
 * the shortest answer to "what does a call look like".
 */
export function rootExamples(manifest: Manifest, node: CommandNode): Example[] {
  if ((node.examples?.length ?? 0) > 0) return node.examples as Example[];
  const depth = node.path.length;
  const seen = new Set<string>();
  const out: Example[] = [];
  for (const c of manifest.commands) {
    const top = c.path.slice(0, depth + 1);
    const key = top.join(' ');
    const first = c.examples?.[0];
    if (first === undefined || c.path.length <= depth || seen.has(key) || c.hidden === true || manifest.find(top)?.hidden === true) continue;
    seen.add(key);
    out.push(first);
  }
  return out;
}
