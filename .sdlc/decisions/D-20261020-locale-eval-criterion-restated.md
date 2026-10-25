---
id: D-20261020-locale-eval-criterion-restated
subject: '`localised-human-surfaces` criterion 4 says an agent writes a passing pack "in one turn", which no reading has met and D-20261012-agent-eval-turn-budget measured as a median of 7. Restate it, and does locale resolution need a Quint model?'
taken: 'Restated to the cap half of the D-20261012 bar, with the median half held by `locale-pack-in-five`; no Quint model — by the batch-24 agent under the owner''s delegation (burgee-owner-delegates-tradeoffs, 2026-10-12), 2026-10-20'
date: '2026-10-20'
superseded_by: —
---

## Criterion 4, restated

**Was:** "an agent given the pack schema and one example writes a passing pack for a new language
in one turn. It runs weekly beside the plugin eval."

**Now:** the agent writes a pack that `burgee check` accepts on every reading, and no reading
comes near the 12-turn cap (max under 12). The median target belongs to
[`locale-pack-in-five`](../intents/locale-pack-in-five/intent.md) S3. The case runs weekly beside
the plugin eval.

**Why.** "One turn" was never the eval's unit. D-143 defines a turn as one user prompt, and the
runner counts `num_turns`: one per tool call, plus one. The prompt asks for at least four calls
(read the schema, read the example, write, run `check`), so the floor is 5. The bar that
D-20261012-agent-eval-turn-budget set has two halves:

- **No run near the cap.** This is what "the agent can do it from the schema" means, and it is the
  half this criterion holds.
- **A median under 6.** This is how efficiently the agent does it. `locale-pack-in-five` holds it,
  because that intent exists to move it, and D-20261020-locale-pack-in-five-design-gate shows its
  remaining gap is an environment probe that no burgee change reaches.

If both intents held the median, one number would gate two intents.

**Measured, 2026-10-20.** Every `Agent Evals` run that day executed the case: 34 readings, all
passed, median 6 and max 8. The branch dispatch (run 39475810887) gave 6, with its transcript in
the decision above. **The criterion's text is met.**

**What still keeps the intent from `shipped`:**

- **A scheduled weekly run.** Every reading above came from a pull request. The last scheduled
  run, 2026-10-15, recorded the case `not-run` with reason `usage-limit`, correctly since
  `evals-record-not-run`. The next scheduled run is 2026-10-22.
- **The minor that carries this pull request, published.** The intent stays `approved` until both
  are true.

## No Quint model for locale resolution

A model earns its place where state changes over time, or where steps can interleave. There is
neither here.

- **`resolveLocale(option, env)` is a pure function** of two values, each read once per run. It
  takes the first non-empty value of a fixed list and normalises it. When an agent is detected, the
  list is shortened. There is no state before or after it.
- **`candidatesOf(tag)`** returns the tag and its bare language, at most two values.
- **`localiserOf(plugins, locale)`** is a deterministic fold over the registered plugins:
  - least-specific tag first;
  - registration order within a tag;
  - each pack checked before any of its messages is used.
- **No interleaving.** Nothing is cached across runs except the compiled catalog patterns. Those
  are a pure function of the committed catalog.

`locale.test.ts` pins every case of the order: an empty value skipped; `C`, `POSIX` and `C.UTF-8`;
`de_DE.UTF-8` to `de-DE` to `de`; `@latin`; agent detection ignoring `LANG` and `LC_ALL`.
`locale-invariance.test.ts` (17 cases) pins the property that matters: no machine surface changes
under any locale.

**Rejected:**

- **A state machine over environment changes.** The environment is read once per run, so there is
  no transition to model.
- **A model of pack merging.** It would restate a two-level loop that the tests already enumerate,
  and it would have no witness that the tests lack.

**Reversal:** if the locale ever becomes mutable within a run, model it then. A REPL that switches
language, or caique re-reading `Runtime.locale` mid-prompt, would each count.
