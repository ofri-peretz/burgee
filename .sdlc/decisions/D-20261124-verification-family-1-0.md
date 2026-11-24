---
id: D-20261124-verification-family-1-0
subject: 'Do truefit, truepass, provedone and contractdiff meet the 1.0 bar D-170 set, and on what evidence'
taken: 'Taken — the owner, 2026-11-24: "we need to get to a point all our packages are in major version 1.0.0", with releases delegated to Claude'
date: '2026-11-24'
superseded_by: —
---

**Yes, all four meet every written 1.0 criterion.** This record, with the four major changesets
beside it, cuts 1.0.0 for each. replz, hookset and triggerlist are still before their first real
release and get their own record once they have been released and dogfooded.

Measured on linux (4 cores) with Node 24.13.0, at main `40903e74a3` for the mutation runs and
`be786b0` for everything else.

## Criterion 1: the spec is fully built

None of `.sdlc/intents/{truefit,truepass,provedone,contractdiff}/spec.md` has a `Not built` row.
Roadmap intents that would add to contractdiff (the `apicontract-*` lanes, `contractdiff-bench`,
`contractdiff-compat-depth`) and truefit's parity wave 5 (six features one competitor has) add
entries or options; under semver they are minors of 1.x, and none changes what an existing entry
does.

## Criterion 2: every claimed drop-in is level with its incumbent

None of the four claims a drop-in.

- **contractdiff/openapi-typescript** is graded and not claimed. compat-oracle ran openapi-typescript
  7.13.0's own suite against it on 2026-11-24: **45 / 61** gated cases (the host row was switched to
  `active` in a local build only, for the run; it stays `planned`). The control, openapi-typescript
  itself, is 61 / 61 (2026-11-18). The README says so under Compatibility, with the classes of case
  it fails. The entry's own API is part of the 1.0 contract; the claim "drop-in for
  openapi-typescript" waits for 61 / 61, as C7 requires of any drop-in.
- **truefit** is measured on features, not as a drop-in: 143 yes, 4 partial, 7 no of 154 parity
  features against zod, valibot, arktype, typebox and ajv (`.sdlc/intents/truefit/parity.md`, wave 4).
- **truepass** covers two `@vitest/eslint-plugin` rules under its own names and says so; it does
  not claim that plugin's API.

## Criterion 3: the coverage gate

Each package measured with `npx vitest run --coverage.enabled` on 2026-11-24.

| package | tests | statements | branches | functions | lines |
| :-- | --: | --: | --: | --: | --: |
| truefit | 1159 | 2298 / 2298 | 1461 / 1461 | 587 / 587 | 1798 / 1798 |
| truepass | 201 | 388 / 388 | 265 / 265 | 60 / 60 | 282 / 282 |
| provedone | 155 | 204 / 204 | 113 / 113 | 73 / 73 | 148 / 148 |
| contractdiff | 3424 | 9596 / 9596 | 6214 / 6214 | 2458 / 2458 | 7439 / 7439 |

## Beyond the bar: mutation

Not a written 1.0 criterion, measured because a package that calls itself stable should know how
much its tests notice. `scripts/mutation.ts full`, oxmutate 2.18.4, three mutants at a time; each
score is now the package's first floor in `.sdlc/bands/mutation-ratchets.json`.

| package | killed | timeout | survived | no coverage | score | minutes |
| :-- | --: | --: | --: | --: | --: | --: |
| truefit | 5798 | 19 | 0 | 0 | 100% | 15.71 |
| truepass | 907 | 1 | 0 | 0 | 100% | 1 |
| provedone | 598 | 0 | 0 | 0 | 100% | 0.93 |
| contractdiff | 25206 | 221 | 7 | 0 | 99.97% | 157.28 |

contractdiff's first run in the cloud container (about 21,000 lines of source) had not finished
after 100 minutes and was stopped without a score. A second full run, at `78d014bade` (the 1.0
release commit), finished: 99.97%, a first floor of 99.9%. Its seven survivors are dealt with in
the commit that recorded it: four are killed by new tests (the members of a later operation that
repeats an `operationId`, keywords beside a `$ref` to `false`, and a round-trip decoder that only
reorders keys), and the three in `inputs.ts` were an equivalent filter over adapters that are all
defined, removed as dead code.

## What 1.0 promises

Each package's published entries, bin, commands, file formats and exit codes become a semver
contract, as each changeset lists:

- **truefit**: `.`, `./emit`, `./jit`, `./formats`, `./json-schema`, `./standard`.
- **truepass**: `.`, `./eslint`, its four rules, `truepass diff`, its `--json` shape and exit codes.
- **provedone**: `.`, the `provedone` bin, `stamp`, `gate`, `done`, `intent new`, `intent check`,
  the `Verified-by:` and `Checked:` trailers and the gate modes.
- **contractdiff**: `.`, `./core`, `./openapi`, `./openapi-typescript`, `./testing`, the bin, its
  config and map files, and the `ac-*` finding codes.

## What changed so the Version PR can cut a 1.0.0

SECURITY.md's "Supported versions" names every released package below 1.0, and
`stable-status-lock.test.ts` fails when it does not match the manifests. The Version PR bumps the
manifests, so the 1.0.0 cut would have gone red on the one PR a workflow merges.
`scripts/sync-supported-versions.ts` now writes that sentence from the manifests, and
`changeset:version` runs it after the bump.

## Out of scope

- Dogfooding outside burgee: truepass and provedone run on burgee itself (`truepass-dogfood-lock`,
  provedone's observe gate in `lefthook.yml`); truepass's rollout to the other repositories
  follows, against `truepass@^1.0.0`.
- The `@interlace/eslint-formatter` packages in ofri-peretz/eslint are at 1.0.2 in their manifests;
  npm refuses their publish (E404 on PUT for the `@interlace` scope), a registry setting only the
  owner can change.
