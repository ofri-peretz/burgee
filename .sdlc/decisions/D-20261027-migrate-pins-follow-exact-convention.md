---
id: D-20261027-migrate-pins-follow-exact-convention
subject: 'B-20261027-migrate-pins-match-exact-convention: `burgee migrate` added `"burgee": "^1.7.2"` to concurrently, whose runtime dependencies are all exact. Whose style does `next` follow, the project’s or burgee’s?'
taken: Taken
date: '2026-10-27'
superseded_by: —
---

**The project’s. `next` writes the family packages it adds in the project’s own convention.
It writes an exact version when every runtime dependency in the manifest is exact. Otherwise it
uses the style shared by every incumbent the run moves: exact, or `~`. In every other case it
keeps the caret that U12-2 chose.** The coordinator decided this under the owner’s delegation
for burgee trade-offs. It is the gap’s recommendation, widened by one rule (the incumbent’s own
style), on the coordinator’s instruction.

**The rule, in order** (`pinStyle` in `packages/burgee/src/migrate.ts`):

1. The manifest has runtime `dependencies` and every one is an exact version (`1.2.3`, or an
   exact prerelease): **exact**. This is concurrently’s case, with six exact dependencies,
   `yargs 18.0.0` among them.
2. Otherwise, every incumbent the run moves is declared in one style, exact or `~` or `^`
   around an exact version, in any of the four dependency fields: **that style**. A project that
   wrote `"yargs": "~18.0.0"` gets `burgee@~1.7.2`.
3. Otherwise: **`^`**, as before. This covers mixed styles, `>=18`, `*`, a tag, `^18.0`, and a
   manifest with no runtime dependencies whose incumbent is a caret.

An exact pin carries the installer’s own flag: `npm install --save-exact`,
`pnpm add --save-exact`, `yarn add --exact` or `bun add --exact`. npm adds its default `^` to
`npm install burgee@1.7.2` unless it is told not to, so the version alone does not stay exact.
The release-age note says `next pins 1.1.0` in the same style as the pin, not `^1.1.0`.

**Why not always the caret.** U12-2 chose the caret to fix an *unpinned* install, one that
resolved versions older than the graded drop-in. It was never a statement about how a project
writes its ranges. An exact pin of the graded version also installs the graded version, so
U12-2’s guarantee still holds. A reviewer of an exact-pinned project asks for the pin, and the
first-adopter pull request was pinned by hand to answer that.

**Rejected.**

- *A report field saying why the pin is exact* (the gap’s “and the report says why”). It would
  change the `--json` report’s shape for every consumer. An exact pin in a manifest of exact pins
  explains itself, and `next` is printed in the text report.
- *Reading `save-exact=true` from `.npmrc`.* It is a real signal, but no adopter has needed it
  yet. The manifest is what a reviewer reads.
- *A per-package style, so roundel could be exact while flagstaff stays a caret.* A single
  `--save-exact` applies to the whole install command, so mixed styles would need two commands.
  One style per run keeps `next` a single install.
