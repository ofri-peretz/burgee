---
id: B-20261026-models-yml-holds-code-invariants
section: B
status: open
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
