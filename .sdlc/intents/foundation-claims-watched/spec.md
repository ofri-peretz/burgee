# Design — The foundation's published numbers are watched and benchmarked

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — The list grows first.** `KNOWN` gains every incumbent in `foundation-ceilings.json`, plus
  lilconfig, tinyexec, onetime, cli-cursor, cli-truncate, widest-line, find-up, meow, ink and
  `@inkjs/ui`. The lock's existing "every cited competitor is declared" assertion then fails for
  the six packages, which is the red this intent starts from.
- **R2 — `seniority` and `bellpull` declare.** One `competitors.json` each, per subpath, with
  `claim` `compat` where `GRADED` has a row and `weight` where only a figure is cited. `seen` is
  `null` until the watch fills it.
- **R3 — `closeout` and `linegauge` declare.** The same, for their subpaths.
- **R4 — `paratext` and `controlroom` declare.** The same. `controlroom/ink` declares ink and
  `@inkjs/ui` as `compat`.
- **R5 — Every published package must declare.** The lock adds the upstream-watch success
  criterion as an assertion: a package that is published (has a version and is not private)
  and has no `competitors.json` fails.
- **R6 — Two B4 pairs per package.** `PAIRS` gains `seniority/lilconfig ÷ lilconfig`,
  `seniority/dotenv ÷ dotenv`, `closeout/exit-hook ÷ exit-hook` and `closeout/signal-exit ÷ signal-exit`.
  Each gates at 1 when it measures under 1, and as a ratchet at its measurement when it does
  not, with a `weight.ts` comment saying which.

## Design

R1–R5 are data and one assertion. The watch already iterates every `competitors.json` it
finds, so no workflow changes. R6 reuses the pair machinery as the other eight packages do.
Fixtures import the default export on both sides where the incumbent has one, so the
comparison is like for like.

Order: R1 with R2 (the lock goes red, then green within the PR), R3, R4, R5 last of the
declarations, then R6 in its own PR.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1–R4 | `scripts/competitors-lock.test.ts` | widening `KNOWN` alone makes the citation assertion fail for each of the six READMEs that name an incumbent beside a figure |
| R5 | the same file, new case | before the six files exist, it lists them |
| R6 | `npm run bench -- --axis weight --check`; `benchmarks/weight.test.ts` | the pair is added with a placeholder ceiling of 0, which fails, before the measured ceiling is set |
| watch | the next `compat-upstream.yml` run | each new `seen` is `null` until it runs |

## Rejected alternatives

- **One central competitors file for the foundation.** upstream-watch decided per-package
  files (D-039), so a deleted package takes its competitors with it.
- **Make the foundation incumbents hosts.** Most are already hosts for grading. The competitor
  entry is a separate, lighter declaration (D-042), and mixing the two was rejected there.
- **Gate the exit-hook pair at 1 and let it fail.** If it measures over 1, the failing gate is
  a known state, not news. A ratchet at the measurement stops it growing, and the README states
  the comparison honestly, as `paratext` does.

## Out of scope

- Changing `upstream-watch`'s own status. That is a status correction listed in
  `next-wave-3-2026-10.md` step 0, not part of this design.
- Re-measuring and rewriting `foundation-ceilings.json` itself (`npm run weight:converge` owns
  it). The watch reports a moved incumbent, and a person decides.
- Runtime pairs for seniority and closeout. Weight is the published claim. Speed is unmeasured,
  and is stated as such.
