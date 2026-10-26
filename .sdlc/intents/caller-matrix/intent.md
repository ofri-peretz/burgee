# Intent — Serving every caller: humans, agents, CI, screen readers, and the next one

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md)
> and [`cli-output-stack`](../cli-output-stack/intent.md). The engine was designed for agents
> as the primary caller; the stack added modes (U2). This intent makes the set of callers
> explicit and tests every feature against every caller, so no layer can serve one well and
> another by accident.

**Status:** shipped · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-26 on the merge of `test/caller-matrix-and-umbrella`, the five `missing` cells held by new tests and the ceiling at 0; tests only, nothing to publish — see [§ Shipped 2026-10-26](#shipped-2026-10-26)

> **Accepted at the Design→Build gate 2026-10-25** by the coordinator under the owner's delegation
> ([`D-20261025-caller-matrix-design-accepted`](../../decisions/D-20261025-caller-matrix-design-accepted.md)): the first design, a declared features × callers registry over tests that exist. See
> [`spec.md` § Design gate 2026-10-25](./spec.md#design-gate-2026-10-25).
>
> **Built 2026-10-25 (batch 29):** the registry, its lock and `/docs/callers` landed on `main` with
> 43 cells held, 7 n/a and 5 missing. See [`spec.md` § Status 2026-10-25](./spec.md#status-2026-10-25).
> **2026-10-26:** the five are held and the ceiling is 0 ([§ Shipped 2026-10-26](#shipped-2026-10-26)).

---

## What is wanted

Five callers, first-class in every layer, with one conformance matrix:

| Caller | How it arrives | What it needs | Mode (U2) |
| :-- | :-- | :-- | :-- |
| **human at a terminal** | TTY, colour, width | help that reads, prompts that ask, animation that informs | `tty` |
| **AI agent** | pipe or `--json`, often `--schema`/`--mcp` | one stable envelope, no redraws, errors with `fix`, never a hang | `json`, `pipe` |
| **CI / a script** | pipe, `CI=1` | plain text, exit codes, no prompts | `ci` |
| **screen reader** | TTY plus `CLI_ACCESSIBLE` | no live redraw, numbered choices, one announcement per change | `accessible` |
| **another program** | `--mcp`, completions, `--schema`, Fig | a machine contract, versioned | `json` |

The matrix is *features × callers*: every capability of every package (help, errors,
prompts, spinner, progress, table, box, theme, plugins, completions, MCP) has one
conformance case per caller, and a cell that is "n/a" says why. Today's conformance suite in
`examples/` covers the engine for two callers; this extends it to four packages and five.

## Why now

- The stack introduced the five modes (U2) as a policy function. A policy nobody tests per
  feature decays into "works on my terminal".
- The two callers we did not design for — CI and screen readers — are where the incumbents
  fail loudest (clack #533 hangs in CI; clack #585 and #510 re-announce every redraw), and
  they are the cheapest cells to make green because the static projection (U3) already
  serves both.
- Agents are now the majority caller of many CLIs and they *read the same bytes a screen
  reader hears*. Serving one is serving the other; the matrix makes that a test.

## Affected users and systems

- `examples/conformance/`: gains a caller dimension; the runner produces a matrix page.
- `apps/docs`: a generated `/callers` page — the matrix, green/red/n-a, per package.
- `cli-benchmarks`: B1 (agent cost) gains a per-caller run; a screen-reader run is
  simulated by asserting the accessible transcript has no cursor ops and one line per change.
- `eslint-plugin-cli-floor`: rules cite the caller they protect (`no-prompt-without-flag` →
  agent, CI; `no-console-in-action` → agent).

## Constraints

1. A caller is defined by observable inputs (TTY-ness, env, flags), never by guessing the
   process tree or user agent.
2. A feature may be n/a for a caller (a spinner for a screen reader) but never *worse* for a
   caller than its static projection; n/a cells render the projection.
3. The matrix is generated from the conformance runner, never hand-edited.
4. Screen-reader claims are limited to what a transcript can assert until a real assistive
   technology run exists; that run is its own intent.

## Success criteria

- The matrix page exists, generated, with every cell green or n/a-with-reason.
  **2026-10-25: half.** The page is generated (`npm run callers:page`, drift-checked in
  `quality.yml`) and locked (`scripts/callers-lock.test.ts`). 5 of 55 cells are `missing`, under a
  ceiling of 5 that may only fall.
  **2026-10-26: held.** 48 cells held and 7 n/a with a reason, 0 missing; the ceiling is 0.
- The non-TTY task in the benchmark never times out for any package. **Restated 2026-10-25**
  ([D-20261025-caller-matrix-design-accepted](../../decisions/D-20261025-caller-matrix-design-accepted.md)):
  the `agent` and `ci` cells of `prompts`, held by `scripts/prompt-exit-codes.test.ts`, with B1's
  `non-tty-required` task. **Held.**
- An accessible-mode transcript of the demo contains zero cursor escapes and at most one
  line per state change, asserted in CI. **Restated 2026-10-25:** held per package, as the
  `accessible` cells of `spinner` and `prompts`: `packages/flagstaff/src/loop.test.ts` ›
  "%s: the static projection once per state change, no repaint" and
  `packages/caique/src/ask.test.ts` › "writes no escape sequence and no carriage return — it is
  the accessible mode". **Held.**
- A first adopter's CLI passes the matrix without changes beyond the one-import migration.
  **Moved 2026-10-25** to `first-adopter`, which owns adoption.

## Shipped 2026-10-26

**All four criteria are held or moved, and nothing is left to publish: the five new checks are
tests, and no package source changed.** The registry's ceiling fell from 5 to 0
(`scripts/callers-lock.test.ts` › "has no more missing cells than the ceiling, 0, which only
falls"), and `/docs/callers` was regenerated: **48 held · 7 n/a · 0 missing**.

| cell | check | proven red by |
| :-- | :-- | :-- |
| errors × accessible | `packages/burgee/src/json-failure.test.ts` › "$name: under CLI_ACCESSIBLE at a colour terminal, stderr is the labelled prose once, with no escape and no JSON" | a scratch edit of `failure.ts` writing the structured line at a terminal too (4 of 4 red), and one dropping the `fix:` line (the auth case red) |
| prompts × program | `scripts/prompt-exit-codes.test.ts` › "under --mcp, a question is a tool error naming the flag, and the server answers the next call" | `resolvePrompts` returning no failure (caique `binding.ts`): the call succeeded |
| spinner, table, box × program | `scripts/components-under-mcp.test.ts` › "$name: the transport carries only JSON-RPC, the envelope leads, and the drawing follows as its static projection" — a command served over `--mcp` hoists the component to `process.stdout`, which is the transport | `holdStdout` in burgee's `mcp.ts` passing writes through: the drawing landed on the transport (3 of 3 red); flagstaff's loop forced to the terminal projection: escapes in the result (3 of 3 red) |

The ceiling at 0 was proven red by marking the three component cells `missing` again (`expected 3
to be less than or equal to 0`).

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Zero of four met.** `draft` is the honest
status and it is already what this file says — the only intent in the output-stack group whose
recorded status needed no correction.

- **The matrix page, generated, every cell green or n/a-with-reason** — not met.
  `https://burgee.interlace.tools/callers` returns 404; `apps/docs/content/docs/` holds nine
  pages and none is a caller matrix; `scripts/` has `compat-page.ts` and `gallery-page.ts` and
  no matrix generator; `examples/conformance/` has no caller dimension.
- **The non-TTY benchmark task never times out for any package** — not met; no benchmark suite
  exists anywhere in the repo.
- **An accessible transcript with zero cursor escapes and one line per state change, in CI** —
  not met as written, because no demo carries the output stack. The assertion exists per
  package: `packages/flagstaff/src/loop.test.ts:115` over pipe/ci/json/accessible, and
  `packages/caique/src/ask.test.ts:109` for the numbered-list select. Both run in
  `quality-full.yml`, which skips draft PRs without `run-full-ci`.
- **A first adopter's CLI passes the matrix on the one-import migration** — not met twice over:
  there is no matrix, and `first-adopter` has no adopter.

## Open questions

- The sixth caller. **Decided 2026-09-20 → D-068.** Candidates: a web terminal (xterm.js in a browser, where TTY is true
  but width and fonts differ) and a chat surface (Slack/Discord bots that wrap CLIs and want
  Markdown). Proposed: record both, build neither until an adopter names one.
