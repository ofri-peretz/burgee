# Design — U5 is a published claim and it is false

Intent: [`intent.md`](./intent.md). **Status:** review — this design records a decision that
has not been taken, and deliberately implements nothing.

---

## Requirements

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | the breach is measured, reproducible and named module by module | `npm run bench -- --axis weight --check` |
| R2 | **Not built** | the ratio is at or below 1 | the same command; it reads 1.038 |
| R3 | **Not built** | or the claim is restated in `weight.ts` and on the published page | `docs.test.ts` |

## Design

**Nothing is implemented here on purpose**, and that is the design decision.

Three routes exist and two of them are refused:

1. **Drop `completion <shell>` from the yargs front-end.** Measured: ratio **0.962**, 4,177 B
   spare. It works, and it removes a graded behaviour from a published entry point — a product
   decision about what `burgee/yargs` is. Not an agent's to take.
2. **Switch B4 to code splitting.** Measured: all five gates pass, `burgee/yargs` entry chunk
   106,676 B, ratio 0.960. **Refused.** Total emitted bytes are essentially unchanged, so the
   user ships the same bytes; U5 says *"no heavier in a user's bundle"* and a lazily-loaded
   chunk is in the bundle. This is changing the instrument until the number agrees.
3. **Restate U5.** Honest and available. It needs the owner to say what the claim becomes,
   because a claim is a promise to a reader and not a variable.

Until one is chosen, the gate stays red and says why — which is the only outcome that costs
nothing and hides nothing.

## Verification

`npm run bench -- --axis weight --check` — currently six failures, of which
`burgee/yargs ÷ yargs bundled-bytes-ratio` is this one. It is *supposed* to be red.

## Rejected alternatives

- **Raising the ceiling to the measurement.** That is what the other four weight gates did,
  and it is right for a *ratchet* — a number watching for drift. U5 is not a ratchet: its
  ceiling is 1 because the claim is "no heavier", and moving it deletes the claim silently
  while leaving the sentence in place.
- **Leaving it undocumented.** It was: the published benchmark page still reads **0.906** from
  the 2026-09-09 measurement, which predates the plugin host. A stale figure that flatters is
  worse than a red gate.

## Out of scope

The other five weight gates. They are ratchets at measured values and are handled as such.
