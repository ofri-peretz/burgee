---
id: A-20261112-oxmutate-test-timeout-kill
section: A
status: open
source: 'oxmutate-fastest F0, 2026-11-12: compat-oracle hosts.ts:708-718, fresh-worker path, load average 45 to 120'
done_when: 'a mutant whose only failing tests failed by their own timeout is re-run once before it is reported Killed, as a watchdog stop is, with a fixture whose test times out only under a delay and survives the re-run; the fixture fails on the build before the change'
---

A test that fails because its own timeout expired is scored as a kill. On a loaded machine a slow
test times out with no help from the mutant, so the mutant is reported Killed when it survives.

**Seen.** `packages/compat-oracle/src/hosts.ts:708-718`, 15 static mutants, oxmutate 1.6.2-dev at
`c44a2ce6d8`, the load average between 45 and 120:

- The fresh-worker path reported 11 Killed. The live static path reported 3.
- The 8 extra kills were credited to tests in `vendor-run.test.ts` and `vendor.test.ts`, which
  clone repositories and ask npm for a release.
- By hand, `reexportDefault: false` → `true` passes both files, 64 of 64. `repo` → `''`, run three
  times, passed once and twice failed two tests, a different two each time, each by timeout after
  60 to 139 s.

**Why it matters.** A false kill raises the score and hides a survivor, which is the direction
nobody checks. A watchdog stop already gets one more run at 3x before it is believed
(`coordinator.ts`, section 6); a test's own timeout gets none.

**Not known.** How often this happens at an ordinary load. The 2026-10-31 run that left 0
survivors in `hosts.ts` may be the same effect, or the defects fixed since; that was not traced.
