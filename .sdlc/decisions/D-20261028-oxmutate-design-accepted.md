---
id: D-20261028-oxmutate-design-accepted
subject: 'oxmutate: is the Stage 2 design accepted now that 1.0.0 is on npm, and is the intent shipped?'
taken: 'Accepted, approved and not shipped: nine success criteria and metric S3 are still open. Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-28'
date: '2026-10-28'
superseded_by: —
---

**Accepted. [`oxmutate/spec.md`](../intents/oxmutate/spec.md) is the design `oxmutate` is built
to, and the intent moves `draft → approved`. It does not move to `shipped`.** 1.0.0 is
released, installs cleanly, and passes its own suite. But nine of the intent's eleven success
criteria, and the speed metric `S3` in `metrics.md`, are not met as written. A release does not
close a criterion. Each open one below names the check that closes it.

**Who decided, and who checked.** The owner said "No open decisions, we need to get it all
done" and that oxmutate "has been released". The coordinator takes this gate under the owner's
standing delegation of 2026-10-12. The evidence was checked by a reviewer that did not write
oxmutate (rule 3: the agent that wrote the code does not approve it). The reviewer re-ran every
check below. None was taken from the author's summary.

**What the reviewer verified** (2026-10-28, UTC):

- **npm.** `oxmutate@1.0.0` is `latest`. It carries an SLSA v1 provenance attestation. Its
  tarball holds all six native cores in `binding/`: darwin-arm64, darwin-x64, linux-arm64-gnu,
  linux-x64-gnu, linux-x64-musl and win32-x64-msvc.
- **Clean install.** A clean install in an empty directory gives `npx oxmutate --version` →
  `1.0.0`. A real run on a two-function project with a three-test Vitest 4 suite scored 11
  mutants in 9.4 s, 8 killed and 3 survived. All three survivors are true gaps: two boundary
  conditions and an untested branch. Each was printed with its `fix:` line. Exit code 0.
- **Release.** Release run 40740297440 (attempt 2) concluded `success` on `00e4e411ed`. Its six
  native-core jobs and the publish job are green. The GitHub Release `oxmutate@1.0.0` was
  published 2026-10-28T19:12Z, targeting the same commit.
- **Native proof run 40730024529 concluded `failure`, not success.** Its darwin-arm64 job was
  cancelled, while the other five passed. The release run's own six green native-core jobs
  supersede it, so the cores are proven. That run alone does not prove them.
- **PRs.** #1302, the feature, merged 2026-10-28T16:01Z. Its `Mutation (changed lines)` check
  is `success` at `587d3f387a`. #1347, the musl core built in Alpine, merged at 17:25Z.
- **Package suite.** `npx vitest run` in `packages/oxmutate` passed 13 files and 161 tests. The
  published darwin-arm64 core was placed in `binding/`, so the native-gated end-to-end tests ran
  and none were skipped. Main's `Unit Tests (Turbo)` and `Quality Gate` are green on
  `00e4e411ed`.

**Success criteria** (intent § Success criteria):

| Criterion | State | Evidence, or the check that closes it |
| :-- | :-- | :-- |
| `SC1` bench command, 5 runs, medians, machine spec | **open** | `m0-results.md` gives medians of 5 runs with the command lines and the machine spec for Stryker 10.0.0 and oxmutate. But `npm run bench:mutation` does not exist; the harness is `bench/burgee-pair.mts` with `bench/metrics.mjs`. Closes when that command exists and `oxmutate-bench.yml` publishes a runner measurement, which `m1-results.md` says has not run |
| `SC2` ≥ 10x warm, cold beside it | met | 17.9x tool time, median of 5, warm, on es-toolkit `src/array` (720 mutants), which replaced the dayjs-like fixture (`m0-results.md`). Cold whole run: 19.6 s against 160.6 s, 8.2x (`m1-results.md`) |
| `SC3` ≥ 99% agreement, every disagreement listed with a reason | **open** | Agreement is met: 99.92% on paratext, 99.90% on controlroom and 99.58–100% on es-toolkit. The listing is not. The two disagreements are in `m1-results.md`, not in `bench/disagreements.json`, and controlroom `screen.ts:224` has no reason yet ("Not yet checked"). Closes when that mutant is explained |
| `SC4` JSON validates against Stryker's schema; SARIF against 2.1.0 | **open** | `reports.test.ts` asserts the exact objects for schema-2 JSON and for SARIF 2.1.0. Nothing validates either one against the published schema file. Closes with a test that validates each against its schema |
| `SC5` sensitivity: weak suite has survivors, closed suite none, proven failing first | **open** | No committed check: `test:sensitivity` does not exist. The reviewer's clean-install run shows the weak half (3 survivors) and nothing more. Closes with a committed weak/closed pair, run red first |
| `SC6` no runtime dependency beyond the platform binary | **unmet as written** | 1.0.0 depends on `burgee` and `bellpull`, which are family packages. Through them it pulls `closeout`, `linegauge`, `roundel` and `seniority`, with nothing from outside the family. The cores are bundled in the tarball (8.1 MB unpacked), not shipped as `optionalDependencies`. The intent's own stack table names `burgee` and `bellpull`, so the criterion text and the design disagree. Restating `SC6` is a separate decision and is not taken here. Defect: the published ranges are `"*"`. The author is fixing them in 1.0.1 (`^1.9.2` / `^1.0.10`); in progress |
| `SC7` vitest-5 regression fixture, zero killed reported survived | **open** | By design the warm runner calls each covering task's function directly, so it never uses the name filter. `child.ts` turns off Vitest 5's module cache (`m1-results.md`, bug 1). But `test/fixtures/vitest5-regression/` does not exist. Closes with that fixture |
| `SC8` burgee full run ≤ 30 min on ≤ 8 jobs; PR lane ≤ 10 min on 500 lines | **open** | Not measured. The first weekly run under oxmutate (run 40783405734, dispatched 2026-10-28T22:53Z) is still queued. Closes when a full run on the runner is at or under 30 minutes |
| `SC9` compat-oracle grades the Stryker-compat claim | **open** | There is no grade: no `compat:mutation` script, and `compat-oracle` has no oxmutate cases. Closes with that grade, or with the gap listed |
| `SC10` frozen oracle reports a drop on a weakened test and none on an added test | met | `e2e.test.ts` "the frozen oracle (R14, SC10)" covers both cases. It ran green in the 161 above |
| `SC11` one green dogfood week on `mutation.yml` | **open** | The lane moved to oxmutate when #1302 merged on 2026-10-28, and `mutation.yml` now defaults to `engine: oxmutate`. Closes no earlier than **2026-11-04**, after one week of green mutation-lane runs on main under oxmutate, including the scheduled weekly run of 2026-10-31, with its observation recorded in `mutation-ratchets.json` |
| `S3` (`metrics.md`) ≥ 5x whole run, cold, on burgee packages | **open** | 2.4x on paratext (427.4 s against 180.0 s). On controlroom oxmutate is slower by the clock (107.2 s against 94.3 s) and 1.9x cheaper in CPU (`m1-results.md`). The target stays as written |

**What is accepted as design:** spec R1–R17 as built. The spec's integrator note of 2026-10-27
records two changes. Exit codes follow burgee's shared vocabulary, and the StableId is FNV-1a 64
with the end position in its key. One deviation is accepted here and recorded. 0.1 and 1.0 ship
all six cores inside the package's `binding/`, not as per-platform `optionalDependencies`
(`RELEASING.md`). Nothing runs at install time, so PRINCIPLES rule 9's no-postinstall rule
holds. The per-platform packages under `npm/` stay the path once they are public.

**Alternatives rejected:**

- **Stamp `shipped` on the release.** That would close nine criteria with no check behind them,
  `SC8` and `SC11` among them, and both of those are the intent's reason to exist.
- **Restate `SC6` or `S3` to fit the result.** A target moved to meet a number measures nothing.
  If `SC6` should read "no runtime dependency outside the burgee family", that needs its own
  decision.
- **Hold the design gate until every criterion closes.** The design is built and released, and
  holding it at `draft` would misstate where it stands.

**Reopens** if one of these happens:

- The 1.0.1 range fix does not publish.
- A weekly run under oxmutate reports a mutant as survived that Stryker kills on the same commit
  and cannot explain it. That is the `SC7` class of defect.
- Verdict agreement on any measured subject falls below 99%.
- `SC6` is restated, which this decision then cites.
