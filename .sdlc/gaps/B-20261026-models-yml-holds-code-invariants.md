---
id: B-20261026-models-yml-holds-code-invariants
section: B
status: closed
source: release-cadence, D-20261026-release-window-holds-code
recommendation: 'Extend the loop in `models.yml`''s step "release window — the rejected designs still fail, and the shipped one ships" to `unsplitHolds npmOnlyHolds holdsVersionsNotCode shippedNeverReleasesAFeature shippedNeverHoldsAFix`, and the string `scripts/release-window.test.ts` › "models.yml keeps the model’s rejected designs failing" asserts, in one pull request whose task-eval run the owner accepts'
---

`release-window.qnt` gained two invariants that must stay violated: `holdsVersionsNotCode`, the
design that held version numbers and published the held code in a patch (#1253), and
`shippedNeverHoldsAFix`, a witness that the shipped design does hold a fix behind its package's
held feature. `models.yml` checks only the three it names, so today these two are checked by
hand (`npx -y @informalsystems/quint@0.33.0 run .sdlc/intents/release-cadence/release-window.qnt
--invariant=<name> --max-steps=30 --max-samples=20000`, each violated on 2026-10-26).

`release-window.test.ts` asserts the model declares both, so neither can be deleted silently; it
cannot assert they stay violated, because it does not run quint. The workflow edit is held back
because a change under `.github/` runs the paid task evals on its pull request.

**Closed 2026-10-27** by [D-20261027-close-three-workflow-gaps](../decisions/D-20261027-close-three-workflow-gaps.md), the recommendation as written. `models.yml`'s step "release
window — the rejected designs still fail, and the shipped one ships" loops over `unsplitHolds
npmOnlyHolds holdsVersionsNotCode shippedNeverReleasesAFeature shippedNeverHoldsAFix`, and
`safety` stays in the step every model runs. `scripts/release-window.test.ts` › "models.yml keeps
the model’s rejected designs failing" now reads the loop's names and requires exactly these five,
each declared in the model: red on `b62bd20c86` (the loop named three). Run by hand on 2026-10-27
with the workflow's own flags: `safety` holds, each of the five is violated.
