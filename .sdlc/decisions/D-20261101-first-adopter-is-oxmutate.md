---
id: D-20261101-first-adopter-is-oxmutate
subject: 'first-adopter: the owner ruled on 2026-11-01 that oxmutate is the first adopter. Graded against that ruling, criterion by criterion, which of A1–A6 hold, and does the intent ship?'
taken: 'The owner ruled oxmutate the first adopter, 2026-11-01. The grading below is by the agent closing the intent under the owner''s delegation (burgee-owner-delegates-tradeoffs)'
date: '2026-11-01'
superseded_by: —
---

**oxmutate is the first adopter, by the owner's ruling. A1–A4 hold. A5 is open. A6 is a measured
miss, moved to gap [C3](../gaps/C3.md). So `first-adopter` does not ship yet. It stays `approved`
and waits on A5 alone.**

**The ruling, 2026-11-01, in the owner's words:** "first adopter we have - oxmutate." and "we
already have one."

**What that overrules, said plainly.** The design gate of 2026-10-25
([D-20261025-first-adopter-design-accepted](./D-20261025-first-adopter-design-accepted.md)) said A1
and A6 "close only on a merge in someone else's repository". oxmutate is not in someone else's
repository. It is a separate product, with its own intent, workstream and session, but it is built
and published from this one: `npm view oxmutate@1.1.0 repository.url` is
`git+https://github.com/ofri-peretz/burgee.git`. The owner's ruling accepts that for A1. It does not
make oxmutate an outside adopter, and nothing here claims it is.

## The grades

| id | grade | evidence |
| :-- | :-- | :-- |
| A1 | **met** | `npm view oxmutate@1.1.0 dependencies` is `{ burgee: '^1.9.2', bellpull: '^1.0.10' }`. 1.1.0 was published 2026-10-31T08:25:38Z, `gitHead` `f0213f9f0a`. At that commit `src/bin.ts` imports `run` from `burgee`, `src/cli.ts` imports `defineCommand`, `defineProgram` and `ExitCode`, and `src/child.ts` imports `ExitCode`. `bin` is `oxmutate: dist/bin.js`. It is a real tool, not `examples/demo-cli-*`. Both dependencies are burgee-family packages |
| A2 | **met** | [`.sdlc/research/adoption/oxmutate.md`](../research/adoption/oxmutate.md), written 2026-11-01 by the session that built oxmutate, which did not build burgee. It records diff size (46 burgee-facing lines; the CLI is about 1.2% of #1302), two breakages and five friction points. **Time is the weakest of the four:** no separate time log was kept, so it is a calendar span (the CLI's first commit `5d9bbadf61` and its four changes all on 2026-10-27, merged 2026-10-28) and a statement that the CLI held up neither the merge nor a release. It is not an effort figure like concurrently's "about 40 minutes". It passes `prettier --check` and `markdownlint-cli2` |
| A3 | **met, by concurrently's proof** | oxmutate was born on burgee, so it has nothing to revert to and A3 does not apply to it. The reversibility proof is concurrently's ([`concurrently.md`](../research/adoption/concurrently.md)): 649 / 649 on the base, after `burgee migrate` and after one `git revert`, on Node 22, 24 and 26, and the revert restores the base tree hash exactly (`74d047518f`). The `revert-proof` branch lives in a local clone and was never pushed, as that report says |
| A4 | **met in this change** | The oxmutate report filed no gap for any friction point. Each is filed now, below. concurrently's five and igir's five were already each a gap or a decision, checked one by one |
| A5 | **open** | See § A5. Filed as [B-20261101-b1-real-cli-arm-oxmutate](../gaps/B-20261101-b1-real-cli-arm-oxmutate.md) |
| A6 | **not met: a measured miss** | oxmutate depends on `burgee` itself, so it is not a CLI installing one layer alone, without `burgee`. It is also ours. No CLI we did not write installs a single layer alone in a published release. The miss moves to [C3](../gaps/C3.md), which already tracked it (candidate apify/mcpc#447, unmerged), and C3 now says it carries A6 |

## A4: every friction point, and where it went

oxmutate (`.sdlc/research/adoption/oxmutate.md`):

| report item | filed as |
| :-- | :-- |
| friction 1, `TEXT` is not exported from `burgee` | [B-20261101-burgee-text-symbol-not-exported](../gaps/B-20261101-burgee-text-symbol-not-exported.md) |
| friction 2, `ExitCode` only on the root entry (121–139 ms per Vitest server) | [B-20261101-exit-code-dependency-free-subpath](../gaps/B-20261101-exit-code-dependency-free-subpath.md) |
| friction 3, option types cast by hand though inferred | decided not to fix in burgee: [D-20261101-oxmutate-option-casts-not-a-burgee-fix](./D-20261101-oxmutate-option-casts-not-a-burgee-fix.md) |
| friction 4, D-140's "stderr stays empty" no longer true | [A-20261101-d140-stderr-sentence-superseded](../gaps/A-20261101-d140-stderr-sentence-superseded.md) |
| friction 5, a non-zero exit with data is an untyped `data.exitCode` | [B-20261101-handler-exit-code-with-data-untyped](../gaps/B-20261101-handler-exit-code-with-data-untyped.md) |
| breakage 1, an overwritten `process.exitCode` is silent ("Gap: none filed") | [B-20261101-overwritten-exit-code-is-silent](../gaps/B-20261101-overwritten-exit-code-is-silent.md) |
| breakage 2, 1.0.0 published `"*"` ranges | already decided: [D-20261028-oxmutate-sc6-family-deps-bundled-cores](./D-20261028-oxmutate-sc6-family-deps-bundled-cores.md) |

Four of the six filed are B, not A, because each adds to or changes burgee's public surface, and
`.sdlc/GAPS.md` puts that behind a decision. None is fixed here.

concurrently, all five already covered: A-20261027-yargs-parsesync-surfaces-throw (closed),
B-20261027-migrate-pins-match-exact-convention (closed), the empty `--schema` for a program with no
handler (decided in D-20261027-first-adopter-target-concurrently), the engines floor (D-132, not
fixed), A-20261027-yargs-parsesync-mcp-ended-by-exit (closed).

igir, all five already covered: A-20261028-yargs-locale-read-at-runtime,
A-20261028-yargs-parse-callback-surfaces and A-20261028-yargs-argv-type-call-signature (all
closed), A-20261028-migrate-transitive-reads-dev-deps (open; filed, which is what A4 asks), and the
computed-path refusal (decided not to fix in D-20261028-first-adopter-second-target).

## A5

The brief for this change was to add an oxmutate variant to B1 as data and config only, and to
grade A5 "variant added; measured at the next scheduled B1 run". Neither half holds.

1. **The convention.** [D-20261026-shipped-on-published-patch](./D-20261026-shipped-on-published-patch.md)
   does not stamp an intent whose criterion waits on a scheduled run. `plugin-contract` stayed
   `approved` until its C4 eval run executed and passed, and was stamped only then. A5 says B1
   *runs* against the real CLI. A variant that has not run is not that.
2. **A data-only variant cannot measure oxmutate, and would break the weekly run.** The agent
   axis runs every task in `benchmarks/tasks/` against every variant. All five tasks are the
   demo's, and the shim the agent runs is named `demo`. oxmutate would fail every one. Each CLI
   variant's `success-rate` is gated at 0.8 and `bench.yml` runs the axis with `--check`, so the
   weekly B1 job would go red after 25 more paid sessions. The gap gives the details.

So no variant was added. A5 is open on
[B-20261101-b1-real-cli-arm-oxmutate](../gaps/B-20261101-b1-real-cli-arm-oxmutate.md). It closes when
that arm is built and the first scheduled run lands a reading for it.

## What this does not change

- **concurrently#639 and igir#2249 go on as outreach, outside the gate.** Neither is closed,
  withdrawn or commented on by this decision. A merge there would be the first outside adopter of
  `burgee`. It still would not meet A6, which needs a lone layer without `burgee`.
- **`oxmutate`'s own intent** stays `approved`, pending its SC8 and SC11.
- **The `burgee` umbrella** stays `approved`. It closes when its children do, and `first-adopter`
  is still one of them.
