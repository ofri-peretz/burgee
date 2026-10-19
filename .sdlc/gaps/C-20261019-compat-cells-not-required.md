---
id: C-20261019-compat-cells-not-required
section: C
status: open
source: 'fix/compat-root-suite-build-scope: the root suite red on #1143, #1145 and #1155, none of them blocked'
needs: 'the owner: make the Node 24/26 cells of compat.yml required, or put them behind a gate check that is (as `Quality Gate` is for its workflow)'
---

The compat matrix cells (`Node 24 · <os>`, `Node 26 · <os>`, and the four `published suites`
cells) are each named "hard gate on every cell" in `compat.yml`, but none is a required status
check. `main`'s protection requires four contexts: `Quality Gate`, `Quality (Full) Gate`,
`review` and `Ratchet · each host's suite against burgee` (`gh api
repos/ofri-peretz/burgee/branches/main/protection`, 2026-10-19).

So a red cell never blocks a merge. The root suite failed on every Node 24 and 26 cell of the
bench-series PRs #1143 and #1145 and of the docs PR #1155: they built `./packages/*` and not the
demo the root suite starts. Each PR merged, or would have merged, under auto-merge. A gate that
reads "hard" and does not block teaches the next reader that red is normal here. The build scope
is fixed and locked (`scripts/root-suite-build-scope-lock.test.ts`); whether the cells block is the
owner's branch-protection setting, so it is recorded here and not changed by a PR.
