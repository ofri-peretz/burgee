---
id: D-20261025-output-stack-compat-dropped
subject: 'output-stack-compat: superseded — all eight output-stack hosts are graded at 100% under their layers'' designs, and the mechanical drawing classifier is rejected for named subtractions'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program (batch 28), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Dropped as superseded. The outcome it asked for has been delivered by the layer intents. The one
piece of its own design that was never built, a mechanical case classifier, is rejected.**

The intent asked that a user of any of eight output-stack incumbents change one import and keep
their tests passing, with each row graded by the incumbent's own suite and a control run. Its
`spec.md` was written to settle the snapshot question and never passed the Design→Build gate.

**Evidence that the outcome is delivered.** Every row has a baseline in
`packages/compat-oracle/baseline/` at 100%, each with its control in the same run, gated by
`compat.yml`'s Ratchet job, and published on `/docs/compatibility`:

| incumbent | façade | baseline file |
| :-- | :-- | :-- |
| chalk | `roundel/chalk` | `chalk.json` |
| picocolors | `roundel` (graded through `roundel/picocolors`) | `picocolors.json` |
| ora | `flagstaff/ora` | `ora.json` |
| log-update | `flagstaff/log-update` | `log-update.json` |
| boxen | `flagstaff/boxen` | `boxen.json` (213 / 213 at boxen 9) |
| cli-table3 | `flagstaff/cli-table3` | `cli-table3.json` |
| inquirer | `caique/inquirer` | `inquirer-core.json`, `inquirer-prompts.json` |
| clack | `caique/clack` | `clack.json` (16 / 16, drawings subtracted by name) |

Criterion 2 (chalk and ora at parity before their façades publish) is met: both are published
in `roundel` and `flagstaff`. Criterion 3 (the release watch opens an issue within a day) is
[`upstream-watch`](../intents/upstream-watch/intent.md), `shipped`.

**The design question was settled elsewhere, and differently from this spec.** The spec said
to gate every drawing. [D-001](./D-001.md) chose the `cli-table3` shape for clack instead. The
drawings of a host that animates are subtracted as a declared subset, by name, with the reason
in `hosts.ts`. For a pure string function (boxen, cli-table3) the drawing is gated, because there
it is the whole contract. Both halves are what shipped.

**Why R1 and R5, the mechanical classifier and its lock, are rejected rather than moved.** They
were meant to stop a split being retuned to flatter a score. Named subtractions already do that,
and more strictly. Each excluded case is named in `hosts.ts` with a mandatory reason and
published on the compatibility page by `scripts/compat-page.ts`. `requireMatch` turns the control
red if upstream renames a file. And the control run proves the gate against the real package. A
classifier would add a second source of truth for the same split. R4's "three numbers per row" is
held in its restated form: the gated rate, the internals columns, and every subtraction by name
under the table.

**What covers it instead.** `roundel`, `flagstaff`, `caique` and `inquirer-prompts-drop-in` for
the façades. `compat-oracle` for the exclusion contract. `upstream-watch` for the release watch.

**How to reopen.** Only if a named subtraction is shown to hide a case that is not a drawing.
That would be the evidence a classifier is needed, and the new intent cites it.
