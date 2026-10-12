---
id: D-20261012-clispec-remainder-built
subject: 'D-151 left the ten clispec 0.3.0 checks burgee still failed "argued with the checker, not bent into the parser". clispec-conformance R1–R8 built them. Does the remainder stand, and where does the N10 ratchet go?'
taken: Taken
date: '2026-10-12'
superseded_by: —
---

**The remainder is superseded. burgee's demo scores 24 / 24 on clispec 0.3.0, and
`BURGEE_FLOOR.clispec` rises to 24.** D-151's own decision stands: `schema` is still an alias of
`--schema`, and a program's own `schema` command still wins. What this replaces is its last
sentence only, which held that the ten checks still failing were the checker's to change.

**Why that changed.** D-151 was taken while the scorer was a black box. Reading clispec-cli's
source at `v0.3.0` (the `clispec-conformance` intent) showed that none of the ten needs the parser
bent. Six are additive keys in the one `--schema` document (`clispec`, `errors`, `global_args`,
`output`, and per command `example`, `cardinality`/`output_kind`/`stdout_schema`). Two come from
the demo declaring examples and output, which the docs already ask of every author. The last two
are an error `kind` written to stderr as well as stdout, and an explicit `--format text`. Each is
something agents ask for, and each shipped in #1015 (R2, R6) and #1027 (R1, R3–R5, R7, R8).

**The reading.** It is published as `benchmarks/results/external-floor/2026-10-12.json`, run
locally with `npm run bench -- --axis floor --check --publish` at `35ded07` (`-dirty` is only this
change's gate edit in `floor.ts`). **clispec 14 → 24 / 24** (Fair → Excellent), with no check
failed. **cli-agent-lint 91.5% → 94.9%** (A): SD-1 *Error format is structured* now passes,
from R6's line on stderr, and only FS-4 (`warn`) and SD-5 (`info`) remain. commander and yargs are
unchanged at 2 / 24 and at 71.2% and 70.9%.

**The ratchet.** `BURGEE_FLOOR.clispec.min` is 24, the scorer's maximum, so losing any one point
fails the PR that lost it. `BURGEE_FLOOR.agentLint.min` stays 91. Raising it belongs to
`agent-lint-conformance`, the intent that owns that number, and this intent does not raise it.
`benchmarks/floor.test.ts` holds the clispec minimum at the maximum and checks that the published
reading clears both minimums.
