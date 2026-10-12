---
id: D-20261012-agent-eval-turn-budget
subject: 'Where do the turns of the two from-schema evals go, and what fixes them on the product side'
taken: Taken
date: '2026-10-12'
superseded_by: —
---

**Fix the documents and the refusals the agent reads. Leave the eval alone.** The 12-turn cap
(D-20261006-eval-turn-budget), the prompts and the shell checks do not change.

`locale-pack-from-schema` and `paratext-plugin-from-schema` claim the PRINCIPLES 7 bar: the
published schema plus one example are enough to write the artifact in about one turn. On
2026-10-12 the `Evaluate agent configuration` job passed them in 8 to 15 turns, and both had
failed at the cap: locale on #1039 and #1078, paratext on #1068 and #1072, each time with no
file written. The runner kept nothing from a run except its last 240 characters, so those
failures could not be diagnosed.

## Where the turns went

The runner now runs `claude` with `--output-format stream-json --verbose` and keeps every tool
call: turn, tool, input, the start of the output, and whether the call was refused. They go
into `evals/results/<date>.json` under `calls`, and a failed case prints them in the CI log.
The measurements below ran locally, five per case before and five after, with the CI runner's
`claude` (2.1.283 from `.github/tools/claude-code`), its default model (`claude-sonnet-5`), the
same isolation flags and the same 12-turn cap.

- **locale-pack-from-schema, before.** All five runs went: read the schema and the German pack,
  check that `dist/` and `evals/results` exist, write the pack, run `check`, get refused, add
  the missing form, run `check` again. **All five were refused for the same thing:** French
  `usage.stdinOnce` was missing `many`. Nothing in the schema says which forms a locale needs,
  and the one example, German, has only `one` and `other`. So every run lost two turns to a
  refusal it could not have avoided.
- **paratext-plugin-from-schema, before.** `check` refused nothing in five runs. The lost turns
  were all reading: `cli.ts`, `check.ts`, `plugin.ts`, `template.ts` and `builtins.ts`, plus a
  grep for how `BEL` and `\u0007` are written. The README shows one capability passed to
  `register()` and never a whole plugin module. The shared schema is titled "flagstaff plugin",
  so an agent goes to the source to find out what a paratext plugin file looks like.

## What changed

- `burgee check` reports every problem in a pack in one run. `refused.problems` lists each with
  its own `fix`, and `message` and `fix` list them all, numbered. Before, it stopped at the
  first. A missing plural form's fix lists each form the locale selects with a count that
  selects it: `one (for 0), many (for 1000000), other (for 2) for fr`. Written test-first in
  `check.test.ts`, red on main.
- `locale-pack-schema.json`: the plural message's description lists the forms for each common
  language (en, de: one, other; fr, es, it, pt: one, many, other; ru, pl: one, few, many,
  other; ar: all six; ja: other). The list is read from `Intl.PluralRules` when the schema is
  generated, not written by hand. The plural branch also has a French example. The top-level
  description shows the module shape and says nothing needs importing, because one run after
  the change spent turns searching for `definePlugin`.
- `paratext check` and `register()` report every capability problem in one run. A missing `osc`,
  `when`, `encode` or `name` gets a fix that shows the field written, instead of "compare
  against the schema". Written test-first in `check.test.ts`, red on main.
- paratext's README has a "Writing a plugin" section with a whole module and what `check` prints
  for it.

## Before and after

`turns` is the `num_turns` that `claude` reports and the history line records. It counts one
per tool call plus one, so it can be higher than the model turns the cap counts. The model
turns are in brackets. All 20 runs passed. Costs are `claude`'s own `total_cost_usd` per run
(API-equivalent; the subscription credential bills no tokens).

| case | before: turns (median, max) | after: turns (median, max) | cost per run, before → after |
| :-- | :-- | :-- | :-- |
| locale-pack-from-schema | 7, 7, 7, 8, 9 (7, 9) [model 5, max 7] | 6, 6, 7, 9, 18 (7, 18) [model 5, max 11] | $0.12–0.23, mean $0.162 → $0.11–0.27, mean $0.158 |
| paratext-plugin-from-schema | 8, 8, 10, 10, 13 (10, 13) [model 6, max 9] | 5, 5, 5, 6, 7 (5, 7) [model 3, max 5] | $0.14–0.26, mean $0.176 → $0.05–0.15, mean $0.088 |

paratext meets the target: median under 6, and no run near the cap. locale does not yet. The
avoidable refusal went from 5 of 5 runs to 0 of 5, and the pack passed on its first `check`
every time. But the median stayed at 7. The turns saved went to the agent verifying what the
schema now says (one run ran `Intl.PluralRules` itself and read `check --help`), and one run
spent 11 model turns searching the source for how to write a pack as a module. The description
change above answers that run. The owner's budget was five local runs per case, so it was not
measured again here. The PR's own `Agent Evals` run measures it.

Two runs were not independent. Both cases write to `evals/results/`, and they ran in parallel,
so in one post-change locale run the agent opened the paratext case's output file. It still
took 7 turns.

## One budget moved

paratext's `./plugin` entry budget goes from 12,200 to 13,000 bytes. It measured 12,927 with the
change and 12,099 before it. The 828 bytes are the code that collects every capability problem
into one refusal and the four fixes for a missing field. The strings were cut to their shortest
before the budget was moved. The value is the one this decision is about: a plugin with several
mistakes is fixed in one `check` run, not one run per mistake. The reason and the date are
beside the budget in `packages/paratext/src/weight.test.ts`. burgee's core entry does not
change: a pack's `problems` are set on the error instance in `locale.ts`, not added to
`PluginError` in the core.
