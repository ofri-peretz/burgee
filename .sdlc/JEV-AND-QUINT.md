# Jev and Quint in the roadmap loop

Two tools, two stages, one handoff between them:

| Stage | Tool | Job | Artifact |
| :-- | :-- | :-- | :-- |
| 1 Plan | **Jev** ([TypeSafe](https://docs.typesafe.ai/introduction)) | rank and route `intent.md` drafts | a triage table, pasted into the intent PR |
| 2 Design | **Quint** ([quint-lang.org](https://quint-lang.org)) | state the design's state machine and check it | `<slug>/<name>.qnt` beside `spec.md` |

Jev *judges*; Quint *proves*. A wrong Jev answer is caught by a human at the Design gate. A
wrong Quint invariant is caught by a counterexample trace. That is the whole reason both are
safe to automate.

## Stage 1 — Jev triages intents

Jev is a decision model, not a chat model: it takes a **state** (the `intent.md` text) and
**typed questions**, and returns typed answers with a calibrated confidence. It cannot write,
count, or do date math — so it never computes priority, it only supplies the judgements a
weighted sum in code combines (TypeSafe's
[composite scoring](https://docs.typesafe.ai/patterns/composite-scoring) pattern).

The questions, asked of every intent in `draft` or `review` in one call each:

| Key | Type | Question | Used for |
| :-- | :-- | :-- | :-- |
| `user_impact` | Score 0–3 | How many users of the drop-in surface does this change? (none / a niche / a common path / every install) | rank, weight 3 |
| `incumbent_gap` | Score 0–3 | How far does this close a gap against the incumbent named in the intent? | rank, weight 2 |
| `risk_reduced` | Score 0–3 | How much breakage, hang or data loss does this remove? | rank, weight 2 |
| `ready_for_spec` | Noul | Does the intent state a success criterion a test could check? | gate: below 0.6 → back to the author |
| `needs_model` | Noul | Does the behaviour involve states, ordering, concurrency, retries, deadlines or exactly-once? | **routes to Quint**: above 0.7 → `spec.md` must carry a `.qnt` |

Rules:

- **Questions and thresholds live in one file** (`.sdlc/jev/questions.json` when it lands) and
  change only by PR. TypeSafe's own guidance: these constants are the thing a human reviews,
  and agents write poor questions.
- **Confidence-gated.** An answer under 0.7 confidence is shown as `?` and decided by a human.
  Jev never moves an intent's status; it orders the queue.
- **No key, no run — `skipped`, never `failed`**, the same contract as eval layer 2. The key is
  `TYPESAFE_API_KEY`.

## Stage 2 — Quint models the design

When `needs_model` fires (or the author says so), `spec.md`'s **Design** section gets a model:
the prose state machine written as Quint, beside it, with:

- **`val safety`** — the conjunction of the guarantees the requirements state, each one a
  named `val` that cites its `R<n>`. `models.yml` checks every tracked `.qnt` against `safety`;
  a model without it fails, so a model cannot land unchecked.
- **One action per JavaScript turn.** The gaps between actions are exactly the `await`s.
  Coarser hides the races; finer models V8.
- **A mutation check before merging.** Break the model three ways that each requirement says
  cannot happen and confirm `safety` fails each time. A model that cannot fail is decoration.
- **Open questions as expected violations.** A property the spec has not decided is written
  as a `val`, checked in CI as *expected to be violated*, and listed under the intent's
  `## Open questions`. The day the code changes and it starts holding, CI goes red and the
  question has to be answered.

Run one locally:

```bash
npx @informalsystems/quint run .sdlc/intents/closeout/registry.qnt --invariant=safety --max-steps=30 --max-samples=20000
```

### Pilot: `closeout/registry.qnt`

The run-exactly-once shutdown registry. Four guarantees — exactly-once (R1), phase order,
`restore` always runs (R4), honest report (R3) — hold across 20 000 random 30-step traces. Three
deliberate mutants (re-invoking passed phases in `rest`, waking before handlers settle, never
parking) are each caught in under a second.

What it found: **`add()` during a run is silently dropped when it lands in a phase the run has
already passed** — counted in `size`, never invoked, absent from the report. Confirmed against
the real `registry.ts`. Raised in [`closeout/intent.md`](./intents/closeout/intent.md) and escalated as [`D-20261011-closeout-late-add`](./decisions/D-20261011-closeout-late-add.md).

## Ceilings

- Simulation, not proof. `quint verify` (Apalache, exhaustive to a bound) needs a JDK 17 and
  minutes per model; add it to `models.yml` when a model's bug would cost more than that.
- The model is hand-written from `registry.ts`; it drifts if the code does. `models.yml` runs
  on changes to `packages/closeout/src/**` so a drift that breaks an invariant shows, but a
  drift that the model simply does not describe does not.
