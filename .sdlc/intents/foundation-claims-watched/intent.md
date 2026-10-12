# Intent — The foundation's published numbers are watched and benchmarked

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). It finishes the part of
> the draft [`upstream-watch`](../upstream-watch/intent.md) that its own success criterion still
> names: *every published package declares at least one competitor*. Four do and six do not,
> and the six are the ones whose numbers were measured once and never again.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

- `seniority`, `bellpull`, `closeout`, `linegauge`, `paratext` and `controlroom` each declare
  their competitors in `competitors.json`. The daily watch, already running, fingerprints them.
  A release that moves a number one of their READMEs or `foundation-ceilings.json` publishes
  arrives as a git diff on a committed file and an issue in this repository.
- `seniority` and `closeout` get B4 pairs in `benchmarks/fixtures/entry-points.ts`, so their
  bundled weight against the lightest zero-dependency incumbent is measured on every PR, as
  the other eight packages' already is.

## Why now

- **Six of ten packages are unwatched.** `ls packages/*/competitors.json` on `d8569f5` lists
  burgee, caique, flagstaff and roundel only. `KNOWN` in `scripts/competitors-lock.test.ts`
  (line 39) has no cosmiconfig, lilconfig, dotenv, rc, execa, tinyexec, cross-spawn, which,
  exit-hook, restore-cursor, ansi-escapes, terminal-link, term-img or ink.
- **Their numbers are measured once.** `.sdlc/bands/foundation-ceilings.json` sets each
  foundation ceiling from incumbent weights measured on **2026-09-23**: cosmiconfig 1,832,269 B,
  execa 647,091, signal-exit 76,966, exit-hook 13,200, and 13 more. Nothing re-reads them. The
  upstream-watch spec itself names this failure: *"our published weight numbers are true as of
  the day they were measured and unverified since"*.
- **One claim has 1.4% headroom and no watch.** The `lighter-than-tinyexec` claim reads
  **0.986** against a gate of 1 in `benchmarks/results/cli-benchmarks/2026-10-12-1492ed8-ci.json`.
  A tinyexec release that drops 85 bytes makes bellpull's published claim false without a
  single test of ours going red.
- **Two packages have no weight row at all.** `PAIRS` in `benchmarks/fixtures/entry-points.ts`
  has no seniority or closeout entry. They appear only as `FRAMEWORK_ADDS` in the parity stack.
  `seniority/spec.md` R9 says its spawn-delta half "belongs to `bench --axis weight`", and the
  row does not exist. `closeout/README.md` line 357 publishes `closeout/exit-hook` at 11,841 B
  against exit-hook 5.1.0's 4,458 B, measured once, by hand.
- **The machinery is built and running.** `compat-upstream.yml` runs the competitor pass daily
  (green from 2026-10-04 to 2026-10-11), `fromRegistry()` reproduces published figures to the
  byte, and the lock enforces declarations for every package that has a file.

## Affected users and systems

- `packages/{seniority,bellpull,closeout,linegauge,paratext,controlroom}/competitors.json` (new).
- `scripts/competitors-lock.test.ts` (`KNOWN`, and a new every-package assertion).
- `benchmarks/fixtures/entry-points.ts`, `benchmarks/axes/weight.ts` (ceilings for two pairs).
- The benchmarks page, which gains two rows.

## Constraints

- **Issues, never PRs; nothing writes `.changeset/`** (upstream-watch constraints 2 and 6).
- **No new dependency.** The watch reads tarballs read-only, as now.
- **A pair over 1 is a ratchet at its measurement, not a silent pass.** If `closeout/exit-hook`
  bundles heavier than exit-hook, as its README says by hand, the gate records that and the
  claim says so. It is not hidden by choosing a different fixture.

## Success criteria

1. All ten published packages have a `competitors.json`, and the lock fails on a published
   package without one.
2. Every incumbent named in `foundation-ceilings.json` is declared and on `KNOWN`.
3. The next scheduled `compat-upstream.yml` run fingerprints every new competitor (each `seen`
   is non-null in the follow-up re-vendor PR).
4. `npm run bench -- --axis weight` reports `seniority/lilconfig ÷ lilconfig`,
   `seniority/dotenv ÷ dotenv`, `closeout/exit-hook ÷ exit-hook` and `closeout/signal-exit ÷ signal-exit`,
   each gated.

## Open questions

- Which seniority entry is paired. **Answered 2026-10-12 in `spec.md`**: `seniority/lilconfig`
  against lilconfig and `seniority/dotenv` against dotenv, the two zero-dependency incumbents.
  cosmiconfig's tree is the ceiling's anchor, and that comparison is already made in
  `foundation-ceilings.json`.
- Where a pair over 1 gates. **Answered 2026-10-12 in `spec.md`**: at its measurement plus the
  80 B CI margin, the rule `weight.ts` already applies to `paratext`, with the comment saying
  the claim is not met.
