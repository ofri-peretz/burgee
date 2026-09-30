/**
 * The half of a handler's context that reads the run rather than argv: the environment,
 * `ctx.onExit`, which agent is calling (`ctx.agent`), and whether a person may be asked
 * (`ctx.interactive`, N12, D-20260930-one-interactive-rule).
 *
 * The family has one rule for that last question and roundel owns it: `interactive()` from
 * `roundel/terminal` — a terminal on **stdin**, no `CI`, no agent variable, or `FORCE_TTY=1`
 * over all three. An answer is typed on stdin, so stdin is the stream that says whether one can
 * arrive; a CI job with a pseudo-terminal has one and nobody at it. burgee's own `detectAgent`
 * read stdout and ignored `CI`, so the same shell could be told "ask" by burgee and "refuse" by
 * caique.
 *
 * This is its own chunk, imported on the one path that hands a handler its context (U5):
 * help, `--version`, `--schema`, `--mcp` and every failure never load it or roundel, and the
 * root entry, which denies `roundel` by name (U13), reaches neither. It carries `env` and
 * `onExit` too, so the startup path pays for the call into it and nothing else. What
 * `ctx.agent` names is still `detectAgent`'s, and the output side — whether help is
 * coloured — still reads stdout, in `surfaces.ts`.
 */
import { interactive } from 'roundel/terminal';

import { detectAgent } from './agent.js';
import { type RunContext } from './manifest.js';
import { type Teardown } from './shutdown.js';

/** The slice of the engine's `Io` the context reads. */
export interface RunIo {
  env: Record<string, string | undefined>;
  stdin: NodeJS.ReadableStream;
  teardown: Teardown;
}

/** `ctx.env`, `ctx.onExit`, `ctx.agent` and `ctx.interactive` for one run. */
export const ctxOf = ({ env, stdin, teardown }: RunIo): Pick<RunContext, 'env' | 'onExit' | 'agent' | 'interactive'> => ({
  env,
  onExit: (handler, label) => teardown.add(handler, label),
  ...detectAgent(env, false),
  interactive: interactive({ env, isTTY: { stdin: (stdin as { isTTY?: boolean }).isTTY === true } }),
});
