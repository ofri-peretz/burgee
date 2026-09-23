# Launch kit — drafts, not posts

> For [roadmap](./marketing-and-docs.md) Phase 3. **A human posts these**; nothing here
> is sent by automation. Every number is copied from the README's "Measured" and
> "Compatibility" sections on the day of writing (2026-09-22) — re-check each against the
> README on the day you post, and drop any that moved. Landscape framing only: no "beats",
> "kills", "wins".

## The lines every post is built from

- **Pitch.** Everything a CLI needs that isn't your CLI. Written once, served to humans and
  agents alike.
- **Hook.** Change one import — `commander` → `burgee/commander` — and the same program
  gains `--json`, `--schema`, an MCP server and shell completions.
- **Proof.** `burgee/commander` passes 1360 / 1360 of commander's own test suite;
  `burgee/yargs` passes 804 / 804 of yargs'.
- **Honesty.** Nine size and speed gates are public: five met, three not, one never
  measured. The README says which.
- **Weight.** Zero runtime dependencies across nine packages. Against commander **plus** the
  config, exit-hook and cursor-restore packages a user adds to match it, `burgee/commander` is
  0.468× the bundle; against commander alone it is 1.514× — both rows are published.

## Show HN

**Title:** Show HN: Burgee – a drop-in commander/yargs replacement that serves CLIs to agents

**Body:**

> I kept writing CLIs that an AI agent would then drive by scraping `--help`. burgee is a CLI
> framework where a command is declared once, and help, `--json`, a versioned JSON Schema, an
> MCP server and completions are all projections of that declaration.
>
> It is drop-in: change `import { Command } from 'commander'` to `'burgee/commander'` (or
> `yargs` to `burgee/yargs`). The compatibility is graded by running the incumbents' own test
> suites against it — 1360/1360 for commander, 804/804 for yargs.
>
> What it costs, stated plainly: against commander alone the bundle is 1.51× larger; against
> commander plus what you'd install to match burgee (config loading, exit hooks, cursor
> restore) it is 0.47×. Of nine public gates, five are met, three are not, and the agent
> benchmark has not run yet — the README lists all nine.
>
> Nine packages, zero runtime dependencies, MIT. Docs: https://burgee.interlace.tools
> Repo: https://github.com/ofri-peretz/burgee

## r/node

**Title:** I built a commander-compatible CLI framework where `--json` and an MCP server come
free — graded against commander's own tests (1360/1360)

**Body:** the Show HN body, plus a closing question: *"If you maintain a commander or yargs
CLI and would try the one-import migration, what would stop you?"* The answers feed the
[first-adopter](../intents/first-adopter/spec.md) intent.

## X / Bluesky thread

1. Your CLI has a second user now: an AI agent, reading `--help` and guessing. burgee
   declares a command once and serves it as help, `--json`, JSON Schema, MCP and
   completions. 🧵
2. It's drop-in. `commander` → `burgee/commander`. Graded with commander's own test suite:
   1360/1360. yargs: 804/804.
3. What it costs, published: 1.51× commander's bundle alone, 0.47× commander plus what you'd
   add to match it. Five of nine public gates met, three not, one unmeasured.
4. Nine zero-dependency packages — colour, render loop, prompts that never hang in CI,
   config precedence, subprocess, shutdown, text width, terminal OSC. Docs:
   https://burgee.interlace.tools

## LinkedIn

> Most CLIs now have two kinds of user: people, and the agents people point at them. The
> agent reads help text meant for a human and guesses. burgee is an open-source Node CLI
> framework where a command is declared once and served both ways — help for people, a
> JSON envelope, schema and MCP server for agents. It's a drop-in for commander and yargs,
> graded against their own test suites, and it publishes the benchmarks it doesn't pass
> alongside the ones it does. https://burgee.interlace.tools

## Before posting

- [ ] Phase 0 exited: npm READMEs updated, docs live with package pages.
- [ ] Tutorial 3.1 published; the posts link to it as well as the repo.
- [ ] Every number above re-read from the README on the day.
- [ ] Someone free for the first two hours to answer comments.
