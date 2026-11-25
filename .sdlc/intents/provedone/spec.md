# Design — `provedone`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** `provedone intent new <slug>` copies `.sdlc/intents/_template/{intent,spec}.md`, fills
  the date and owner, and refuses an existing slug.
- **R2** `provedone intent check` enforces the rules of `scripts/intent-artifacts-lock.test.ts`
  (headings, statuses, `spec.md` for `approved`/`shipped`, index status agreement) so other repos
  get them without copying the test.
- **R3** For each `shipped` intent, `intent check --evidence` parses the evidence table
  (`| Criterion | Command… | Output |`), re-runs each row whose command is a plain shell command,
  and fails when the exit code differs or the recorded output no longer appears. Rows it cannot
  run are listed as `not re-run`, never as passing. A row whose command filters tests by name
  (`-t`, `--testNamePattern`, `--test-name-pattern`, `--grep`) must record an `N passed` code
  span, or `intent check` reports `filter-count`: a filter that matches nothing exits 0.
- **R4** `provedone stamp` writes a receipt: commands with exit codes and output digests, app
  captures by path, and a required `not checked:` list (may be `nothing`). It prints the
  `Verified-by:` trailer and a PR-body block.
- **R5** `provedone gate --mode off|observe|enforce` checks a commit message or PR body for a
  receipt or an explained `Verified-by: none (<reason>)`. `observe` exits 0 and appends to a log.
- **R6** In `enforce`, after two blocks in one session (keyed by a session id from the
  environment, else the branch), the next run passes and logs the bypass.
- **R7** Every failure message carries a `fix:` line, in the format burgee's own CLI output uses.
- **R8** `--json` on every command; exit codes 0 pass, 1 fail, 2 usage.
- **R9** `provedone done <slug>` maps each success criterion to a command and to an evidence row
  produced on this branch; fails listing each criterion with neither, with a `fix:` naming the
  command to run. `stamp` renders the PR's `Checked:` line from the same rows, including the
  stations not run.

## Design

- A burgee CLI (dogfood): `defineCommand` for each subcommand, so `--json`, `--schema` and MCP come
  free and agents can call it as a tool.
- Intent parsing is a small Markdown reader over headings and pipe tables; no remark dependency.
- The receipt format is one JSON schema, rendered to the trailer and the PR block. The schema is
  checked by `validator`.
- Consumers: a `commit-msg` lefthook step, and a reusable `workflow_call` workflow that runs
  `provedone gate` on the PR body.
- Order: R1–R2 (port the lock), then R4–R5 in `observe` on this repo, then R3, then R6 and
  `enforce` by decision.

## Verification

- `packages/provedone/src/*.test.ts`, run by `npm test`. R2 is proven by running it against this
  repo's `.sdlc/intents` and matching the lock's verdict on a fixture copy with one planted defect
  per rule.
- R3 is proven red then green: a fixture intent whose evidence command is changed to fail.
- oxmutate on `packages/provedone/src` through `mutation:changed`, like every package.

## Rejected alternatives

- **Only a PR template line.** A line nobody checks drifts; the post's point is that the stamp is
  queryable, including `none`.
- **Requiring `/verify` in the session transcript, as the post's gate does.** Transcripts are
  not in the repo or CI; a receipt in the commit is.
- **Building on danger.js.** It reads PR bodies but knows nothing about intents or commits, and
  adds a runtime dependency to every consumer.

## Out of scope

- Running the app or taking screenshots. That is each repo's `verify` skill; provedone records
  what it produced.
- Judging whether the checks were good enough. That is `replz`.
