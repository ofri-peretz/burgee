# Finish all packages, and make each one sellable

**Decision, 2026-09-17:** every package in this repo gets finished and positioned. Not a
subset. This file is the living tracker for that program; it is a program tracker like
`.sdlc/PLAN.md`'s siblings, not an intent — each package's own `intent.md` + `spec.md`
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
| ~~cli-table3 (internals)~~ | `flagstaff/cli-table3` | **103 / 104** | 0 | **closed 2026-09-21 — equals the control** |
| lilconfig | `seniority` | 0 / 77 | 67 | gap + a **permanent** 10-case blind spot |
| dotenv | `seniority` | 74 / 141 | 67 | gap |
| cosmiconfig | `seniority` | 186 / 243 | 57 | gap |
| inquirer-core | `caique` | 0 / 41 | 41 | gap |
| term-img | `paratext` | 0 / 18 | 18 | gap |
| clack | `caique` | 0 / 606 | **17** | design disagreement |
| ~~terminal-link~~ | `paratext/terminal-link` | **8 / 10** | 0 | **built 2026-09-20 — 8 is the ceiling** |
| ~~ansi-escapes~~ | `paratext` | 1 / 4 | **0** | **already at its ceiling** |
| rc | `seniority/rc` | 0 / 1 | 1 | target not built |
| ~~meow~~ | `burgee/meow` | **132 / 148** | 16 | **built 2026-09-21 — control 146 / 148** |
| cac / citty | `burgee/*` | planned | — | two unbuilt front-ends |
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

## What is left, as of 2026-09-21

**Nothing on an active row is a gap.** Every remaining case is a ceiling with a named
cause, and D-097 lists them one by one. The number this file opened with — "the gradeable
gap is 385" — was a premise, and measuring it took it to zero: `ansi-escapes` and
`terminal-link` died on contact in September, `cli-table3`'s 104 closed on 2026-09-21 when
the thirteen "ceiling" cases turned out to be the shim, and everything else was already a
decision somebody had taken (constraint 3 for cosmiconfig's YAML, R11 for dotenv's and rc's
ambient environment, D-030 for term-img, U6 for clack's last case).

So the programme is now three unbuilt front-ends and one control that cannot clear its own
reference. That is a much smaller and much more honest statement than this file made when
it was written, and it is what the order below should be read against.

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
5. ~~**flagstaff** — cli-table3's 104 internals, with the control at 103 / 104 as the bar.~~
   **Done 2026-09-21 at 103 / 104, the bar exactly.** The thirteen the row called a ceiling were the
   instrument: the shim re-exported the target's whole entry at `../src/cell`, so a suite asking for the
   `Cell` class got the `Table` class. `internalExports` names the export per internal path on a target
   run, and the façade hangs `ColSpanCell`/`RowSpanCell` off `Cell` the way cli-table3's own
   `src/cell.js` does. The one case left is `cell-test.js` dying at load, which costs the control the
   same. **A third premise in this file died on a measurement**, after `ansi-escapes` and
   `terminal-link` — which is the argument for measuring a premise before building against it.
6. **burgee** — `meow`, `cac`, `citty` front-ends.
   **meow's harness is ready as of 2026-09-21, and getting there found four defects.** The
   row's own configuration was wrong three ways — `runner: 'node:test'` where the suite is
   ava, one import path where two files reach `../build/index.js`, and `reexportDefault:
   false` where meow's whole API *is* its default export, which made the generated shim
   fail every file with "does not provide an export named 'default'". Underneath it the
   harness was wrong three more ways: the runner was resolved from the workspace rather
   than the host's pinned tree (this repo hoists **ava 8.0.1**, meow's suite wants the
   **6.4.1** its `suiteDeps` installs, and ava 8 against those files prints
   `1..0 / # tests 0 / # fail 32` — a suite of zero reported as thirty-two failures);
   ava's CLI entry is `cli.js` on 8 and `cli.mjs` on 6, and its exports map admits neither
   by name; and the walk handed ava the 24 `fixtures/` CLI programs the tests spawn, which
   is where `failed 22` beside `passed 144` came from. Pruned and pinned, the control reads
   **148 cases · 144 passed · 4 failed · 18 graded files**, and the four are the
   reference's own. `vendor()` also turned out not to write `PROVENANCE`, so re-vendoring
   through the oracle deleted a file its own lock requires — fixed separately.

   **Built 2026-09-21: `burgee/meow` grades 132 / 148 (89.2%) against a control of 146 / 148.**
   meow is one function over `yargs-parser` and burgee already ships its own for
   `burgee/yargs`, so the façade took nothing new into the tree. It lives in `src/meow.ts`
   with its parts in `src/meow/` — the shape `commander/` and `yargs/` already use — and
   costs 59,820 bundled bytes, of which the option contract is about 16 K and the parser is
   the rest. Upstream meow looks lighter only because it *depends* on yargs-parser instead
   of carrying it.

   **The sixteen it does not pass, and none of them is a guess.** The largest group is
   `--no-`-prefixed boolean flags: a fixture declares `noAutoVersion`, and burgee's parser
   negates `autoVersion` before it matches the declared name, so the flag arrives under two
   keys and the unknown-flag check reports one of them. That is a `yargs-parser` question,
   not a meow one, and fixing it there is the next move. The rest are single cases — a
   one-line help block's exact trailing newline, `-F` casing through the camel-case
   expansion, and `normalize-package-data`'s lazy mutation, which meow gets from a
   dependency this repo will not take.

   Two of the control's own two moved on the way: the vendored root now carries upstream's
   `description`, because meow's help block opens with `pkg.description` and three cases
   assert the string “CLI app helper”. Without it they failed for the control exactly as for
   the target — a ceiling the harness had put there rather than one either implementation
   earned.
7. **closeout** — `signal-exit`, once its control clears its own reference.

## Extensibility, measured 2026-09-21

PRINCIPLES 7 asks three things of a plugin surface. Only the first is built everywhere.

| | plugin + schema | `validate` | `check` command | weekly eval |
| :--- | :---: | :---: | :---: | :---: |
| flagstaff | ✅ | ✅ | ✅ | ✅ |
| burgee | ✅ | ✅ | ❌ | ❌ |
| bellpull, caique, closeout, paratext, roundel, seniority | ✅ | ✅ | ❌ | ❌ |
| linegauge | ❌ | — | — | — |

**One `check` command and one eval case, against eight declared surfaces.** A surface nobody
can check is a surface nobody outside this repository can write against. `check` cannot be
shared — flagstaff's is 200 lines rendering a spinner in five output modes, and each
package's would render its own contribution kinds — so this is seven builds, not one.

PRINCIPLES also names where the demand is, and it is not evenly spread: chalk closes feature
requests by policy and still carries *"Semantic Theming / Profile Support"* and *"Implement
Custom Color Presets"* among seventeen declined, so **roundel's theme surface is the one with
evidence behind it**. `seniority` carries three open ones (cosmiconfig TOML, c12 rc-format,
c12 vite-loader). Those two come first.

`scripts/extension-surface-lock.test.ts` holds the table above: the gap can close, it cannot
drift, and a package that grows a `check` must grow an eval in the same commit.

## Not compat, and required before "sellable"

- **The `Benchmarks` gate has been red on main since 2026-09-15 17:11 UTC**, and two
  decisions now sit on it. The published claim is **settled**: every row of the README claim
  table was restated at its measurement on 2026-09-20 and five of six read *not met*, with
  `claim-table-lock.test.ts` holding it there. The **ratchets are not**, and deliberately so
  — **D-073** refuses to raise seven ceilings at once, because `weight.ts` already records
  what that costs ("a ceiling moved per PR is a record of what happened, not a limit on it",
  written after four raises in one session). **D-074** records the sharper question: the B4
  axis says it measures "what a user's application grows by" and bundles with esbuild
  `--outfile`, which *inlines* `await import()`, so `completions.js` is counted as startup
  weight that no real bundler would load at startup. Both are the owner's, both have a
  default, and until one is taken **this gate stays red and every report says so.**
  Attributed: `main` measured 56,857 and #361 added 1,021, so 15,857 of the overrun predates
  it. `completions.js` is 7,763 B of the root bundle — `execute.ts` reaches it through
  `await import(…)`, which esbuild inlines under `--outfile`. Either the optional surfaces
  (`completion`, `--mcp`, `--schema`, plugins — about 17.7 KB) become opt-in, or the 52 KB
  claim is restated at the measurement. A bands decision; not a ratchet raise.
- **Four packages are public and not ready**: paratext 0.5.0, caique 0.4.0 and seniority
  0.4.0 (versions from `packages/*/package.json`, 2026-09-22) still trail their incumbents'
  suites — the current scores are rows A11–A13 of `.sdlc/GAPS.md`. Each README leads with the
  gap until the row is green.
- ~~**`changesets-pr.yml` states the wrong cause.**~~ — **closed**: the comment was corrected
  in #396, and the deadlock itself no longer needs a human. With no release credential the
  workflow dispatches the required checks, mirrors them onto the Version PR and merges it
  itself; the credential that retires that fallback is `.sdlc/GAPS.md` C5.

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
