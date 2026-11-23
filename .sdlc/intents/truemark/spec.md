# Design — `truemark`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** `truemark/eslint` exports `plugin`, `rules` and `configs` (`recommended` at `error`,
  `adoption` at `warn`), built from `rules` so a new rule cannot miss a preset.
- **R2** `no-focused-test` reports `.only`, `fit` and `fdescribe`; `no-unexplained-skip` reports
  `.skip`, `.todo`, `xit` and a constant `skipIf` with no `reason:` comment or issue link;
  `no-fixed-sleep` reports `setTimeout` promises, `sleep(n)` and `waitForTimeout`;
  `no-test-retry` reports `retry` / `retries` in tests and runner configs and `jest.retryTimes`.
- **R3** A call counts as a test only when its root is a test-runner name that is an unbound
  global or is imported from a test-runner module, so an app's own `only()` is not reported.
- **R4** `truemark diff [--base <ref>]` reads `git diff <base>...HEAD` changed lines and the
  range's commit messages only, and reports an `expect(x)` moved to a weaker matcher on the same
  subject (`MATCHER_RANK`) and a `__snapshots__` / `.snap` file changed with no `Snapshot: <why>`
  line. An `Assertion: <why>` line accepts a deliberate weakening. A deleted file is not read.
- **R5** Every finding is `issue: … fix: …`; findings exit 1, an unreadable base is a usage error
  naming the fetch to run.
- **R6** The CLI is a burgee program (`--json`, `--schema`, `--mcp` from `defineProgram`), and git
  is spawned through bellpull. `eslint` is an optional peer: `truemark/eslint` imports its types
  only, and the CLI needs only git.

## Design

- One package, two entries: `truemark/eslint` for what a file says, `truemark` (bin and `.`) for
  what a change did. The four rules share `rule.ts` (`defineRule`, `message`) and `test-api.ts`
  (which calls are tests).
- `checks.ts` is pure: it parses a unified diff and returns findings, so the tests feed it
  fixtures. `check.ts` wires it to `git.ts`; `cli.ts` takes a `Git` so the CLI tests run without
  a repository.
- Adoption goes through `hookset`: `truemark diff` as a `pre-push` step, the plugin at
  `adoption` until a repo's warnings reach zero, then `recommended`.

## Verification

- `packages/truemark/src/*.test.ts`: each rule's planted case and its fix, the matcher ranking,
  snapshot and assertion acceptance lines, deleted files, and the CLI over a fake git, at 100%
  coverage.
- `npm run mutation:changed`: zero survivors on the package.
- The root locks (`package-shape`, `independence-install`, `readme-quick-start`) install and run
  it alone from its tarball.

## Rejected alternatives

- **An `eslint-plugin-test-integrity` in the eslint monorepo** (eslint#1662's first draft). The
  diff check is a CLI and not a rule, and the owner placed every verification tool's CLI on
  burgee (`D-20261123-truemark-lives-in-burgee`).
- **Reading whole test files in the diff check.** Slower, and it hands a model more to read than
  the changed lines; the two diff checks need only the lines and the messages.
- **A severity knob per matcher.** `MATCHER_RANK` is one ordering; a weakening is either accepted
  in the commit message or reported.

## Out of scope

- Coverage drops, which a coverage tool already gates.
- Mutation score, which is oxmutate's.
