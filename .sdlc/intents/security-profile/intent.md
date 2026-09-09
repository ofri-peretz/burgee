# Intent — `security-profile`: the compliance market's rules, which are harder

**Status:** review · **Opened:** `2026-09-07` · **Owner:** `@ofri-peretz`

---

## What is wanted

A profile a scanner-shaped CLI opts into, which makes the security market's non-negotiables
correct by construction: SARIF 2.1.0 with `security-severity` always populated, a reserved
exit-code taxonomy where "findings present" can never collide with "the tool failed",
`--severity` separated from `--fail-on`, a versioned output schema, and telemetry that is
off by default with one switch that means one switch.

## Why now

The 2026-09-07 survey of ten production CLIs found the security segment has requirements no
general-purpose CLI has, and found **both leading scanners getting the most important one
wrong**.

**Findings versus failure.** trivy exits `0` by default even with critical findings and
`--exit-code N` opts in — but tool failure hardcodes `1` through `log.Fatal` → `os.Exit(1)`.
So the near-universal CI incantation `--exit-code 1` makes *"critical CVE found"* and *"the
vulnerability database failed to download"* the same signal. A transient network failure
reads as a clean scan with findings; a findings gate reads as broken infrastructure. Either
way the wrong person is paged.
[Discussion #7915](https://github.com/aquasecurity/trivy/discussions/7915) is exactly this
complaint, the maintainer disputes it, and it is unresolved. The workaround is
`--exit-code 2`, which trivy's own documentation does not mention.

semgrep gets it right by construction — `2` the tool broke, `4`/`7`/`8` your rules or config
are wrong, `1` it ran and found things — which proves the problem is solvable and is a
framework's job rather than an author's.

**`security-severity`.** trivy synthesises it for every finding from a severity ladder,
overridden by real CVSS when available. semgrep passes it through, so a custom rule without
that metadata key produces SARIF that GitHub Code Scanning renders **without severity**.
Silent downstream degradation is precisely what a compliance workflow cannot absorb.

**Two conflations.** `--severity` (which findings to display) and the gate (which findings
fail the build) are different questions, and both scanners conflate them — trivy's own docs
recommend running the scanner twice as the workaround. And telemetry: trivy's
`--disable-telemetry` still contacts `check.trivy.dev` unless `--skip-version-check` is also
passed; semgrep's `--metrics` defaults to `auto`, meaning **on in essentially every real CI**,
transmitting config hashes, rule hashes, and the hashes of rules that produced findings.

## Affected users and systems

- `burgee/security` — an opt-in profile, not part of the default engine (Z2).
- `cli-benchmarks` gains a SARIF-validity axis.
- The lint plugin gains rules for the reserved codes.

## Constraints

1. **Opt-in and removable** (Z2). A CLI that never imports it is unchanged.
2. **Pay per import** (K6) — a non-scanner CLI pulls zero bytes of SARIF machinery.
3. **The reserved codes cannot be reused.** An author binding the findings code to an
   internal error is a startup failure, not a documentation footnote.
4. Telemetry in this profile is **off unless explicitly enabled**, and one flag disables all
   egress including version checks.

## Success criteria

1. `Q1`–`Q7` below hold, each with a test.
2. Emitted SARIF validates against the OASIS 2.1.0 schema in CI.
3. A scanner built on the profile cannot compile a configuration where the findings code and
   an error code are the same value.
4. `--severity` and `--fail-on` are independent, and one scan answers both.
5. A single documented flag produces a run with **zero** outbound network calls, asserted by
   a test that fails if any socket opens.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Zero of five met. There is no implementation of
any kind.** The status stays `review`: the intent and design are complete and reviewed, and
nothing has been built.

`grep -rin "sarif"` across every `.ts`, `.tsx`, `.json`, `.md` and `.mdx` outside `.sdlc/`
returns **zero hits**. So do `fail-on|failOn` and `security-severity|securitySeverity`. There is
no `packages/burgee/src/security*`, no `./security` in burgee's exports, and none of the
`codes.ts` / `sarif.ts` / `report.ts` files the design names.

- **Q1–Q7 hold, each with a test** — not met; none of the seven is implemented. (Worth fixing
  while here: the criterion says "Q1–Q7 below", but Q1–Q7 are defined in `design.md:11-17`, not
  in this file, so the criterion points at a section that is not there.)
- **Emitted SARIF validates against the OASIS 2.1.0 schema in CI** — not met; no SARIF is
  emitted and no job validates one.
- **A scanner cannot compile a config where the findings code and an error code are equal** —
  not met; there is no reserved taxonomy beyond the general `ExitCode` in
  `packages/burgee/src/exit-code.ts`.
- **`--severity` and `--fail-on` independent, one scan answering both** — not met; neither flag
  exists.
- **One documented flag producing zero outbound network calls, asserted by a socket test** — not
  met; no flag, no test.

The wave table schedules this "after 3, when an adopter needs it". There is no adopter, so
nothing about that sequencing has been violated — but the roadmap should not read as though this
lane has started.

## Open questions

None open. Decided at finalisation (2026-09-07): synthesise `security-severity` always,
following trivy rather than semgrep, because a missing value silently degrades the consumer;
and reserve the codes in the profile rather than the core, because a non-scanner CLI should
not inherit a scanner's taxonomy.
