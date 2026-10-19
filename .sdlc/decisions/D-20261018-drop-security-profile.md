---
id: D-20261018-drop-security-profile
subject: 'security-profile: no adopter asked for it, and its exit-code taxonomy collides with the contract burgee ships'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped. It had no adopter, and its design cannot be built as written.**

The intent has been at `review` since 2026-09-09. Its own header says it is "deliberately
unscheduled — opens when an adopter needs it". No adopter has asked for it in the six weeks since.
Nothing in `packages/` implements any of its eleven requirements.

**The design is also wrong now, which is why this is a drop and not a defer.** Its Q1 reserves
exit codes 0–5 under the opt-in profile:

| code | Q1 (`security-profile/spec.md`) | `ExitCode` (`packages/burgee/src/exit-code.ts`) |
| --: | :-- | :-- |
| 1 | findings at or above the gate | `RUNTIME` |
| 2 | tool or internal failure | `USAGE` |
| 3 | invalid configuration or rules | `CONFIG` |
| 4 | authentication or entitlement | `CANCELLED` |
| 5 | partial scan | `AUTH` |

Three of the five non-zero codes mean something else under burgee's shipped contract: 2, 4 and 5.
That contract is published in `--schema` (clispec-conformance R3), listed in root help, and held
by `scripts/exit-code-lock.test.ts`. A profile that renumbers it would make a command's exit code
depend on which profile is active. That defeats the point of a published taxonomy.

**What covers it instead.** Nothing, on purpose. burgee's general `ExitCode` contract (E1, which the
intent itself says Q1 only refines) is what a scanner-shaped CLI gets today.

**How to reopen.** When an adopter with a scanner-shaped CLI asks for it, open a new intent, or
move this one back to `draft`, and **redo the design**. Q1 has to extend `ExitCode` (new codes
above 6, or a `kind` refinement) rather than renumber it, and `exit-code-lock.test.ts` has to pass
unchanged.
