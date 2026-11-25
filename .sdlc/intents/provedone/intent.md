# Intent — `provedone`: every change says how it was verified, and a gate reads it

> Opened 2026-11-23 from the verification gap analysis
> ([doc](https://claude.ai/artifact/BCjCqoaRfDvtQeha24HrNi)), which maps the concepts in
> [How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/)
> (2026-11-16) onto this repo, eslint, interlace and agents. Working name, like `apicontract`.
> Where it lives: [`D-20261123-verification-tools-live-in-burgee`](../../decisions/D-20261123-verification-tools-live-in-burgee.md).

**Status:** review · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz`

---

## What is wanted

A tool any repository installs from npm that closes the loop between "what done means" and "what
was actually checked":

- **Done first.** `provedone intent new <slug>` writes the intent and spec skeletons this
  directory already uses; `provedone intent check` validates them, and for every `shipped` intent
  re-runs the commands in its evidence table and fails when one no longer produces its recorded
  result.
- **A receipt per change.** `provedone stamp` records what ran (command, exit code, a short
  output digest), what was tried in the running app (screenshots or terminal captures by path),
  and an explicit `not checked:` list. It writes a `Verified-by:` commit trailer, whose value may
  be `none` so unverified commits are queryable, and the matching "How this was checked" block for
  the PR body.
- **A "done" check.** `provedone done <slug>` fails unless every success criterion of the intent
  a PR cites has a command and a fresh evidence row from this branch. This is the "Checked:" line
  generated, not typed: `stamp` writes it from the same data.
- **One gate with three modes.** `off`, `observe` (log what would have been blocked) and
  `enforce`. In `enforce` a commit or PR with no receipt fails, unless its message says why it was
  not verified. After two blocks in one session the next commit passes, logged, so an agent is
  never stuck.

## Why now

- 25 of the 80 `shipped` intents carry no `## Shipped` or `## Restated` section
  (`grep -l '^\*\*Status:\*\* shipped' .sdlc/intents/*/intent.md | xargs grep -L '^## Shipped\|^## Restated' | wc -l`,
  read 2026-11-23). Their evidence may live under another heading; no check can tell, because
  `intent-artifacts-lock.test.ts` reads headings and statuses, never evidence.
- None of the six repos in Interlace OSS records how a change was verified. burgee's PR template
  asks for a test file name; eslint's has generic boxes; interlace and agents have no template; no
  CI job reads a PR body.
- The post's commit stamp, observe-then-enforce gate and escape hatch have no open source
  implementation that we know of. `evidence-claims-check.mjs` in the agents repo checks product
  claims, not changes.

## Affected users and systems

A new private package `packages/provedone`; `.github/PULL_REQUEST_TEMPLATE.md`; `lefthook.yml`
(a `commit-msg` step in observe mode); a reusable workflow for consumer repos. Later consumers:
eslint, interlace, serverless, agents, blog.

## Constraints

- Reads this repo's existing intent format as is. No migration of the 115 intents.
- A gate starts in `observe` and moves to `enforce` only by a decision file, after it has run on
  real PRs (the control-bands warm-up rule).
- Never blocks without a written way through: the message must say what to do or why it is safe.
- No network calls during `stamp` or `check`; screenshots are paths, never uploads.
- Stays `private` until its success criteria are read, like `apicontract` and `validator`.

## Success criteria

- `provedone intent check` on this repo lists every `shipped` intent with no evidence, and re-runs
  every evidence command that is a plain shell command; zero false failures on `main`.
- Every PR merged in burgee for 14 days after the observe step carries a receipt or a `none`
  with a reason; the observe log shows the false-block rate before `enforce` is proposed.
- `git log --format='%(trailers:key=Verified-by)'` answers "which commits were never verified"
  for every commit after adoption.
- One other Interlace repo adopts it through the reusable workflow with a diff under 20 lines.
- **End state (the owner, 2026-11-23: every concept to its strongest form):** the gate is in
  `enforce` in all eight Interlace repos; 100% of commits carry a `Verified-by:` trailer and every
  `none` carries a reason; every source PR cites an intent; zero stale evidence rows on `main`.
  Promotion from `observe` needs a false-block rate under 2% over 14 days, recorded in a decision.

## Defaults taken

Each is a default, not a decision; overturning one in review is a new decision file.

- The package keeps the working name `provedone` until it publishes.
- The receipt lives in the commit trailer and the PR body only, not as a file under `.sdlc/`.
- `intent check --evidence` runs weekly (Sunday, `.github/workflows/intent-evidence.yml`), not on
  every push, and fails when it re-runs nothing.
