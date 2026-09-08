# Intent — Serving every caller: humans, agents, CI, screen readers, and the next one

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md)
> and [`cli-output-stack`](../cli-output-stack/intent.md). The engine was designed for agents
> as the primary caller; the stack added modes (U2). This intent makes the set of callers
> explicit and tests every feature against every caller, so no layer can serve one well and
> another by accident.

**Status:** draft · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz

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
- The non-TTY task in the benchmark never times out for any package.
- An accessible-mode transcript of the demo contains zero cursor escapes and at most one
  line per state change, asserted in CI.
- A first adopter's CLI passes the matrix without changes beyond the one-import migration.

## Open questions

- The sixth caller. Candidates: a web terminal (xterm.js in a browser, where TTY is true
  but width and fonts differ) and a chat surface (Slack/Discord bots that wrap CLIs and want
  Markdown). Proposed: record both, build neither until an adopter names one.
