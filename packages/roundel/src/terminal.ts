/**
 * Two questions about the terminal that are not colour, and that three packages in the family
 * were each answering by hand (R12).
 *
 *   - **Is anybody there to type?** `caique/decide` asked `isTTY.stdin && !CI` and missed the
 *     agent case entirely: under Claude Code a prompt has a terminal and no person, and a
 *     prompt that waits there hangs the agent that ran it. burgee's own `detectAgent` knew
 *     that; caique did not ask it.
 *   - **Can it draw a tick?** `flagstaff/ora` carried is-unicode-supported whole, and
 *     `caique/inquirer` a four-condition subset that answered differently on the Linux console
 *     and on half the Windows terminals the full table names.
 *
 * Both read a runtime passed in, never the process (R9), and neither reaches another module,
 * so `roundel/terminal` costs only itself. It is its own subpath rather than more of
 * `roundel/policy` because `./chalk` stands on `policy.js` and R8 caps that whole graph at
 * chalk 6.0.0's own bytes, with 7 of them to spare.
 */

/** The slice of a runtime `interactive` reads. burgee's and caique's runtimes both satisfy it. */
export interface Terminal {
  env: Record<string, string | undefined>;
  isTTY: { stdin: boolean };
}

/** The slice `unicode` reads: the environment and the platform, `process.platform`'s spelling. */
export interface Glyphs {
  env: Record<string, string | undefined>;
  platform?: string;
}

/**
 * The variables whose presence says an agent is driving the process — the list
 * `burgee/src/agent.ts` probes (N12), after `@vercel/detect-agent`. `AI_AGENT` is the generic
 * one any agent can set.
 *
 * A variable joins only when it **uniquely** identifies an agent: the agent sets it, and no
 * terminal a person types in does. `CURSOR_TRACE_ID` fails that — Cursor sets it in every
 * integrated terminal — and taking it would stop every person in Cursor from being asked
 * anything (D-20260930-one-interactive-rule). This is the family's one rule for "may a person
 * be asked?": burgee's `ctx.interactive` and caique's prompts both call `interactive` below.
 */
export const AGENTS = ['AI_AGENT', 'CLAUDECODE', 'CURSOR_AGENT', 'CODEX_THREAD_ID', 'GEMINI_CLI'] as const;

/** Present and not empty — the NO_COLOR convention, as `policy.ts` applies it. */
const set = (value: string | undefined): boolean => value !== undefined && value !== '';

/**
 * Whether a person can be asked something and be expected to answer.
 *
 * `FORCE_TTY=1` says yes outright, as it does to burgee's `detectAgent`: it is the one
 * explicit instruction, and a caller who pipes answers into a prompt on purpose sets it.
 * Otherwise it takes a terminal on stdin, no `CI`, and no agent variable. An agent may well
 * have a terminal; what it does not have is a person.
 */
export const interactive = ({ env, isTTY }: Terminal): boolean =>
  env['FORCE_TTY'] === '1' || (isTTY.stdin && !set(env['CI']) && !AGENTS.some((name) => set(env[name])));

/**
 * Whether the terminal can be expected to draw non-ASCII glyphs — is-unicode-supported 2.1.0,
 * condition for condition. Everything but Windows is yes, except the Linux console
 * (`TERM=linux`), whose font has no ticks; on Windows only the terminals the incumbent names.
 *
 * This is the one place roundel reads `TERM_PROGRAM` and the platform. The refusal in the
 * spec is about *colour* — the level is decided by the user's instruction and `TERM`, never an
 * emulator allow-list — and a glyph table is not a colour level.
 */
export function unicode({ env, platform }: Glyphs): boolean {
  const { TERM, TERM_PROGRAM } = env;
  if (platform !== 'win32') return TERM !== 'linux';
  return (
    set(env['WT_SESSION']) ||
    set(env['TERMINUS_SUBLIME']) ||
    env['ConEmuTask'] === '{cmd::Cmder}' ||
    TERM_PROGRAM === 'Terminus-Sublime' ||
    TERM_PROGRAM === 'vscode' ||
    TERM === 'xterm-256color' ||
    TERM === 'alacritty' ||
    TERM === 'rxvt-unicode' ||
    TERM === 'rxvt-unicode-256color' ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm'
  );
}
