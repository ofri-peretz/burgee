---
id: D-20261007-caique-controlroom-1-0-evidence
subject: 'Do caique and controlroom meet the 1.0 bar D-170 set, and on what evidence'
taken: Taken
date: '2026-10-07'
superseded_by: —
---

**Yes, both meet every written 1.0 criterion.** This records the evidence and releases nothing.
Cutting 1.0.0 is the owner's call, as it was in D-170 and in
D-20261006-foundation-1-0-evidence. seniority, the third candidate, waits for its dotenv row to
be re-graded at 18.0.6 (#844) and gets its own record.

Measured on darwin with Node 24.13.0, at main `7694faa132` for the grades and `cee602946f` for
the tables below. The incumbents' latest versions come from `npm view` on 2026-10-07, and each
one is also the version this repository has vendored.

## Criterion 1: the spec is fully built

Neither `.sdlc/intents/caique/spec.md` nor `.sdlc/intents/controlroom/spec.md` has a
`Not built` row. controlroom's R1–R22 were completed on 2026-10-05 and R11–R13 were restated
for ink 8 in D-20261006-controlroom-ink-8.

## Criterion 2: every drop-in passes 100% of its incumbent's own suite at the latest release, level with its control

Each grade comes from `node packages/compat-oracle/dist/bin.js <hosts>`, run once without and
once with `--control`.

| package | drop-in | incumbent (latest) | ours | control |
| :-- | :-- | :-- | --: | --: |
| caique | `caique/clack` | @clack/prompts 1.8.1 | 16 / 16 | 16 / 16 |
| caique | `caique/inquirer` | @inquirer/core 12.0.4 | 41 / 41 | 41 / 41 |
| controlroom | `controlroom/ink` | ink 8.0.0 | 1304 / 1304 | 1303 / 1304 |
| controlroom | `controlroom/ink` | @inkjs/ui 2.0.0 | 102 / 102 | 102 / 102 |

What the controlroom rows rest on (D-20261006-controlroom-ink-8):

- **ink 8.0.0.**
  - **The control's one failure is a timing case** ("calculate layout while rendering is
    throttled"). Real ink fails it against itself, so it is the declared `controlFailures`
    case.
  - **The control is sensitive to load.** On a quiet machine it read 1303 / 1304, failing
    only that case. During a concurrent `git push` battery it read 1300 and then 1298. The TAP
    for the quiet run is the evidence; the CI Ratchet job on ubuntu passed on #839.
  - **Five cases are excluded, each with its reason.** Four check ink's own build output,
    which a drop-in does not ship. The fifth is a type-level case that
    `src/ink/types.test.ts` covers instead.
- **@inkjs/ui 2.0.0.** One case (`spinner › spinner`) is excluded. The reference is 102
  because @inkjs/ui 2.0.0 fails that case against real ink 8.0.0 on React 19.3 with the same
  diff. Its control runs on ink 5.2.1 with React 18, the stack @inkjs/ui declares.

On every row the drop-in passes at least as many cases as its incumbent does in the same
harness. That is D-137's "level".

## Criterion 3: the coverage gate

Each package was measured with `npx vitest run --coverage.enabled`.

| package | tests | statements | branches | functions | lines |
| :-- | --: | --: | --: | --: | --: |
| caique | 714 | 1905 / 1905 | 1287 / 1287 | 513 / 513 | 1567 / 1567 |
| controlroom | 131 | 389 / 389 | 248 / 248 | 98 / 98 | 310 / 310 |

controlroom's `src/ink/*.ts` is graded in another process: by the ink suite above, which is
what `vitest-coverage.config.ts`'s `TESTED_IN_ANOTHER_PROCESS` records.

## What 1.0 would promise

1.0 would make each package's published entries, plugin `schema.json` and bin a semver
contract, along with each drop-in above at the major named.

- **caique** (0.7.2): `.`, `./ask`, `./binding`, `./clack`, `./decide`, `./editor`,
  `./inquirer`, `./keys`, `./plugin`, `./raw`, `./spec`, `./terminal`, `./schema.json`, and
  the `caique` bin.
- **controlroom** (0.3.0): `.`, `./ink`, `./plugin`, `./schema.json`, and the `controlroom`
  bin. `react` and `react-reconciler` stay optional peers, used only by `./ink`. The package
  keeps zero external production dependencies.

## Out of scope

- Earlier majors. ink 6.8.0 is graded at 540 / 584 and is not claimed, and `burgee migrate`
  leaves ink 6 projects alone (`SUPPORTED_MAJORS.ink = [8]`).
- `@clack/core`'s own API. `caique/clack` replaces `@clack/prompts`, and a program that builds
  its own prompt on `@clack/core` keeps that dependency.

## The risk the owner is accepting

`controlroom/ink` was rewritten from ink 8's source on 2026-10-06. It passes more of ink's
suite than ink itself, but it has no adopters yet. A 1.0 tag now freezes that surface the day
after it was written. Shipping caique 1.0 now and controlroom 1.0 after a release or two of
real use is a reasonable split.
