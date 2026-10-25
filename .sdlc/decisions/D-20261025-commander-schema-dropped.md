---
id: D-20261025-commander-schema-dropped
subject: 'commander-schema: superseded — the declaration lives in the engine and typed-positionals; C1''s commander differential, R2''s file/path/object types and R4''s existence check are ruled out on value against bytes'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program (batch 28), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Dropped as superseded. Gap `B-20261019-commander-schema-remaining` is closed by this ruling.**
The intent called itself a supersede candidate on 2026-10-18: "once the five remaining items are
built, moved or ruled out … the owner may mark it `dropped (superseded)`". Two were built. This
ruling rules out the other three.

**Evidence that "declare once, derive everything" is delivered.**

- The declaration is the engine's: `OptionSpec` and `ArgumentSpec` in
  `packages/burgee/src/manifest.ts`, inferred as `InferOptions`, validated in `definition.ts`
  and `validate.ts`, and projected in `schema.ts`.
- Options with relations, numbers, choices and Standard Schema are held by `schema-dsl.test.ts`
  and `relations-schema.test.ts`.
- C3's `minimum` and `maximum` in `--schema` are held, and R3's `--no-x` (yargs #898) has been
  held since 2026-10-19.
- The positional half is [`typed-positionals`](../intents/typed-positionals/intent.md).
- `schemaVersion: 2` was dropped by `clispec-conformance` R1.

**The three pieces left, each ruled out on value against bytes and complexity:**

- **C1, a case per named issue that fails on plain commander.** The named issues are yargs
  issues. Commander has no API for most of them (relations, Standard Schema, typed inference),
  so "fails on commander" is true by absence and measures nothing. The 10 cited cases are the
  claims the code makes. The 13 uncited issues are cited publicly only as demand, on the docs
  research page, not as fixes. The same ruling covers `commander-env` C1
  ([D-20261025-commander-env-design-accepted](./D-20261025-commander-env-design-accepted.md)).
- **R2, option `file`, `path` and `object` types.** The gap recorded that `object` "touches the
  parser config, the precedence layers, help, completions and the schema at once". That is five
  subsystems of the core entry, whose bytes are budgeted per entry. The demand is two yargs
  issues (#2137 nested objects, #1188 files), and no adopter has asked. A `string` option with a
  Standard Schema validator already expresses a path or a file. PRINCIPLES 13 asks for a gap
  that callers are asking about, and this one has no such caller.
- **R4, `file` existence and readability.** It depends on R2. On a positional it would widen
  `D-20261012-typed-positionals-shape`'s closed key set, and nothing measured asks for that.

**What covers it instead.** The engine (`packages/burgee`) for options and relations,
`typed-positionals` for positionals, and `clispec-conformance` for the schema's version policy.

**How to reopen.** R2 and R4 come back as one new intent when an adopter or a demand signal names
nested or file-typed options. The signal could be an issue against burgee, or a cluster that
`scripts/mine-issues.ts` ranks. The shape question in the gap ("no new grammar") is that intent's
first decision.
