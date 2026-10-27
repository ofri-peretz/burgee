# Intent — caique: prompts that are flags first, and errors when no one is there to answer

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> requirements P1–P2; research §9 (clack). Package **`caique`** — the parrot that always answers
> back. Re-parented 2026-09-08 under [`cli-output-stack`](../cli-output-stack/intent.md) (U6, U11,
> U12): caique **implements** prompts over Node natives; clack and inquirer are migration paths.

**Status:** approved (2026-09-23, under the owner's delegation, D-129) · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Why still `review`:** `packages/caique/src/` is one file exporting a name; nothing of P1–P3 is built.

> **Umbrella sweep 2026-10-26: one of three criteria held. Two are open and need building.**
> No program the benchmark drives is layered on caique, and no prompt is driven through a real
> PTY. See [§ Umbrella sweep 2026-10-26](#umbrella-sweep-2026-10-26).
>
> **Built 2026-10-27, not yet stamped.** R1's `promptFor` is built, the B1 demo is layered on it,
> and a real-terminal Ctrl+C case runs on Linux, macOS and Windows. What is left is a reading and a
> release, not code. See [§ Built 2026-10-27](#built-2026-10-27-what-is-left-is-a-reading-and-a-release).

---

## Umbrella sweep 2026-10-26

Read on `main` at `3d079b15` and against `caique@1.5.1` (`npm view caique version` reads 1.5.1,
the same as the manifest). The children that shipped are `caique-quiet-seam`,
`inquirer-prompts-drop-in` (caique 1.5.0), `frames-fit-the-screen` and `locale-pack-in-five`.
`localised-human-surfaces` (caique's message half) is `approved` and waits on its own scheduled
eval. None of them owns these three criteria, which are caique's own.

| # | criterion | held by | state |
| :-- | :-- | :-- | :-- |
| 1 | the conformance cases: flag given → no prompt; TTY without flag → prompt; non-TTY without flag → `USAGE` with `fix`; `--yes`; `--interactive`; cancel → `CANCELLED` | `packages/caique/src/decide.test.ts`, describe "the whole table" › "every row matches the stated rule", "never prompts without a terminal — the one that would be a bug report" and "never prompts under --json, and never under CI"; "R2 · a value from any source is never prompted for"; "R3 · --yes answers a confirm, and only a confirm"; "R3 · --interactive reaches past …". `packages/caique/src/binding.test.ts` › "reports the option it was cancelled at, and how to avoid the question" (`CANCELLED`) | held |
| 2 | the benchmark's non-TTY task never times out on the layered demo | B1's `non-tty-required` task (`benchmarks/tasks/non-tty-required.json`, 12 turns maximum) passed **355 of 355** runs on the burgee arm over the 71 CI readings from 2026-10-08 to 2026-10-18, at most 5 turns. But that arm is `examples/demo-cli-burgee`, which does not depend on caique: the missing argument is burgee's own P2 refusal, not a caique prompt. R1's `promptFor` / schema `prompt:` binding is not built (`grep -r promptFor packages/*/src` finds nothing), so no demo can be layered on caique | **OPEN** |
| 3 | `Ctrl+C` during a prompt leaves `stdin` out of raw mode on macOS, Linux and Windows, tested with a PTY in CI | the only real-PTY test is `packages/burgee/src/pty-signal.test.ts` (python `pty`, POSIX only, skipped on Windows). It grades burgee's shutdown, not a caique prompt. `packages/caique/src/raw.test.ts` drives a synthetic key stream | **OPEN** |

**What closes it.** Each item is a build, and each needs a caique or burgee release:

1. **R1**: an option's `prompt:` spec resolved through caique in burgee's pre-action (the
   decision table already exists), shipped in a caique and a burgee minor.
2. **The layered demo**: a B1 arm, or the burgee demo, that prompts through R1, then executed weekly
   B1 readings in which `non-tty-required` passes without reaching its turn limit. This is
   measurement-gated, like `b1-mcp-arm`'s four readings.
3. **The PTY case**: a caique prompt run in a real PTY on ubuntu and macOS runners (the
   `pty-signal.test.ts` route) and on Windows through ConPTY, asserting raw mode is off after
   `Ctrl+C`. If Windows has no dependency-free PTY route, that is a restatement, and it needs a
   decision. It is not made here.

Also outstanding, as a design edit with no code: `spec.md` § *Moved here 2026-10-25* asks for a
requirement-keyed evidence table.

## Built 2026-10-27: what is left is a reading and a release

Built in one PR against the sweep's closing list above. The status stays `approved`, because a
criterion is stamped only on what npm serves, and caique's and burgee's release windows reopen on
2026-11-01 (`scripts/release-window.mts`, D-20261026-release-window-holds-code).

| # | criterion | held by, on `main` | still needed |
| :-- | :-- | :-- | :-- |
| 1 | the conformance cases | as in the sweep | nothing: **held** |
| 2 | the benchmark's non-TTY task never times out on the layered demo | `examples/demo-cli-burgee`'s `greet` is `promptFor(defineCommand(…), 'name', …)`, so B1's `non-tty-required` now meets caique's refusal (`<name> is required when there is no terminal`, exit 2), not burgee's. `scripts/prompt-exit-codes.test.ts` › "promptFor on a burgee command (caique R1)" runs that path through the engine; `benchmarks/axes/reliability.ts`'s `greet-missing-arg` cases run the built demo with no terminal | **a reading**: the weekly B1 run on `main` after this merges (`bench.yml`, cron `40 5 * * 2`, first Tuesday 2026-11-03 05:40 UTC) has to pass `non-tty-required` on the burgee arm under its 12-turn limit. No paid run is dispatched for it |
| 3 | `Ctrl+C` during a prompt leaves `stdin` out of raw mode on macOS, Linux and Windows, tested with a PTY in CI | `packages/caique/src/pty-cancel.test.ts` › "R4 · Ctrl+C at a %s prompt on …" — `promptFor`'s own terminal and `caique/clack`'s `text`, on a real terminal (`scripts/pty-host.py`: `pty.fork()` on POSIX, ConPTY through `ctypes` on Windows, D-20261027-caique-pty-windows-conpty), in `compat.yml`'s matrix on all three OSes. It proves the restore through the terminal itself: the second Ctrl+C ends the process only if the first prompt gave the terminal back | a green Windows cell of the matrix on `main`, then the release |

R1 itself — `promptFor` and burgee's deferral of a missing value that declares a `prompt` — ships in
the next caique and burgee minors (`.changeset/caique-prompt-for.md`,
`.changeset/burgee-prompt-binding.md`). The decisions it took are
[D-20261027-caique-prompt-for-r1](../../decisions/D-20261027-caique-prompt-for-r1.md); the
interrupt and restore state machine is [`interrupt.qnt`](./interrupt.qnt), whose first version
found the handler running with stdin still raw.

**Stamp `shipped` when** criterion 2's reading has passed and caique and burgee have published the
minors carrying R1.

## What is wanted

Every interactive question a CLI asks is declared as an option first, so:

- a human without the flag gets a prompt, rendered by caique itself over `node:readline`;
- a human with the flag is never asked (clack #167, `mytool --template this`);
- a non-TTY caller — CI, a pipe, an AI agent — gets a `USAGE` error naming the flag
  and never a hang (clack #533);
- `--interactive` (oclif/oclif #1492) asks for every missing required option in one
  pass; `--yes` accepts every confirmation; cancellation returns `CANCELLED` (E1) and
  `Ctrl+C` restores the terminal (clack #573, #408).

## Why now

- **clack #533 (2026-05) is the single clearest statement of the agent problem in any
  tracker**: "Interactive CLIs … break down in non-TTY environments like CI, and
  increasingly, AI coding agents. The CLI usually hangs forever and just fails."
- **The prompt libraries are converging on the same missing layer.** clack #22
  (hooks), #83 (cancellation API), #39 (go back), #379 (global settings), #345 (style
  representation), #585 (accessible mode: live redraws are re-announced by screen
  readers — and captured verbatim by agents).
- **P1 is also a lint rule** (`no-prompt-without-flag` in `eslint-plugin-cli-floor`); this
  package is the runtime that makes the rule satisfiable.

## Affected users and systems

- `packages/caique`, zero external dependencies (U6); `flagstaff` for its spinner and
  `roundel` for its tokens, both same-repo. `caique/clack` and `caique/inquirer` are façades
  graded by those libraries' own suites (U11), so a migration is one import.
- `@interlace/cli-core/src/prompts/`: the flag↔prompt binding model, host-neutral.
- `commander-schema` gains `prompt: { message, kind }` on an option spec.

## Constraints

1. A prompt cannot exist without an option; the API takes the option name, never a
   bare question.
2. In non-TTY the package never renders a widget at all; the error is produced by the layer
   with `fix: { flag: '--name <value>' }`.
3. Accessible mode (clack #585): when `runtime.env.CLI_ACCESSIBLE` or a screen-reader
   hint is set, prompts fall back to line input with no live redraw.
4. No external UI dependency, ever (U6). clack's and inquirer's APIs exist only as compat
   subpaths over caique's own widgets; an upstream major bump moves a scoreboard row, not a
   dependency.

## Success criteria

- Conformance cases: flag given → no prompt; TTY without flag → prompt; non-TTY without
  flag → `USAGE` with `fix`; `--yes`; `--interactive`; cancel → `CANCELLED`.
- The benchmark's non-TTY task (intent 5) never times out on the layered demo.
- `Ctrl+C` during a prompt leaves `stdin` out of raw mode on macOS, Linux and Windows
  (clack #408), tested with a PTY in CI.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **One of three met.** The status stays `review`:
build is well under way — 129 tests pass across `ask`, `binding`, `decide`, `raw`, `spec` and
`terminal` — but no owner approval is recorded for this intent, so `approved` would invent a
gate that was never passed. That build-ahead-of-gate drift is the one the README's
[Status drift, stated](../README.md#status-drift-stated) section already admits to.

- **The six decision cases — flag given, TTY, non-TTY `USAGE` with `fix`, `--yes`,
  `--interactive`, cancel → `CANCELLED`** — **met.** `src/decide.test.ts` walks the full
  decision table ("every row matches the stated rule", "never prompts without a terminal",
  "never prompts under --json, and never under CI"); `src/binding.ts:105` emits the
  `CANCELLED` envelope with its `fix`, asserted at `src/binding.test.ts:97`.
- **The benchmark's non-TTY task never times out on the layered demo** — not met, and not
  startable: there is no benchmark suite, and no demo CLI is layered on caique.
- **`Ctrl+C` leaves `stdin` out of raw mode on macOS, Linux and Windows, tested with a PTY in
  CI** — **not met.** The assertion exists (`src/raw.test.ts:145`, `rawCalls` reads
  `[true, false]`) but it is driven by a synthetic `KeyStream` fake. There is no PTY and no
  `node-pty` anywhere in the repo, and no OS matrix runs it — `quality-full.yml` and
  `runtime-smoke.yml` are both ubuntu-only. The criterion names three platforms and a PTY; it
  has neither.

caique is the thin leg of the stack. Alone among the four packages it has no Z1 tarball test
(`shape.test.ts`), no weight ratchet (`weight.test.ts`), no subpath-isolation lock, no plugin
host and no `schema.json` — and `cli-output-stack` criteria 1 and 6 and `plugin-contract`
criterion 2 all count it. It is also unpublished: 0.1.0 in the tree, **0.0.1 on npm**, because
`release.yml` fails `npm publish` with `ENEEDAUTH`.

## Open questions

None open. Decided at finalisation (2026-09-06):

- Decided 2026-09-06: **Floor addition P3 is adopted.**
- Decided 2026-09-06: **"Go back a step" is out of scope for v1**; groups are linear.
- Decided 2026-09-06: **`--interactive` prompts for missing required options only; `--interactive=all`
  also prompts optional ones that declare a `prompt`.**
