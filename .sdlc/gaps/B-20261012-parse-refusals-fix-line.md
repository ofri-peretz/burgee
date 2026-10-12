---
id: B-20261012-parse-refusals-fix-line
section: B
status: open
source: parse-refusals R4
recommendation: 'build R4 in the next release cycle, when artifact-size-baseline.json is re-measured for it, or after a trim elsewhere in burgee frees 492 gzipped bytes; until then a refusal teaches with the usage line, as every usage error without a fix does'
---

parse-refusals R4 is the `fix` line on its two refusals: the line as typed with the surplus
words, or the earlier values of a repeated flag, left out, so an agent's retry is one turn. It
was built and reviewed in #1064 and then taken out of that PR, because it no longer fits the
package budget.

Measured on 2026-10-12 against `main` at `10edb48`, by `npm pack --dry-run` of `burgee`:

- `main`: 246,973 B gzipped, against the 247,805 that `.sdlc/bands/artifact-size-baseline.json`
  allows (225,278 plus `check-published-artifacts.ts`'s 10%).
- R1–R3 with their catalog entries: 247,690 B, 115 under.
- R1–R4: 248,182 B, 377 over. R4 is 492 B of it: the omitted-word offsets, the guard that
  leaves the fix out when one word parsed as two flags, and the `failure.ts` line that turns
  them into `fix`.

The locale catalog (#1044) and `--mcp --print-config` (#1048) merged while #1064 was in CI,
and they took the room it was measured into. The rule is that a budget is not raised to fit a
requirement, so this needs a decision: re-measure the baseline for a release that carries R4,
or name the bytes to trim. The built code and its tests are on #1064's earlier head `678c9a4`
(`parse-refusals.ts` `refuseDropped`, `repeated`, `spelled`; `failure.ts` `carried`;
`json-failure.test.ts` › `parse-refusals R4`).
