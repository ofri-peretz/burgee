---
id: D-20261012-agent-schema-bytes-step-change
subject: 'control-band-agent-schema-bytes: four accepted conformance steps, not a regression; the band stays'
taken: Taken
date: '2026-10-12'
superseded_by: —
---

**`agent-schema-bytes` went from 1,678 to 4,752 B in four steps, and every step is a
conformance requirement the owner accepted: the document carries more, it did not regress.**
None of the four is the "make the output readable" commit the band was written to catch. The
document is still compact (`packages/burgee/src/machine-json.test.ts` holds that, and passes);
it grew because it now says more.

| From → to (B) | Commit    | PR    | Requirement                                                                  |
| :------------ | :-------- | :---- | :--------------------------------------------------------------------------- |
| 1,678 → 2,380 | `a049bc2` | #1002 | agent-lint-conformance R4–R6: root help lists completion, exit codes, examples |
| 2,380 → 2,392 | `733e5e0` | #1006 | agent-lint-conformance R1–R3: `--no-color`, `--quiet`, `--timeout` are global  |
| 2,392 → 3,235 | `e0532b2` | #1015 | clispec-conformance R2, R6: every failure names its kind, listed under `errors` |
| 3,235 → 4,752 | `a2e4f98` | #1027 | clispec-conformance R1, R3–R5, R7, R8: `--schema` is a clispec v0.3 document   |

Each value is the CI observation recorded on that commit in
`benchmarks/results/cli-benchmarks/`; the commit before each held the previous value.

**Is this a real regression, a change in what we measure, or a change in the corpus?** None of
the three as the question means them: no regression, the same measurement over the same demo.
It is a change in what the document carries, by four accepted requirements.

**Which commit is the first one outside the band?** `a2e4f98` (#1027), the clispec v0.3
document: the series sat at 3,235 B before it and has sat at 4,752 B on every observation since,
through `b45f141`. Nothing after it moved the value: measured again on `4c85515` (origin/main on
2026-10-12, after #1044, #1060, #1061), `node examples/demo-cli-burgee/dist/bin.js --schema` is
4,752 B.

**The band stays as it is.** A control band recentres as its 20-point window fills with
post-change readings: eight of the twenty points in the window are already 4,752 B, and once
the pre-change points leave the window the band sits around the new level and σ collapses toward
zero. Widening it now would make it measure nothing afterwards: the next unintended step, a
pretty-printed document or an inlined help string, would land inside a band stretched to fit
this one. `.sdlc/bands/control-bands.json` does not change.

**The guard against an unintended regression is partial.** `machine-json.test.ts` fails if
`--schema` stops being compact, which is the specific regression the band's description names.
Nothing fails on growth: `schema-bytes` in `benchmarks/axes/reliability.ts` is reported
without a `gate`, unlike `skill-bytes`, which is gated at `SKILL_BYTES_BUDGET`. A commit that
adds content to the document is caught only by this band, and only after the fact. That is
recorded as an open gap, B-20261012-agent-schema-bytes-no-gate; choosing a budget is a
decision of its own and is not made here.

The intent stays `draft`, owned by the watcher, as D-20261005-cold-start-band-questions left
the cold-start one.
