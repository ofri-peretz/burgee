# Intent — `truepass`: a test suite cannot be made green by making it say less

> Opened 2026-11-23. First drafted as `test-integrity` in the eslint monorepo (eslint#1662); the
> owner moved it here and named it the same day.
> Where it lives and why: [`D-20261123-truemark-lives-in-burgee`](../../decisions/D-20261123-truemark-lives-in-burgee.md).

**Status:** review · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz`

---

## What is wanted

The verification station "tests still test what they tested" as deterministic checks, so a model
never has to judge it:

- **Lint rules** (`truepass/eslint`), on what a test file says:
  `no-focused-test` (`.only`, `fit`, `fdescribe`), `no-unexplained-skip` (a skip with no
  `reason:` comment or issue link), `no-fixed-sleep` (`setTimeout`/`sleep` waits in a test),
  `no-test-retry` (`retry` options and `jest.retryTimes`).
- **Changed-lines checks** (`truepass diff`), on what a change did: an `expect(x)` moved to a
  weaker matcher on the same subject, and a snapshot file changed with no `Snapshot: <why>` line
  in the range's commit messages. An `Assertion: <why>` line accepts a deliberate weakening.

## Why now

Agents make red suites green. The cheapest ways are `.only`, a skip, a retry, a longer sleep, a
looser matcher or `-u` on snapshots; each passes CI and each removes a claim the suite made. A
lint rule can see the first four; only the diff can see the last two.

## Affected users and systems

A new public package `packages/truepass`; each Interlace repo's lint config and `pre-push` once
adopted (through `hookset`).

## Constraints

- Reads only changed lines and commit messages, never whole files, so the diff check is fast and
  hands a model nothing to read.
- Every finding names the fix in the message (`issue: description. fix: …`).
- `eslint` is an optional peer; the CLI needs only git.
- The CLI is a burgee program: `--json`, `--schema` and exit codes come from `defineCommand`.

## Success criteria

- Each rule and each diff check fails on a planted case and passes on its fix, in the package
  tests (100% coverage).
- `truepass diff` runs on this repo's `pre-push` against `origin/main` with zero findings on a
  clean branch.
- Adopted in the eslint monorepo's test files at `warn` with no new noise, then at `error`.

## Defaults taken

Each is a default, not a decision; overturning one in review is a new decision file.

- `MATCHER_RANK` ranks six matchers (`toBe`, `toStrictEqual`, `toEqual`, `toMatchObject`,
  `toBeTruthy`, `toBeDefined`); others are ignored until a missed weakening shows one is needed.
- The package lands private and goes public in its own change, before the next release.
