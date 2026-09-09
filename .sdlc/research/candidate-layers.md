# Candidate layers — what is left to take, what it would be called, and who holds it now

> Research, 2026-09-08. Companion to `competitor-landscape.md` (which covers the visible
> layers: parser, colour, render, prompts) and to `native-when-it-pays.md`. This file covers
> the layers *underneath* those — text measurement, subprocess, process lifecycle, config —
> none of which appear in existing research. Every number was measured on the date above by
> the command recorded in §9; every name was checked against the npm registry the same day.

## 1. Summary

| candidate | layer | incumbent volume | name status | strength |
| :-- | :-- | --: | :-- | :-- |
| **`seniority`** | config resolution and provenance | **2.75 B/wk** | free | **strongest** — biggest layer, stalest field, direct instance of the thesis |
| **`linegauge`** | text measurement, wrapping, truncation | 1.74 B/wk | free | **strong** — fragmented field, we build it anyway |
| **`closeout`** | process lifecycle, cleanup, terminal restore | 586 M/wk | free | **strong** — staleness at volume, caique needs it |
| **`bellpull`** | subprocess execution | 880 M/wk | free | **weakened** — see §5, a zero-dep rival already exists |

**All four names were published 2026-09-09** and are live on the registry: `linegauge@0.0.1`,
`seniority@0.0.1`, `bellpull@0.0.1`, `closeout@0.0.1`, each a reservation stub of four files.

> **Naming constraint learned at publish time.** A 404 from the registry means *unregistered*,
> not *publishable*. npm applies a second, stricter **name-similarity check** that only fires on
> `npm publish`, and it compares against every existing package regardless of popularity. Two
> names died to it: **`kerf` → rejected as too similar to `keyv`** (142 M/wk) and **`snuffer` →
> rejected as too similar to `buffer`** (149 M/wk). Both were short. At four or five characters
> an edit distance of two covers an enormous slice of the registry, so **use at least eight
> characters, and check for neighbours at edit distance one before committing.** `linegauge` (9)
> and `closeout` (8) passed on the first attempt, as did `seniority` (9) and `bellpull` (8).
>
> **Correction, same day.** An earlier revision of this file put config last at 312 M/wk and
> recommended deferring it. That count included four packages out of twenty-five; the layer is
> **2.75 B/wk** and ranks first. The reasoning was also inconsistent: "a Node builtin now does
> this" was treated as a reason *not* to build config while being the core reason *to* build
> text. Both errors are corrected in §7.

## 2. A correction that reframes the "why now"

The expected story was that incumbents are trapped on old Node ranges and cannot reach modern
builtins. **That is false, and the roadmap should not lean on it.** Declared engines:

| package | engines | package | engines |
| :-- | :-- | :-- | :-- |
| `ansi-styles` | `>=22` | `execa` | `>=22` |
| `string-width` | `>=20` | `which` | `^22.22.2 \|\| ^24.15.0 \|\| >=26` |
| `wrap-ansi` | `>=20` | `cosmiconfig` | `^22.18 \|\| >=24` |

They can use `Intl.Segmenter`, `util.parseArgs` and `util.styleText` today. They have not.

The real gap is the one `PRINCIPLES.md` already claims — **pace, not capability** — and the
sharpest single piece of evidence is one manifest:

> `execa`: declares `engines: ">=22"`, ships **12 direct dependencies**, 16 packages, 1.42 MB.

A modern engine floor carrying a legacy dependency tree. That is the thesis in one line, and it
is stronger evidence than a technical barrier would have been.

## 3. The platform-absorption test — apply before building anything

The question that kills a candidate fastest is not "is the market big" but **"is the platform
about to absorb this?"** It fired twice while this file was being written, so it belongs here
rather than in a retrospective.

> **Does the builtin *substitute* for the package, or is it a *component* of it?**
> A substitute means the platform now does the whole job — the candidate is dead on a timer.
> A component means the platform does the hard part and the package composes it — that is
> leverage, and it is the position rule 2 wants us in.

| candidate | builtin | relationship | verdict |
| :-- | :-- | :-- | :-- |
| dependency patching | `npm patch` | **substitute** | **dead** — see below |
| standalone glob matcher | `fs.glob`, `fs.globSync` (Node 22+) | **substitute** | **dead** |
| parser primitives (`minimist`, `yargs-parser`, `arg` — 391 M/wk) | `util.parseArgs` | **substitute** | **dead**, and it would cannibalise burgee besides |
| `linegauge` | `Intl.Segmenter` | component — the builtin segments graphemes; linegauge does ANSI-aware width, wrap, truncate and slice on top | live |
| `seniority` | `process.loadEnvFile()` | component — nothing builtin resolves precedence across flag, env, file and default | live |
| `closeout` | `process.on(signal)` | component — nothing builtin runs handlers exactly once across every exit path | live |
| `bellpull` | `child_process` | component | live |

The family already passes this test by construction: roundel is *"nine semantic tokens over
`util.styleText`"* — built **on** the builtin, not against it. That is the pattern.

### The patching candidate, killed 2026-09-08

A zero-dependency replacement for `patch-package` looked strong on every usual measure:
4.2 M/wk and **growing** (12.8 M/month in 2025-03 → 26.4 M/month in 2026-08), 14 direct
dependencies, **55 packages and 4.94 MB installed** to apply a text diff, last published
2025-09-29, and every dependency replaceable by a Node 24 builtin. A 55 → 1 ratio, the most
quotable number available anywhere in this research.

It is dead anyway. **npm RFC 53, *Native Dependency Patching*, was accepted and ratified
2026-06-05** as `accepted/0053-native-dependency-patching.md`:

> "Adds first-class, install-time patching of installed dependencies to the npm CLI, on parity
> with `pnpm patch`, `yarn patch`, and `bun patch`. Introduces a new `npm patch`…"

Not yet shipped — npm 11.16.0 has no `patch` command — but npm/cli has open pull requests
touching `applyPatch`, `EPATCHUNU` and `--ignore-patch-failures`, one updated 2026-09-08.
pnpm, yarn and bun already have it. `patch-package`'s growth is a shim filling the last gap,
and that gap is closing.

The agent argument makes it worse, not better: if AI agents increase patching volume, they will
route it to the documented native command. Being the third-party alternative is the weakest
possible position when the users are machines reading official documentation.

## 4. `linegauge` — the text layer

**The word.** A printer's line gauge is the steel rule marked in picas and points, used to
measure a line of type against the measure it was set to.

**Why it is the job.** Slice a styled string naively and the edge frays: a dangling escape
sequence, half a grapheme, a severed ZWJ cluster. Width, wrap, truncate and slice are one
problem — *cutting styled text without letting the edge come apart*.

**Scope.** `width(s)` · `wrap(s, cols)` · `truncate(s, cols, {position})` · `slice(s, a, b)` ·
`strip(s)` · `widest(lines)`. One package, six functions, zero dependencies.

**Incumbents.**

| package | weekly | deps | last publish | engines |
| :-- | --: | --: | :-- | :-- |
| `strip-ansi` | 464 M | 1 | 2026-02-26 | `>=12` |
| `string-width` | 350 M | 2 | 2026-07-08 | `>=20` |
| `wrap-ansi` | 311 M | 2 | 2026-08-17 | `>=20` |
| `ansi-escapes` | 114 M | 1 | 2026-02-04 | `>=18` |
| `slice-ansi` | 102 M | 2 | 2026-04-04 | `>=22` |
| `get-east-asian-width` | 69 M | 0 | 2026-05-08 | `>=18` |
| `eastasianwidth` | 62 M | 0 | 2024-04-21 | — |
| `string-length` | 47 M | 0 | 2026-01-21 | `>=20` |
| `wcwidth` | 44 M | 1 | **2016-05-30** | — |
| `cli-truncate` | 36 M | 2 | 2026-07-09 | `>=22` |
| `widest-line` | 34 M | 1 | 2026-01-24 | `>=20` |
| **total** | **1.74 B** | | | |

**The play is consolidation, not weight.** Eleven packages solve one problem; several are thin
wrappers over the others. `wcwidth` at 44 M/wk has not been published since 2016.

**The builtin that does the hard part.** `Intl.Segmenter`, verified on Node 24 against every
case that breaks naive implementations:

| input | code units | graphemes |
| :-- | --: | --: |
| family ZWJ `👨‍👩‍👧‍👦` | 11 | 1 |
| regional flag `🇮🇱` | 4 | 1 |
| skin-tone `👋🏽` | 4 | 1 |
| keycap `1️⃣` | 3 | 1 |
| combining `é` | 2 | 1 |
| CJK `한국어` | 3 | 3 |

Cost is 3.5 µs per segmentation of a 50-char string, so the shape is **fast-path ASCII by byte
scan, Segmenter only when a non-ASCII code unit is present** — the same specialisation that beat
`picomatch` 3× on common glob shapes.

**Grade against** (rule 3): `string-width`, `wrap-ansi`, `strip-ansi` and `slice-ansi` test
suites, all vendored.

**Why we build it regardless.** flagstaff's box, columns and status line need width and wrap;
burgee's help renderer needs width from the runtime. Under rule 2 we cannot depend on the
incumbents, so this code gets written either way. Publishing it is the marginal cost of polish
and grading, not of invention.

## 5. `bellpull` — the subprocess layer, and why it is weaker than it looks

**The word.** The cord you pull in one room to ring a bell in another and summon someone to do
something. Request work at a distance; work happens elsewhere; someone comes back to you.

**Incumbents.**

| package | weekly | deps | last publish | note |
| :-- | --: | --: | :-- | :-- |
| `which` | 290 M | 1 | 2026-05-08 | executable resolution |
| `cross-spawn` | 212 M | 3 | 2024-11-18 | Windows argument shim |
| `execa` | 151 M | **12** | 2026-07-31 | 16 pkgs, 1.42 MB |
| **`tinyexec`** | **119 M** | **0** | **2026-09-03** | **already zero-dep** |
| `npm-run-path` | 104 M | 2 | 2024-08-26 | PATH augmentation |
| `nano-spawn` | 4 M | 0 | 2026-04-01 | zero-dep, by execa's author |
| **total** | **880 M** | | | |

**Record this honestly: the weight pitch is already taken.** `tinyexec` has zero dependencies,
119 M downloads a week, and was published five days ago. `nano-spawn` is the same idea from
execa's own author. "execa pulls 16 packages, we pull none" is no longer a differentiator — it
is a claim a competitor already makes, with traction.

**What is still open.** Neither `tinyexec` nor `nano-spawn` does executable resolution
(`which`, 290 M/wk) or PATH augmentation (`npm-run-path`, 104 M/wk), and neither returns a
result with a **static projection** (rule 6) or a per-caller conformance shape (rule 5). An
agent invoking a subprocess wants `{ ok, code, signal, stdout, stderr, duration }` renderable as
human text, a `--json` envelope, or an agent event — not a string and a thrown error.

**So the differentiator is agent-nativeness and layer consolidation, not weight.** That is a
narrower, more contested pitch than `linegauge`'s. Recommend scheduling it *after* the text layer
and re-checking `tinyexec`'s trajectory before committing.

**Grade against:** `execa`, `cross-spawn` and `which` suites.

## 6. `closeout` — the process lifecycle layer

**The word.** To close out is to settle and finish — an account, a position, a shift — with
nothing left open.

**Scope.** `onExit(fn)` running exactly once on every exit path — normal exit, signal, uncaught
exception — plus terminal restore (cursor, raw mode, alternate screen) and a bounded cleanup
deadline so shutdown cannot hang.

**Incumbents.**

| package | weekly | deps | last publish |
| :-- | --: | --: | :-- |
| `signal-exit` | 199 M | 0 | **2023-07-29** |
| `onetime` | 162 M | 1 | 2026-02-02 |
| `cli-cursor` | 108 M | 1 | 2024-07-26 |
| `restore-cursor` | 108 M | 2 | 2024-07-26 |
| `exit-hook` | 9 M | 0 | 2026-02-04 |
| **total** | **586 M** | | |

`signal-exit` is the staleness record at this volume: three years untouched, 199 M installs a
week, and it sits in npm's own tree.

**Why it fits the story.** `caique` already promises "it never hangs" and "cancellation exits
`CANCELLED` and restores the terminal". That guarantee *is* this package. Building it as a named
product rather than as caique internals follows rule 8, and the bounded-deadline guarantee is a
genuine agent-native claim: a hung cleanup handler is exactly the failure mode that strands an
agent with no human on deck.

**Grade against:** `signal-exit` and `exit-hook` suites.

## 7. `seniority` — config resolution, the largest layer

**The word.** Which one outranks the others. A plain English word rather than an idiom, so it
survives translation — most of npm does not read English as a first language.

### What the layer actually is

A CLI option can arrive from four places. Resolving `--out`:

```text
~/.mytoolrc            { "verbose": false, "out": "dist" }    ← home file
./mytool.config.js     { out: "build" }                       ← project file
MYTOOL_OUT=tmp                                                ← environment
$ mytool build --out=lib                                      ← flag

resolved   out     = "lib"     flag > env > project > home > default
           verbose = false     only the home file set it
```

The layer is the machinery that walks up the directory tree, finds those files, parses several
formats, and decides which source wins.

### Incumbents — 2.75 B/wk across three sub-layers

| sub-layer | package | weekly | deps | last publish |
| :-- | :-- | --: | --: | :-- |
| **semantics** | `dotenv` | 158 M | 0 | 2026-04-12 |
| | `cosmiconfig` | 115 M | 2 | 2026-08-30 |
| | `lilconfig` | 71 M | 0 | 2024-12-03 |
| | `dotenv-expand` | 37 M | 0 | 2026-07-29 |
| | `rc` | 30 M | 4 | **2018-05-26** |
| | `c12` | 22 M | 6 | 2026-09-03 |
| | `configstore` | 13 M | 5 | 2026-01-24 |
| | `conf` | 12 M | 9 | 2026-02-04 |
| | `update-notifier` | 9 M | **10** | 2024-09-09 |
| **plumbing** | `locate-path` | 218 M | 1 | 2025-09-15 |
| | `p-locate` | 217 M | 1 | 2026-02-03 |
| | `resolve-from` | 214 M | 0 | **2019-04-15** |
| | `path-exists` | 204 M | 0 | **2021-08-12** |
| | `find-up` | 170 M | 2 | 2025-09-16 |
| | `import-fresh` | 133 M | 0 | 2026-02-25 |
| | `parse-json` | 122 M | 3 | 2025-04-09 |
| | `read-pkg-up` | 34 M | 3 | 2023-11-03 |
| **parsers** | `js-yaml` 264 M · `json5` 205 M · `yaml` 176 M · `ini` 102 M | 747 M | | |

The plumbing chain is the finding: **`find-up` → `locate-path` → `p-locate` → `path-exists`** —
four packages and 809 M weekly downloads to answer *"is there a file called X in this directory
or any above it."* On Node 24 that is a loop and `fs.existsSync`.

### Scope — take the semantics, not the plumbing or the parsers

`resolve(manifest, { cwd, env, argv })` → the resolved values **plus a provenance record for
each one**. The plumbing becomes about thirty lines inside the package; the format parsers stay
out, because YAML and JSON5 are genuinely a different family under rule 10.

The claim that falls out: *cosmiconfig + find-up + locate-path + p-locate + path-exists +
import-fresh + parse-json is seven packages; this is one, with none.*

### Why it is a direct instance of the thesis, not an adjacent layer

A config file is another surface of the same manifest that already produces help, `--json`,
`--schema`, completions and MCP. Three consequences no incumbent can offer, because none of them
has a manifest:

- **Precedence is a declared truth table**, testable per rule 4, instead of per-tool folklore.
- **The config file validates against the schema burgee already emits.** Nearly free.
- **Provenance is answerable.** If `out` is `lib`, nothing in the ecosystem can tell you which of
  the four sources set it. `--explain` naming the file and line is a real rule 5 feature: an
  agent repairing a misconfiguration needs the origin, not just the value.

**Grade against** (rule 3): `cosmiconfig`, `lilconfig`, `dotenv` and `rc` suites.

**The one honest caution.** File discovery is not CLI-specific — bundlers, linters and test
runners use it too. That argues against chasing the *plumbing* packages as products of this
family, which is why the scope above excludes them. It does not argue against the semantics
layer, which is squarely a CLI concern: `commander` ships `.env()`, `yargs` ships `.config()`
and `.env()`, and this repo already has a `commander-env` intent open.

## 8. Names — decided, and the ground already covered

**Claimable now, all verified 404 on 2026-09-08:** `linegauge` · `seniority` · `closeout` · `bellpull`

All four are single words, so there is no hyphenated twin for npm's name-similarity check to
collide with.

**Why this register.** The first pass reached for maritime terms of art to extend
burgee / roundel / flagstaff / caique, and produced `selvage`, `longboat`, `unmoor`,
`chartroom`. The second pass swung to plainly descriptive names — `linegauge`, `workcrew`,
`allclear`, `sourceorder` — on the theory that utilities are *found* rather than *chosen* and
should say what they do. Both passes were wrong at the extremes, and the record of why is worth
keeping so this does not reopen a third time:

- **Descriptive is not required.** `chalk` (440 M/wk), `ora`, `execa`, `boxen` and `inquirer`
  are all utility packages whose names explain nothing. Adoption came from being the
  recommended answer in someone else's README, not from name-matching a search.
- **Obscure-but-precise is not enough either.** `selvage` is the most semantically exact word
  available for the text layer and still fails, because nothing in the word suggests edges. A
  name has to reward one look-up, not require a dictionary.
- **Idioms do not translate.** `peckingorder` means precisely the config mechanism, in English.
  Most of npm does not read English first. `seniority` says the same thing as a plain word.

What survives is the register `chalk` occupies: **short, sayable, concrete — a thing or a plain
property, not a description.** `linegauge` and `bellpull` reward a one-line gloss; `closeout` and
`seniority` need none.

**Collisions found, recorded so they are not rediscovered:**

- `config-chain` exists — v1.1.13, **21.3 M/wk**, in npm's own tree. `configchain` is therefore
  unusable: one hyphen apart, and npm's similarity check would contest it.
- `config-layers` was **first published 2026-09-08**, the same day as this research. Someone
  else is moving in the config layer now. Re-check before committing to §7.
- `selvedge`, `last-word`, `value-chain` and `config-layers` are all held, ruling out
  `selvage`'s British spelling and several descriptive candidates.
- `halyard`, `batten` and `almanac` have **zero published versions and no maintainers** — empty
  registry shells, releasable only through npm's discretionary dispute process. `ballast` is an
  explicit npm security hold. `fathom` (2014) and `tender` (2013) are squatted, not used.

**Alternates, free as of 2026-09-08**, if any of the four is rejected later: `roustabout` and
`subrun` for the subprocess layer; `trimline`, `fitwidth` and `linegauge` for text; `allclear`
and `douser` for lifecycle; `resolveorder` and `rankorder` for config.

## 9. Reproducing

```sh
# downloads, dependency counts, publish dates, engine ranges
curl -s "https://api.npmjs.org/downloads/point/last-week/<comma-separated>"
curl -s "https://registry.npmjs.org/<pkg>/latest"

# installed weight per incumbent (real install, real bytes)
npm init -y && npm i <pkg> --no-audit --no-fund && du -sk node_modules

# name availability — 404 means unregistered
curl -s -o /dev/null -w '%{http_code}' "https://registry.npmjs.org/<name>"

# grapheme correctness of the builtin
node -e "console.log([...new Intl.Segmenter('en',{granularity:'grapheme'}).segment('👨‍👩‍👧‍👦')].length)"
```

Measured on darwin-arm64, Node 24.12.0. Download figures are the seven days preceding
2026-09-08 and will drift; re-run before any of them becomes a published claim.
