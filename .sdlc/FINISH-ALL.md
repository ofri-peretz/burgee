# Finish all packages, and make each one sellable

**Decision, 2026-09-17:** every package in this repo gets finished and positioned. Not a
subset. This file is the living tracker for that program; it is a program tracker like
`.sdlc/PLAN.md`'s siblings, not an intent — each package's own `intent.md` + `design.md`
under `.sdlc/intents/<slug>/` stays the acceptance artifact.

## The number the compat page implies is wrong

Read as a scoreboard, `compatibility.mdx` suggests ~1,000 cases of gap. **The gradeable gap
is 385**, and the difference is not progress — it is one host whose suite cannot be passed
without abandoning the package that targets it.

**Corrected 2026-09-20, after measuring three of these rows.** 385 was itself too high by 13.
`ansi-escapes` was listed at 3 and its real gap is **zero** — three of its four cases are
CSI, which paratext states out of scope, so the row's ceiling is 1 and it is already there.
`terminal-link` was listed at 10 and is now **8 / 10 built**, the last two a ceiling rather
than a gap: they require reading inside another package's module object, which a
zero-dependency façade cannot do and should not want to. Two premises out of three died on
contact with a measurement, which is the argument for measuring a premise *before* building
against it.

| Host | Target | Now | Gradeable gap | Kind |
| :--- | :--- | ---: | ---: | :--- |
| cli-table3 (internals) | `flagstaff/cli-table3` | 0 / 104 | 104 | gap |
| lilconfig | `seniority` | 0 / 77 | 67 | gap + a **permanent** 10-case blind spot |
| dotenv | `seniority` | 74 / 141 | 67 | gap |
| cosmiconfig | `seniority` | 186 / 243 | 57 | gap |
| inquirer-core | `caique` | 0 / 41 | 41 | gap |
| term-img | `paratext` | 0 / 18 | 18 | gap |
| clack | `caique` | 0 / 606 | **17** | design disagreement |
| ~~terminal-link~~ | `paratext/terminal-link` | **8 / 10** | 0 | **built 2026-09-20 — 8 is the ceiling** |
| ~~ansi-escapes~~ | `paratext` | 1 / 4 | **0** | **already at its ceiling** |
| rc | `seniority/rc` | 0 / 1 | 1 | target not built |
| meow / cac / citty | `burgee/*` | planned | — | three unbuilt front-ends |
| signal-exit | `closeout` | planned | — | control below its own reference |

Thirteen rows are already 100%: commander 1360, yargs 804, chalk 58, ora 99, log-update 99,
boxen 84, string-width 229, strip-ansi 8, wrap-ansi 80, slice-ansi 15, cross-spawn 68,
restore-cursor 6, exit-hook 21.

## Three findings that decide the route

### 1. The zeros are missing façades, not failing code

Every row at 100% targets a **dedicated drop-in subpath** — `roundel/chalk`,
`flagstaff/ora`, `linegauge/wrap`, `bellpull/cross-spawn`. Every row at or near zero targets
the **package root**: `caique`, `paratext`, `seniority`. A root export presents the package's
own native API, which will never match an incumbent's, so the suite scores zero against a
package that may already have the capability one import away — `paratext` has `./link` while
`terminal-link` grades the root at 0 / 10.

The route is therefore the one the finished packages already prove: give each incumbent its
own façade subpath. `paratext/terminal-link`, `paratext/term-img`, `paratext/ansi-escapes`,
`seniority/lilconfig`, `seniority/rc`, `caique/inquirer`, `closeout/signal-exit`, and the
three `burgee/meow`, `burgee/cac`, `burgee/citty`.

**The counter-rule from cli-table3's note stands:** never name a façade in a host row before
it exists, or the row publishes "target not built yet" where a measured number belongs. Build
the subpath, then point the row at it.

### 2. clack's suite cannot be passed, and should not be

289 of clack's 444 assertions are `toMatchSnapshot()`, across 17 of its 19 files: the suite
grades clack's **exact drawing**. A façade that matched them frame for frame *would be*
clack — and caique's design rejects wrapping clack precisely because it "has no static
projection to give" (U3). What remains once the drawings are set aside is `limit-options`
(14) and `guide` (3).

So `clack` is not 589 cases of work. It is a **positioning statement**: caique answers the
same problem with a static projection, which is why it does not draw the same frames, and the
17 behavioural cases are the ones that grade behaviour rather than pixels. Publishing 0 / 606
without that sentence beside it understates the package and overstates the debt.

Open question for the owner: whether the row publishes `17 / 17` against a stated subset, the
way `cli-table3` subtracts its nine legacy self-tests, or stays a measured 0 / 606 with the
explanation. Default taken if unanswered: the `cli-table3` shape — subtract with the reason
written into `conditionalCases`, because a number nobody can act on is not a measurement.

### 3. The harness fix that was going to retire two blind spots does not — measured

`run.ts` maps `jest.mock` to `vi.doMock`, the runtime form, which cannot hoist. The plan
here said rewriting `jest.mock(` to `vi.mock(` in the transform — so vitest's own hoister
sees it syntactically — would retire **10 of lilconfig's 77** and clack's 30-case allowance
together, and called it the highest-leverage change in the programme.

**It was built and it moves nothing.** A `pre` plugin on the generated vitest config,
rewriting the graded file's text before vitest parses it, verified to fire on
`src/spec/index.spec.js`:

```
with the rewrite      67 passed, 17 failed
without the rewrite   67 passed, 17 failed
clack control         576 / 606, both ways
```

The cause is one layer below the hoist. `index.spec.js` is CJS and takes its `fs` through
`require('fs')`, which resolves through Node rather than through vitest's module runner — so
no `vi.mock` of a builtin reaches the test's own binding however early it is hoisted.
`fs.promises.access.mock` is `undefined` at the assertion, which is exactly what the failure
says. Inlining the target (`server.deps.inline`) was tried and moved nothing either.

Those ten cannot be graded under vitest without editing upstream's suite, which is the one
thing this oracle may never do. They stay a declared blind spot **with no retirement date**,
and the transform was reverted rather than kept, because a harness change that fixes nothing
is a harness change somebody will later mistake for one.

The cost of the wrong premise was about forty minutes. The cost of having kept it would have
been a plugin in the harness forever, and a note promising a fix that had already happened.

## Order

Cheapest-to-complete first, because each finished package is a sellable claim and a
half-finished one is a liability on npm today.

1. ~~**Harness** — `jest.mock` → `vi.mock` in the transform.~~ **Struck 2026-09-20: built,
   measured, reverted.** See finding 3 — the ten are structural, not harness, and lilconfig's
   gradeable gap is 67 rather than 77.
2. **paratext** — three façades, 31 cases. Finishes a package that is public at 1 / 4.
3. **seniority** — `rc` (1), `lilconfig` (67), `cosmiconfig` (57), `dotenv` (67). The
   largest real gap, and `explain` is the differentiator nobody else has.
4. **caique** — `inquirer` façade (41), then clack's 17 and the positioning statement.
5. **flagstaff** — cli-table3's 104 internals, with the control at 103 / 104 as the bar.
6. **burgee** — `meow`, `cac`, `citty` front-ends.
7. **closeout** — `signal-exit`, once its control clears its own reference.

## Not compat, and required before "sellable"

- **The `Benchmarks` gate has been red on main since 2026-09-15 17:11 UTC.** The published
  claim `core-under-52kb-bundled` is broken at 57,880 against 53,248, plus six ratchets.
  Attributed: `main` measured 56,857 and #361 added 1,021, so 15,857 of the overrun predates
  it. `completions.js` is 7,763 B of the root bundle — `execute.ts` reaches it through
  `await import(…)`, which esbuild inlines under `--outfile`. Either the optional surfaces
  (`completion`, `--mcp`, `--schema`, plugins — about 17.7 KB) become opt-in, or the 52 KB
  claim is restated at the measurement. A bands decision; not a ratchet raise.
- **Four packages are public and not ready**: paratext 0.3.0 at 1 / 4 vs ansi-escapes,
  caique 0.2.0 at 0 / 606 vs clack, seniority 0.2.0 at 0 / 77 vs lilconfig. Each README
  leads with the gap until the row is green.
- **`changesets-pr.yml` states the wrong cause.** Its comment claims the default token
  "keeps this workflow working"; that token is precisely the one that raises no workflow runs,
  so the Version PR sits at 0 checks against 3 required and is permanently BLOCKED. Worked
  around on #299 by closing and reopening the PR under a human credential. Fix the comment,
  and set `RELEASE_BOT_PAT` to end it.

## Sellable, per package

Each package ships one sentence naming a real defect or gap in the incumbent, with a number
behind it. Where that sentence does not exist yet, it is the work — not the README.

- **bellpull** — cross-spawn routes every Windows spawn through `node`, wrong for a `.cmd`, a
  `.bat`, or a non-node shebang. 68 / 68 on its suite, and the bug fixed. *Strongest in the
  family; 20 downloads a week.*
- **linegauge** — cliui's vendored `stripAnsi` mishandles the ITU T.416 sub-parameter form
  `ESC[38:2::255:0:0m`, what chalk emits for truecolor, measuring 13 columns as 25. Four
  packages become one that measures text correctly.
- **burgee** — an existing commander CLI becomes an MCP server by changing one import, and
  commander's own 1,360 tests prove nothing broke.
- **flagstaff** — a spinner with a static projection: renders nothing for CI, a non-TTY, or
  an agent, from the same declaration.
- **seniority** — `explain` answers *why this value won*, which no incumbent answers.
- **closeout** — exit handlers that run exactly once on every path.
- **caique** — prompts with a static projection, which is why it does not draw clack's frames.
- **roundel** — one output policy and semantic tokens over a drop-in chalk. *Weakest pitch
  standalone; needs the token layer to lead, not the chalk parity.*
- **paratext** — hyperlinks and images with a declared fallback. *Pitch pending the façades.*
