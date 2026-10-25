---
id: D-20261020-colour-facades-colorette-twist
subject: 'colour-facades R2: how does compat-oracle grade a suite whose runner, twist, exits 0 on failure, and what does `roundel/colorette` weigh?'
taken: 'twist runs once per file and is graded by the `Tests:` counts it prints, never its exit code; a file it cannot load is one failure, a run with no summary an error. colorette ships graded 67 / 67 at 2,408 B against 2,602, budgets set at the measurement (2026-10-20)'
date: '2026-10-20'
superseded_by: —
---

**The runner reads twist's counts.** colorette's `npm test` is `c8 twist` over its three
`tests/*.test.js` files, and twist calls `process.exit(0)` after drawing its view whatever the
view says: against colorette 2.0.20 itself, off a terminal, it printed
`Tests:  58 failed, 9 passed, 67 total` and exited 0. The `exit-code` arm would have graded that a
pass, and no TAP arm can read it, because twist prints no TAP. So `runner: 'twist'`
(`compat-oracle/src/twist.ts`, spawned by `runTwistFiles` in `run.ts`):

- **twist's own CLI, pinned beside the suite** (`suiteDeps: ['twist@0.0.5']`), and refused when it
  is not pinned, as the tsd arm refuses an unpinned tsd: a walk up the tree would find whichever
  twist it found.
- **One spawn per file.** twist imports every file before it checks one, so one failed import
  exits the whole run 1 having counted nothing. Per file, that costs the one file.
- **The last `Tests:` line, colour stripped** (through `linegauge/strip`, the family's layer for
  it, which makes `linegauge` a dependency of compat-oracle), and only when its counts add up to
  the total it prints. With `CI` unset twist redraws the whole view on every assertion; the last
  frame is the finished one — and only when its `Suites:` line has nothing `running`: a case
  whose callback never settles leaves Node nothing to wait on, and twist then exits 0 with a last
  frame reading `Suites: 1 running` over counts that look whole (measured on 0.0.5). That is an
  error, not the passes drawn before it.
- **A non-zero exit is one failure of that file**, never a pass and never nothing: the control's
  reference still divides the target, as it does for a node:test file that dies at load. A
  killed run, or an exit 0 with no summary that adds up, is an error, because twist does neither
  when it runs to the end.
- **No exclusions.** twist names failing cases and never passing ones, so there is nothing to
  exclude by; `summarize` already refuses an exclusion on a runner without case lines.

Proved red first: `twist.test.ts` grades a real twist 0.0.5 run of two passes and one failure,
after asserting twist's own CLI exits 0 on it; with the arm's one dispatch line removed, its
three end-to-end cases fail.

**Upstream CI's environment** is the host's `env`: `NODE_ENV=development` (the job), `FORCE_COLOR=`
(the step: present and empty, which colorette reads as forced) and `CI=true` (GitHub Actions'),
under which twist draws once. The upstream watch reads twist's `t('…')` titles (`testNames`, for
a twist host only, so no other host's recorded titles move).

**Budgets, none raised.** B4 `roundel/colorette` 1,900 (1,777 measured against colorette's
1,973 for a program importing `red`, 0.901, plus the 80 B CI margin rounded up to the next
fifty, red at 0 first); `DROP_IN_CEILINGS` 2,602, colorette's whole surface by the page's
method, against 2,408 for ours; `./colorette` 2,900 B of reachable `dist` in roundel's
`weight.test.ts` (measured 2,814 with `runtime.js`, against colorette's own `index.js` at
3,381). The on-disk figure carries the three named close codes lint asks for; the bundled ones
do not, because a minifier inlines them.

**Alternatives rejected.**

- *A driver that imports twist's `run()` and prints TAP per assertion.* It would give case names,
  but it grades through code of ours standing in for upstream's runner; the brief was to read
  twist's own counts, and the counts are what the gate needs.
- *One twist run over all three files.* Upstream's shape, but one failed import would zero the
  whole suite, which is the target-wide loss a per-file run exists to avoid.
- *Matching ANSI with a regex in twist.ts.* `inline-implementation-lock` names that linegauge's
  job, and compat-oracle can depend on a family package.
