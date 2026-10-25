---
id: B-20261019-commander-schema-remaining
section: B
status: closed
source: commander-schema C1, R2, R4 (restated 2026-10-18)
recommendation: 'three PRs, each its own intent-sized change: C1 as a conformance suite in `examples/conformance` that runs each cited issue on plain commander and on burgee (about a day: 23 issues, 13 uncited); R2 as an `object` option type and dotted flags with a shape decision first (the spec says "no new grammar", which is the open design); R4 as a `mustExist` key on `file`, which needs `D-20261012-typed-positionals-shape` widened, since that decision fixed the key set'
---

`commander-schema` was built in part by `feat/typed-schema-surface` (D-20261019-typed-schema-surface-design-accepted):
R3's `--no-x` half is now held by `packages/burgee/src/schema-dsl.test.ts` › "counts a typed --no-x as given to implies and dependsOn, and a default as not given (yargs #898)",
and the positional half of C2/C3 by `typed-positionals` R1–R4. Three pieces are each larger than
the half day this batch allowed one intent, and are recorded here rather than started:

- **C1 — a case per named issue that fails on plain commander.** 10 of 23 issues are cited in a
  passing test; none runs against commander. The differential half needs a host that drives
  plain commander with the same declaration, which `examples/conformance/src/hosts.ts` has for
  the five front-ends but not for "commander without burgee's schema". About a day.
- **R2 — option `file`, `path` and `object` types.** `object` is the decided shape for dotted
  options (`--bq.project x`, env `PREFIX_BQ_PROJECT`), reassembled into one value, published
  nested in `--schema`. It touches the parser config, the precedence layers, help, completions
  and the schema at once.
- **R4 — `file` existence and readability when asked.** No option `file` type exists yet (R2),
  and on a positional it is a new key, which `D-20261012-typed-positionals-shape` closed the set
  against. A decision to widen it comes first.

~~Until these land the intent stays `approved`, not `shipped`.~~

**Closed 2026-10-25** by [D-20261025-commander-schema-dropped](../decisions/D-20261025-commander-schema-dropped.md),
the build-the-rest option declined: `commander-schema` is `dropped` (superseded by the engine's
declaration and `typed-positionals`). C1's commander differential is ruled out, because
commander has no API for most of the named issues, so it measures nothing. R2 (`file`, `path`,
`object` options) and R4 (existence) are ruled out on value against core bytes, with no adopter
asking. They reopen as one new intent when a demand signal names them.
