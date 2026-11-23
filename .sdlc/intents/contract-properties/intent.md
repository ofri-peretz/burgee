# Intent — `contract-properties`: property-based tests generated from the contract, with no server running

> Opened 2026-11-23 from the verification gap analysis
> ([doc](https://claude.ai/artifact/BCjCqoaRfDvtQeha24HrNi)). The post this follows names
> property-based tests as the tests an agent cannot game, because their inputs come from a
> different bias than the code. The owner's direction the same day: Interlace OSS is the toolkit
> for every verification station, and every product CLI is a burgee program. This is the
> "contract property tests" station. Working name.

**Status:** review · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz`

---

## What is wanted

`apicontract props <contract>` (the subcommand follows apicontract's name when it changes) turns
the contract model into fast-check arbitraries and runs four properties against the code
apicontract generates, with no server:

- **Round-trip.** Every generated value decodes and re-encodes to the same value through the
  generated codec.
- **Validator agrees with the schema.** Every generated value passes the generated validator, and
  every value from a mutated arbitrary (one constraint broken) fails it with the right pointer.
- **Diff soundness.** When `diff` says a change is compatible for callers, every request valid
  under the old contract is valid under the new one, and every response valid under the new one
  is valid under the old. A counterexample is a classifier bug, shown as the smallest failing value.
- **Idempotent normalisation.** Normalising a contract twice gives the same model as once.

It also writes the arbitraries as a file a consumer's own tests can import, so a team gets
property tests for its handlers from the same contract.

## Why now

- apicontract's own comparison table marks "Fuzz / property-based tests" as `—`, not planned
  (`.sdlc/intents/contractdiff/comparison.md`, the testing table). Schemathesis is the one
  incumbent with it, and it needs a running server.
- fast-check is used in 5 files across this repository (`grep -rl fast-check --include=*.ts packages scripts`
  without `node_modules`, 2026-11-23), none of them in apicontract, whose classifier is the code
  that most needs inputs nobody chose.
- `apicontract-diff` already uses `compat.qnt` as a spec oracle; diff soundness is the same claim
  checked on generated data instead of on the model.

## Affected users and systems

`packages/contractdiff` (a `props` command and an arbitraries generator); consumer test suites that
import the generated arbitraries.

## Constraints

- No running server, ever; the static design is apicontract's position against Schemathesis.
- fast-check is a dependency of the generated test file only, never of apicontract's runtime.
- Seeds are printed and replayable; a failure names the smallest counterexample.
- A keyword the generator cannot produce values for is reported, never silently skipped.

## Success criteria

- All four properties run at 1,000 cases each on every contract in the corpus lane's pinned set.
- At least one planted classifier bug (a breaking change classified compatible) is caught by diff
  soundness, red before the fix and green after.
- The generated arbitraries cover every JSON Schema keyword the validator supports, listed in a
  coverage table with the command that produced it.
- **End state (the owner, 2026-11-23: every concept to its strongest form):** diff soundness runs
  on every PR that touches the classifier, and every published Interlace package with a contract
  imports its generated arbitraries in at least one test.

## Defaults taken

Each is a default, not a decision; overturning one in review is a new decision file.

- It lives in apicontract as a command, not as a separate package.
- 1,000 cases per property per run; the weekly lane raises it to 100,000.
