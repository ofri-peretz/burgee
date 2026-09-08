# Design — `compat-oracle`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | Requirement |
| :-- | :-- |
| C1 | Every published package declares its supported host range, and the compatibility page names the **majors graded**: the host's current major first (suite at the latest release tag), earlier majors only once their own suite is vendored at its last tag and graded — a major is never listed on the strength of the next one's suite |
| C2 | A compat front-end is graded by the host's own suite through a one-line shim; the pass rate is emitted as JSON and published per release |
| C3 | Every package is tested on every Node LTS inside its `engines` range, on Linux, macOS and Windows |
| C4 | Every intentional divergence from a host has an id, a written reason, and a test asserting the divergence — an unlisted failure is a bug, a listed one is a documented difference |
| C5 | Pass rates ratchet: a PR that lowers one fails CI unless it also edits the baseline file with a reason |
| C6 | Each vendored suite is pinned to a host's npm **release** (version, tag, commit) and fingerprinted in a compatibility record — a hash per test file, the test names per file, the names on the API surface. A daily job diffs the latest release against the record and opens one issue per release naming exactly the tests and surface names that appeared, vanished or changed; a weekly job re-vendors at the new tag and opens the PR carrying the same diff |
| R1 | `npm run compat` runs both hosts and exits non-zero on a regression, in under 60s |
| R4 | The compatibility record (`vendor/<host>/.source.json`) is written by the vendor step and the diff between two records is computed (`diffRecords`), never described by hand; `npm run compat -- --upstream` produces it without touching `vendor/` |
| R2 | The import rewrite is a scripted transform, re-runnable from a clean upstream checkout, never a hand edit |
| R3 | **No upstream file is excluded.** Every file is vendored and run; files that import only the host's internal modules are graded on a separate, informational *internals* line, recorded by name in `.source.json`. Passing them would mean copying the host's file layout, so they never enter the gate — but they are never hidden either |

## Design

```
packages/compat-oracle/
  vendor/
    commander/            # upstream tests, unmodified except the scripted rewrite
      .source.json        # { repo, commit, date, testCount }
      tests/*.test.js
    yargs/
      .source.json
      test/*.cjs
  src/
    shim.ts               # resolves the implementation under grade
    rewrite.ts            # the scripted specifier transform (R2)
    run.ts                # runs a host, parses node:test / mocha output, emits JSON
    report.ts             # table + ratchet comparison against the baseline
  excluded.json           # the 9 internals files, each with a reason (R3)
  baseline.json           # per-host { tests, passed, rate }
```

The shim is the whole trick. commander's tests import `from '../index.js'`; the
rewrite points that at `shim.js`, and the shim re-exports whichever implementation the
`COMPAT_TARGET` env var names:

```ts
// shim.ts — the single swap point
const target = process.env.COMPAT_TARGET ?? 'commander';
export * from target;
```

Grading real commander is the control (rule 4: the check must be proven against a known
state). Grading `commander-compat` later is the same command with one env var changed.

yargs differs in runner (mocha, `.cjs`) and is handled by a second adapter in `run.ts`
with the same output shape. Its suite is vendored the same way.

**Order of work.** Vendor commander first and prove 1,210/1,215 — that is the whole
mechanism, demonstrated. Then the ratchet and the JSON emit. Then yargs. Then the Node
matrix (C3) in `quality-full.yml`. Then the docs page. yargs before the matrix, because
a second host is what proves the runner abstraction is not commander-shaped.

**Node compatibility (C3)** is a matrix over `engines`, not a claim. Today every package
declares `node: ">=24"`, so the matrix is Node 24 and Node 26 across three OSes. When a
package widens its range the matrix widens with it, because the job reads `engines` from
each `package.json` rather than a hard-coded list.

**Divergences (C4).** A front-end that intentionally differs registers the id in
`excluded.json` alongside a test in our own suite asserting the *new* behaviour. The
docs page renders that file, so the differences list is generated, never hand-maintained
— which is what stops it drifting the way every hand-written compatibility table does.

## Verification

`npm run compat` is the loop. It exits non-zero when a rate drops below baseline.

Proven-red requirement, per CLAUDE.md rule 4: `packages/compat-oracle/src/ratchet.test.ts`
constructs a run result one test below the baseline and asserts a non-zero exit, and a
run at baseline and asserts zero. A gate that has never been shown to fail is not a gate.

`scripts/intent-artifacts-lock.test.ts` continues to assert this intent has both
artifacts.

## Rejected alternatives

- **Write our own compatibility tests.** They would encode our reading of the host's
  behaviour, which is exactly the thing under test. The host's suite is the only
  disinterested oracle.
- **Git submodules for the upstream repos.** A submodule cannot carry the rewritten
  import specifier, and pinning a submodule is no more auditable than recording a commit
  in `.source.json`.
- **One blended compatibility percentage.** The two hosts disagree on observable
  behaviour; a single number would let a yargs regression hide behind commander's score.
- **Stub the 9 internals files so the count reaches 105/105.** Stubbing internals invents
  behaviour upstream never promised, and inflates the number that is supposed to be the
  honest one.
- **Run the suites only before a release.** The value is the ratchet on every PR; a
  quarterly run tells you something broke, not which commit broke it.

## Out of scope

- Grading `cli-core` — the oracle grades compat front-ends and layer packages against
  hosts, never our own host-neutral API against someone else's shape.
- Fixing upstream bugs the suite encodes. If commander's suite asserts behaviour we
  think is wrong, we match it and register a C4 divergence only if we deliberately differ.
- Performance and agent-efficiency measurement — that is `cli-benchmarks`.
