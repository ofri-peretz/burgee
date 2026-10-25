# Intent — Commander 14 and yargs 17 are claimed, because most dependents are on them

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). The previous majors are
> graded already and claimed by neither drop-in. `burgee migrate` therefore declines most of the
> programs it was built for.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-19 — every requirement Built with its check in `spec.md` § Status: commander 14 at 1,331 / 1,331 and yargs 17 at 793 / 794, each level with its control · released in burgee 1.7.0 (npm, 2026-10-25T17:05Z, Version PR #1231): #1086 [`0f685d4609`](https://github.com/ofri-peretz/burgee/commit/0f685d4609) and #1165 [`51fec1ba42`](https://github.com/ofri-peretz/burgee/commit/51fec1ba42), verified against `main` at [`aff0c31f`](https://github.com/ofri-peretz/burgee/commit/aff0c31fdf) with burgee 1.7.1 from npm (below)

---

## What is wanted

`SUPPORTED_MAJORS` in `packages/burgee/src/compat.ts` claims commander `[14, 15]` and yargs
`[17, 18]`. Each claim follows D-145's rule: the older major's own suite grades the drop-in
level with that major's own control. `burgee migrate` then rewrites a program pinned to
commander 14 or yargs 17 instead of refusing it as off-major. The program gets the behaviour of
the major it was written for, wherever 15 or 18 changed it.

## Why now

- **Where the dependents are.** In `.sdlc/research/dependents.md` (generated 2026-09-23 by
  `npm run rank:dependents`), the top 50 dependents of each host break down by declared range:

  | host | older major | its share of the top 50 | current major | its share |
  | :-- | :-- | :-- | :-- | :-- |
  | yargs | `17` (`^17`, `~17`, `17`) | **22 packages, 165.8 M/wk** | `18` | 16 packages, 74.0 M/wk |
  | commander | `14` (`^14`, `~14`) | **14 packages, 58.5 M/wk** | `15` | 7 packages, 41.2 M/wk |

  The older major carries more than twice the current one's weekly downloads for yargs and
  more for commander. The first and third adoption targets in
  `.sdlc/research/adoption-targets.md` (`@devcontainers/cli`, `@stoplight/spectral-cli`) are
  both on yargs `~17.7.2`.
- **The grades exist and are close for one host.** `compat.ts` (lines 189–191) and the
  baselines in `packages/compat-oracle/baseline/majors/` read **commander 14: 1,329 / 1,331**.
  The two misses are one message: 15 names the surplus argument in `too many arguments`, and
  14 does not. They read **yargs 17: 191 / 794**, nearly all from one change: 17's
  `require('yargs')` is a singleton bound to `process.argv`, which 18 removed, and four of its
  suite files build on it in `beforeEach`.
- **D-145 named the work and left it to a lane.** It says that reaching level on either is "a
  façade change for its lane: a major-aware message, or a CommonJS singleton", and that the
  second "is not decided here". This intent decides it, and the decision is stated in `spec.md`.

## Affected users and systems

- `packages/burgee`: `commander/` and `yargs/` façades, `compat.ts`, `migrate.ts`.
- `packages/compat-oracle`: the `commander-14` and `yargs-17` rows in `PREVIOUS_MAJORS` grade
  the new entries.
- The compatibility page, generated from `SUPPORTED_MAJORS`.

## Constraints

- **The current majors do not move.** Commander 15 at 1,360 / 1,360 and yargs 18 at 816 / 816
  are unchanged in every PR.
- **A program written for 15 or 18 gets 15 or 18.** Older behaviour is reached only through an
  entry that names the major. Nothing sniffs versions at runtime.
- **A claim waits for its number** (D-137, D-145). Commander 14 can land first; yargs 17 is
  claimed only once level.
- **One compat-oracle lane at a time.**

## Success criteria

1. `burgee/commander/v14` grades 1,331 / 1,331 against commander 14's suite, and
   `SUPPORTED_MAJORS.commander` is `[14, 15]`.
2. `burgee/yargs/v17` grades level with yargs 17's control, and `SUPPORTED_MAJORS.yargs` is
   `[17, 18]`.
3. `burgee migrate` on a fixture pinned to `commander@^14` rewrites to `burgee/commander/v14`.
   On a fixture pinned to `yargs@~17.7.2` it rewrites to `burgee/yargs/v17`.
4. `scripts/supported-majors-lock.test.ts` passes with the new claims.

## Open questions

- How a program reaches an older major's behaviour. **Answered 2026-10-12 in `spec.md`**:
  through a versioned subpath (`/v14`, `/v17`) that `migrate` writes, never through runtime
  detection.
- Whether `burgee/yargs/v17`'s `require()` hands back a singleton. **Answered 2026-10-12 in
  `spec.md`**: yes, on that subpath only, because that is yargs 17's documented surface and the
  suite grades it.

## Released — 2026-10-25

This intent was stamped `shipped` on 2026-10-19, when both PRs had merged and before either
changeset had published. Both reached npm in `burgee@1.7.0` (`"1.7.0":` `2026-10-25T17:05:01.964Z`,
release run 40213249288 on `b3dbf60c9a`, Version PR #1231), whose changelog carries #1086 and #1165
as minors. npm matches `main` for all ten packages (checked 18:26 UTC). The criteria, re-read
against the released code:

| Criterion | Evidence on release |
| :-- | :-- |
| 1. `burgee/commander/v14` grades 1,331 / 1,331 against commander 14's suite, and `SUPPORTED_MAJORS.commander` is `[14, 15]` | CI Compatibility run 40180212984 on `main` at `1f6be56d6e`, the commit Version PR #1231 was cut from: `commander-14 1331 / 1331 100.0% ▲ 0`. `SUPPORTED_MAJORS.commander` is `[14, 15]` in `packages/burgee/src/compat.ts`. `burgee/commander/v14` resolves from the published package and exports `Command`. |
| 2. `burgee/yargs/v17` grades level with yargs 17's control, and `SUPPORTED_MAJORS.yargs` is `[17, 18]` | The same run: `yargs-17 793 / 794 99.9% ▲ 0`, level with the control, whose one miss is the harness's own manifest. `SUPPORTED_MAJORS.yargs` is `[17, 18]`. `burgee/yargs/v17` and `burgee/yargs/v17/yargs` resolve from the published package. |
| 3. `burgee migrate` rewrites a `commander@^14` fixture to `burgee/commander/v14`, and a `yargs@~17.7.2` fixture to `burgee/yargs/v17` | The published CLI (`burgee@1.7.1`), `migrate --dry-run --json` on a one-file fixture of each: `complete: 1 file would be rewritten`, `mapped` `commander -> burgee/commander/v14` and `yargs -> burgee/yargs/v17`. |
| 4. `scripts/supported-majors-lock.test.ts` passes with the new claims | Passes on `main` at `aff0c31f`. |
