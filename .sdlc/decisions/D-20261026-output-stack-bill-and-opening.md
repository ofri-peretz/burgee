---
id: D-20261026-output-stack-bill-and-opening
subject: 'cli-output-stack S2 is measured from the install graph and the lockfile, cross-checked against upstream-watch; R12''s no-burgee clause is held on the first paragraph, not the 25-line opening'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets, gates and trade-offs, applied by the roadmap-to-shipped program'
date: '2026-10-26'
superseded_by: —
---

**The complete-CLI dependency bill is published on `/docs/benchmarks` under B4, computed by
`scripts/dependency-bill.ts` and held by `scripts/dependency-bill-lock.test.ts`. It reads 9
packages installed, 0 from outside the family, for `burgee` + `roundel` + `flagstaff` + `caique`,
against 50 for `commander` + `chalk` + `ora` + `cli-table3` + `@inquirer/prompts`. R12's "never
names burgee" is checked on each layer's first paragraph by `scripts/readme-opening-lock.test.ts`.**

## S2 — how the bill is measured

The intent asked for one number no incumbent publishes: what `npm install` puts on disk for a
whole CLI. It said "burgee's column reads 0". D-111 had already restated that to "0 external",
because burgee depends on five family packages.

- **Ours** is the union of the `benchmarks/install-graph.json` rows for the four packages. Each
  row is an offline install of one package alone, from the tarballs `npm pack` builds.
  `install-graph-lock.test.ts` holds that file to a fresh install, so this bill does not install
  anything again.
- **Theirs** is each incumbent's tree in `package-lock.json`, resolved the way Node resolves it:
  the nearest `node_modules` first. It counts dependencies, non-optional peers, and optional
  dependencies the lockfile carries. This is the same resolution B3 grades and B4 weighs.
  Installing the incumbents into a temp directory from the registry was rejected. The root
  suite runs offline, and a network install in every PR would turn a registry outage into a
  red build.
- **The lockfile has to agree with a second instrument.** For each incumbent, the lock compares
  the tree size with the one `upstream-watch` resolved from the registry for the same release
  (`competitors.json` `seen.packages`). On 2026-10-26 all five agree: commander 1, chalk 1,
  ora 17, cli-table3 7, @inquirer/prompts 25. A lockfile that resolved a different tree from a
  fresh install would fail here before the sum is published.
- **A package installed at two versions counts twice**, because both copies are on disk. The
  incumbents install chalk 5.6.2 inside ora beside chalk 6.0.1, and two versions each of
  string-width, strip-ansi and ansi-regex. So the sum is 50, not 51 (signal-exit is shared)
  and not 46 (distinct names).
- **inquirer is `@inquirer/prompts`**, following the 2026-10-18 restatement of the metrics table.
- **The incumbents get no "outside the family" column.** They are separate projects, so the
  column has no meaning for them, and the page says so.

The page drifts the moment the lockfile moves an incumbent's tree: `bench:page --check` in
quality.yml's `fast` job goes red, and so does the lock.

## R12 — first paragraph, not the opening

`readme-opening-lock` already reads the 25 lines after the header, and it requires the
incumbents and the agent surface there. Extending "never names burgee" to those 25 lines would
fail all nine layers. Each one says `npx burgee migrate` there, because that command is how every
drop-in is reached. That is a fact about migration, not a layer leading with the framework. So
the clause covers the first paragraph only, which is what R12 wrote, and burgee's own README is
exempt. On `main` at `c5b573551c` one layer failed it: flagstaff's first paragraph ended "no
dependency outside the burgee family". linegauge's sentence, quoted in the 2026-10-19 reading,
had already been edited away. flagstaff's dependency statement stays in its third paragraph
("four dependencies, all from this repository") and in its badge.

## What closes the intent

Both checks pass on `main` once this lands. flagstaff's npm page still shows the old README
until flagstaff publishes again. `.changeset/flagstaff-readme-opening.md` carries that change.
`cli-output-stack` stays `approved` until that release is on npm, and then it is stamped
`shipped`.

**How to reopen.** If the lockfile and the registry disagree on an incumbent's tree and the
disagreement cannot be resolved by refreshing either one, measure from a registry install in
`bench.yml` instead.
