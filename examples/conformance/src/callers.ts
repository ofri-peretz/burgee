/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The caller matrix — features × callers, as data (`.sdlc/intents/caller-matrix/`, R1–R2).
 *
 * PRINCIPLES 5: every feature has a conformance case per caller. Most cells were already held by
 * a test somewhere in the packages; what was missing is the one place that says which test holds
 * which cell, and which cells nothing holds. This file is that place. It points at tests and
 * never restates them.
 *
 * A cell is one of three things:
 *   - `{ test, name }` — a test file and the title of a test in it (a parameterised title by its
 *     template, `%s` or `$name` left in). `scripts/callers-lock.test.ts` reads the file and fails
 *     when the title is not there, so renaming a test is a red build, not a silent hole.
 *   - `{ na }` — the feature does not apply to that caller, and why. What the caller gets is the
 *     static projection (intent constraint 2).
 *   - `{ missing: true }` — nothing holds it yet. Counted, published, and ratcheted down: the
 *     lock pins the count, and the count may only fall.
 *
 * The page `/docs/callers` is generated from this object by `scripts/callers-page.ts`.
 */

/**
 * A caller is defined by observable inputs only — TTY-ness, environment, flags — never by
 * guessing the process tree (intent constraint 1). The modes are roundel's policy
 * (`roundel/policy`'s `outputMode`, and `roundel/terminal` for agent detection, N12).
 *
 * Two more callers are recorded and not built (D-068): a web terminal (xterm.js: a TTY whose
 * width and fonts differ) and a chat surface (a bot wrapping a CLI, wanting Markdown). Neither
 * has a column until an adopter names one.
 */
export const CALLERS = {
  tty: { who: 'a person at a terminal', inputs: 'stdout is a TTY, no agent variable, no CI', mode: 'tty' },
  agent: { who: 'an AI agent', inputs: 'a pipe, `--json`, or an agent variable (CLAUDECODE, AI_AGENT, …) even on a TTY', mode: 'json · pipe' },
  ci: { who: 'CI or a script', inputs: 'a pipe, or `CI` set', mode: 'ci' },
  accessible: { who: 'a screen reader', inputs: 'a TTY with `CLI_ACCESSIBLE` set', mode: 'accessible' },
  program: { who: 'another program', inputs: '`--schema`, `--mcp`, a completion script, the Fig spec', mode: 'json' },
} as const;

export type Caller = keyof typeof CALLERS;

/** The features, in the order the page lists them. Each names the package that serves it. */
export const FEATURES = {
  help: 'burgee',
  errors: 'burgee',
  prompts: 'caique',
  spinner: 'flagstaff',
  progress: 'flagstaff',
  table: 'flagstaff',
  box: 'flagstaff',
  theme: 'roundel',
  plugins: 'burgee · flagstaff',
  completions: 'burgee',
  mcp: 'burgee',
} as const;

export type Feature = keyof typeof FEATURES;

export type Cell = { readonly test: string; readonly name: string } | { readonly na: string } | { readonly missing: true };

/**
 * flagstaff draws every component through one loop (`hoist`), and the loop is where a mode is
 * decided: `loop.test.ts` drives one component through all five. So for the hoisted components
 * (spinner, progress, table, box) the `agent` and `accessible` cells cite the loop's own
 * parameterised cases, and the `tty` and `ci` cells cite the component's.
 */
const LOOP = 'packages/flagstaff/src/loop.test.ts';
const LOOP_JSON = { test: LOOP, name: 'json: one NDJSON event per transition on stderr, stdout untouched' } as const;
const LOOP_STATIC = { test: LOOP, name: '%s: the static projection once per state change, no repaint' } as const;
const BUILTINS = 'packages/flagstaff/src/builtins.test.ts';
const BUILTIN_ON_A_PIPE = { test: BUILTINS, name: '%s writes no carriage return and no escape on a pipe' } as const;
const FLAGSTAFF_CHECK = { test: 'packages/flagstaff/src/cli.test.ts', name: 'prints the plugin in all five modes side by side and exits 0' } as const;

const NOT_A_SHELL_FEATURE = 'a completion script is what a shell sources; this caller runs commands, and reads `--schema` for what they take';
const NOT_AN_MCP_CLIENT = '`--mcp` speaks JSON-RPC on stdio to an MCP client; this caller is not one, and runs the same commands directly';

export const MATRIX: { readonly [F in Feature]: { readonly [C in Caller]: Cell } } = {
  help: {
    tty: { test: 'packages/burgee/src/help.test.ts', name: 'takes its width from the injected stdout when it has columns (H3)' },
    agent: { test: 'packages/burgee/src/color.test.ts', name: 'a detected agent reads plain help even on a terminal, as it reads non-interactive (N12)' },
    ci: { test: 'packages/burgee/src/color.test.ts', name: 'is styled on a terminal, and only there' },
    accessible: { test: 'packages/burgee/src/color.test.ts', name: 'is plain under CLI_ACCESSIBLE, as every accessible surface is' },
    program: { test: 'packages/burgee/src/help-json.test.ts', name: 'is the same shape as `--schema`, scoped to one command' },
  },
  errors: {
    tty: { test: 'packages/burgee/src/json-failure.test.ts', name: '$name: at a terminal, stderr is the prose alone — no JSON (R6)' },
    agent: { test: 'packages/burgee/src/json-failure.test.ts', name: '$name: the envelope is on stdout, alone, and stderr is the one structured line (R6)' },
    ci: { test: 'packages/burgee/src/json-failure.test.ts', name: '$name: plain mode keeps its prose on stderr, nothing on stdout, and the structured line last when stderr is piped (R6)' },
    accessible: { missing: true },
    program: { test: 'packages/burgee/src/json-failure.test.ts', name: '$name: isError with the envelope as the text, then answers the next call' },
  },
  prompts: {
    tty: { test: 'packages/caique/src/shape.test.ts', name: 'on a terminal, the same call is a prompt' },
    // The intent's non-TTY criterion is these two cells (spec R5), with B1's `non-tty-required` task.
    agent: { test: 'scripts/prompt-exit-codes.test.ts', name: 'carries the code into the JSON envelope an agent reads' },
    ci: { test: 'scripts/prompt-exit-codes.test.ts', name: 'a question nobody can answer — no TTY — exits 2, naming the flag to pass instead' },
    // The intent's accessible-transcript criterion is this cell and spinner's (spec R5).
    accessible: { test: 'packages/caique/src/ask.test.ts', name: 'writes no escape sequence and no carriage return — it is the accessible mode' },
    program: { missing: true },
  },
  spinner: {
    tty: { test: 'packages/flagstaff/src/spinner.test.ts', name: 'hoisted on a terminal with a manual clock, the frames are exact' },
    agent: LOOP_JSON,
    ci: { test: 'packages/flagstaff/src/ora.test.ts', name: 'under CI the same, even when the stream claims to be a terminal' },
    accessible: LOOP_STATIC,
    program: { missing: true },
  },
  progress: {
    tty: { test: BUILTINS, name: 'the drawn bar is exactly the width it was given' },
    agent: LOOP_JSON,
    ci: BUILTIN_ON_A_PIPE,
    accessible: LOOP_STATIC,
    program: { test: 'packages/flagstaff/src/progress.test.ts', name: 'sends done, total and the static line through ctx.progress, and draws nothing in either projection' },
  },
  table: {
    tty: { test: BUILTINS, name: 'draws a grid whose every row is the same measured width' },
    agent: { test: BUILTINS, name: 'the component emits header-and-value pairs off a terminal, not the grid' },
    ci: BUILTIN_ON_A_PIPE,
    accessible: LOOP_STATIC,
    program: { missing: true },
  },
  box: {
    tty: { test: BUILTINS, name: 'draws the border it was asked for, at the width it was given' },
    agent: LOOP_JSON,
    ci: { test: BUILTINS, name: 'the component says the text off a terminal, and draws only on one' },
    accessible: LOOP_STATIC,
    program: { missing: true },
  },
  theme: {
    tty: { test: 'packages/roundel/src/theme.test.ts', name: 'degrades to the nearest readable of 256 at level 2' },
    agent: { test: 'packages/roundel/src/theme.test.ts', name: 'flies at level 0 when the run was asked for --json' },
    ci: { test: 'packages/roundel/src/policy.test.ts', name: 'an empty CI with no vendor is the table’s floor, not the terminal’s level' },
    accessible: { test: 'packages/roundel/src/policy.test.ts', name: 'defaults to 0 on the most colour-capable terminal there is' },
    program: { na: '`--schema` and `--mcp` carry data, never styled text: the json row of the colour policy (level 0) is what they get' },
  },
  plugins: {
    tty: FLAGSTAFF_CHECK,
    agent: FLAGSTAFF_CHECK,
    ci: FLAGSTAFF_CHECK,
    accessible: FLAGSTAFF_CHECK,
    program: { test: 'packages/burgee/src/schema-fields.test.ts', name: 'names the plugin that contributed it' },
  },
  completions: {
    tty: { test: 'packages/burgee/src/mcp.test.ts', name: 'the Fig spec and the shell completions still offer it, because a person is not an agent' },
    agent: { na: NOT_A_SHELL_FEATURE },
    ci: { na: NOT_A_SHELL_FEATURE },
    accessible: { na: 'the candidate list is drawn by the shell, not by the program; the script hands it plain words, one per line' },
    program: { test: 'packages/burgee/src/completions.test.ts', name: '%s script is deterministic and mentions every visible command and option' },
  },
  mcp: {
    tty: { na: NOT_AN_MCP_CLIENT },
    agent: { test: 'packages/burgee/src/mcp.test.ts', name: 'lists exactly the commands the author did not withhold, generated from the manifest (N1, N2, N6)' },
    ci: { na: NOT_AN_MCP_CLIENT },
    accessible: { na: NOT_AN_MCP_CLIENT },
    program: { test: 'packages/burgee/src/mcp.test.ts', name: 'completes the handshake and names the program (N1)' },
  },
};
