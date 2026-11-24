/**
 * contractdiff's commands, declared once so burgee projects each to `--json`, `--schema`, `--mcp`,
 * completions and `--skill`. Phase 0: every command is declared with its final name and effects
 * and fails with a `fix:` line naming the phase that delivers it (roadmap.md), until it lands. `gen`
 * and `extract` come first because they are the product: spec to code, and code to spec.
 */
import { readFileSync } from 'node:fs';

import { defineCommand, defineProgram, type Effects } from 'burgee';

import { commands } from './commands.js';
import { extractCommand, genCommand } from './run-command.js';

/** The published version, read from the manifest beside dist/ so `--version` cannot drift from npm. */
export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const planned = (name: string, description: string, phase: string, effects: Effects = 'read_only') =>
  defineCommand({
    name,
    description,
    effects,
    run: () => {
      throw new Error(`\`contractdiff ${name}\` is not implemented yet. fix: it lands in ${phase} (.sdlc/intents/contractdiff/roadmap.md)`);
    },
  });

/** `<what went wrong>. fix: <what to do>`, the shape of every refusal here, with one fix in it. */
const ONE_FIX = /^(?<what>[\s\S]+?)\. fix: (?<fix>[\s\S]+)$/u;

/** The codes burgee reads off a thrown value by name, and renders with the value's own `fix`. */
const NAMED = new Set(['USAGE', 'CONFIG', 'CANCELLED', 'AUTH', 'TIMEOUT']);

/**
 * A refusal at exit 1 with its fix: burgee reads the code off the class, as it does a `defineError`
 * class's, and then the instance's `fix`. A plain `Error` is exit 1 too, but burgee reads no `fix` off it.
 */
export class Refusal extends Error {
  readonly fix: string;

  constructor(message: string, fix: string, cause: unknown) {
    super(message, { cause });
    this.name = 'Refusal';
    this.fix = fix;
  }
}
// burgee's `ExitCode.RUNTIME`, the code a plain Error leaves with; written as the number so loading
// this module reads nothing off burgee.
Object.defineProperty(Refusal, Symbol.for('burgee.exitCode'), { value: 1 });

/**
 * A refusal whose message ends in its one `fix:` line, as burgee's own error and fix: the message
 * before it, and the fix beside it, which burgee prints as its own `fix:` line (and `error.fix`
 * under `--json`). Without one burgee finds no fix and teaches with the command's usage block, so a
 * refusal that already said what to do printed the whole options table after it. A message with
 * several fixes (a config's problems, one per line) is left whole.
 */
export const carryFix = (error: unknown): unknown => {
  if (!(error instanceof Error) || 'fix' in error || error.message.split(' fix: ').length !== 2) return error;
  const groups = ONE_FIX.exec(error.message)?.groups;
  if (groups === undefined) return error;
  const { what, fix } = groups as { what: string; fix: string };
  if (!NAMED.has(String((error as { code?: unknown }).code))) return new Refusal(what, fix, error);
  error.message = what;
  return Object.assign(error, { fix });
};

/** The command, its refusals carrying their fix (`carryFix`). */
export const carryingFix = <C extends { readonly run?: ((context: never) => unknown) | undefined }>(command: C): C => {
  const { run } = command;
  if (run === undefined) return command;
  // `then` runs `run` inside the promise, so a refusal it throws at once is carried too.
  const wrapped = async (context: never): Promise<unknown> =>
    Promise.resolve()
      .then(() => run(context))
      .catch(async (error: unknown) => Promise.reject(carryFix(error) as Error));
  return { ...command, run: wrapped };
};

export const program = defineProgram({
  name: 'contractdiff',
  version: VERSION,
  description: 'Turn your specs into code and your code into specs, through plugins',
  commands: [
    // The two that write files (run-command.ts). The same input writes the same output, so a rerun is safe.
    genCommand,
    extractCommand,
    // One `command-<name>.ts` per command, each owned by its lane (.sdlc/LANES.md).
    ...commands,
    planned('check', 'Call sites in the code that disagree with the contract, found statically', 'Phase 7'),
  ].map(carryingFix),
});
