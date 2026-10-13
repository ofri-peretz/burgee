---
id: D-20261013-commander-argument-choices-budget
subject: 'What `burgee/commander` may pay for an `Argument`''s choices reaching `--schema` (B-20261012-commander-argument-choices)'
taken: 'Taken — on the owner''s delegated budget ruling of 2026-10-13: find the bytes in the façade first, and raise only by the measured excess'
date: '2026-10-13'
superseded_by: —
---

**The owner's ruling, 2026-10-13, was in two steps.** First, find the bytes in the façade by
sharing the code path options already use to project `choices`. Second, only if the bundle was
still over its ratchet after that, raise the `burgee/commander` bundled ratchet and its B4
ceiling by exactly the measured excess, rounded up to the next 10 B. The core entry `.` is not
touched either way.

**The first step was enough, so nothing was raised.** `burgee/commander` bundled
(`npm run bench -- --axis weight --check`, local):

| Tree | Bytes | Gate |
| :-- | --: | --: |
| `main` at 264a413 (#1079) | 55,359 | 55,400 |
| before: `main` with #1074's R1–R3, the base of this change | 55,353 | 55,400 |
| R3's choices built the plain way (a third conditional spread in the `arguments` map) | 55,398 | 55,400 |
| **after: the shared path, as merged** | **55,343** | 55,400 |

The plain build left 2 B of local headroom, and CI reads about 32 B over a local build (the
note on the 60,850 entry in `benchmarks/axes/weight.ts`), so it would have failed CI. The shared
path is one helper in `commander/command.ts`, `declared()`, that copies `description` and
`choices` from an `Option` or an `Argument` onto its manifest entry. `_optionSpecs()` and the
`arguments` map both call it, so the two copies of the description and the new choices copy are
one function. In `schema.ts`, `withChoices()` is the one place `choices` becomes `enum`, on the
value or on each item of a list, for options and positionals alike. The core entry `.` measures
24,285 B before and after.

**Value gained.** An agent reads the allowed values of a positional from `--schema` and from the
MCP tool's `inputSchema`. Commander's own types expose them, and no machine surface did before.
Commander's help already prints them (`(choices: "a", "b")`) and is unchanged. Completions
complete no positional's value today on any front-end, so there is no positional list for the
choices to join there.

**The manifest field.** `ArgumentSpec` gains `choices?: readonly string[]`. Native
`defineCommand` does not check a positional's value, so its definition type
(`Command['arguments']` in `execute.ts`) leaves the field out. A native program cannot publish a
constraint its parser does not enforce. Wave 4's typed positionals add the native check and lift
the `Omit`.

**Reversal.** A change that needs the bytes back removes `declared()`'s `choices` line and the
`arguments` map's call. The ratchet stays where the measurement puts it, and only falls.
