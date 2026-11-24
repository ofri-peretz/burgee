# Design — `rulehome` joins the family: rule placement as a burgee program

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. Imported with history.** `packages/rulehome` comes from `~/repos/rulehome` by
  `git subtree add --prefix packages/rulehome`, so its 7 commits stay readable. `private: true`
  until the release gate says otherwise.
- **R2. TypeScript, on burgee.** The five modules (`audit`, `homes`, `skills`, `agents`, `intent`)
  become `.ts` beside their tests; `bin` is one burgee program with commands `audit`, `skills`,
  `agents`, `intent`. Every command declares its options and its `--json` result type, so `--schema`,
  MCP and completions come from the declaration.
- **R3. `audit <dir>`** returns `{ moves: { line, file, at, home, check? }[], kept: number }`: each rule
  line whose cheapest home is not where it sits, with the check that would hold it for homes 1–3
  (a lint rule id, a hook step, a contract). Text output lists moves only; `kept` is a count.
- **R4. `skills <files…>`, `agents <files…>`** keep today's checks (verb-last names from the fixed
  verb list, "Use when…" descriptions, duplicates over the overlap threshold; tool allowlists, model,
  `maxTurns`). Each finding: `{ file, rule, message, fix }`.
- **R5. `intent` delegates.** `rulehome intent <base> <head>` runs `contractdiff diff <base> <head>
  --decisions error --json` and maps its decision findings to rulehome's output. Its own marker
  walker (`checkMarkers`, `checkBreaking`) is deleted. A deprecation notice says it goes in the
  next minor; `audit` names `contractdiff diff --decisions` as the Contract home's check.
- **R6. Deterministic.** No clock read except `--today` (default today, pinned in tests); output
  sorted by file then line.
- **R7. The case study is a test.** `case-studies/snappy-client-dashboard` becomes a fixture
  (rule files only, no source) and `audit` on it returns the counts the published case study states (rule lines, and moves).

## Design

Order: (1) subtree import as is, tests running under `node --test` in the package; (2) port to TS,
tests to vitest; (3) burgee program; (4) `intent` delegates once `apicontract-diff-decisions` has
merged (#1707); (5) case-study fixture. Each step is a PR, green alone.

`homes.ts` keeps the seven homes and `suggestHome(line)` as data: a rule line's keywords and verbs
choose the home. That stays a heuristic and is labelled one in the output (`home` is a suggestion
with its reason), because which home a sentence belongs in is sometimes judgment; the decision tree
from the README is what it encodes.

## Verification

`npx vitest run packages/rulehome` for every step; the case-study test (R7) and one planted line per
home are the checks that fail when classification regresses. The mutation gate runs on push as for
every package.

## Rejected alternatives

- **Rewriting from scratch.** 336 lines with tests already hold the vocabulary; porting keeps them.
- **Keeping `intent`'s own walker.** Two marker implementations drift; contractdiff's is the one with
  13 requirements and a mutation score.
- **A model call to classify lines.** Code decides facts; the classification is a labelled heuristic.

## Out of scope

Hooks, rulebook, proof and replay (their own intents: hookset, triggerlist, provedone, replz).
