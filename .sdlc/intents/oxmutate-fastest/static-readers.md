# Design note — roadmap `2.4`: run a static mutant only where its value is read

Intent: [`intent.md`](./intent.md) · Roadmap: [`roadmap.md`](./roadmap.md) · **Written:**
2026-11-14, by the session building `oxmutate-fastest`, from the measurement below. This note
proposes a measurement first and a change to which tests run second; nothing here changes a
verdict until its own A/B says so.

## The cost it goes after

A static mutant changes a value the module computes once, when it is imported. Per-test coverage
cannot see it, so today it runs in **every test file that loads its module**
(`filesFor` in `coordinator.ts`), first in the likeliest file, then in all the others.

_Measured_ on compat-oracle (`sc8-profile.md` §10, `hosts.ts` clipped at line 801):

| File | Static mutants | Tests run per mutant (median) | Test executions |
| :-- | --: | --: | --: |
| `src/hosts.ts` | 119 | 788 | 71,740 |
| `src/vendor.ts` | 102 | 148 | 28,091 |
| `src/run.ts` | 86 | 357 | 24,117 |
| `src/upstream.ts` | 51 | 159 | 16,237 |
| all 24 files | 672 | — | 159,506 |

The static phase was 50% of that run. The rest of `hosts.ts`, past line 801, holds about 1,500
more static mutants, nearly all in the one exported `HOSTS` array, each run against about 800
tests.

## Why the roadmap's first version would not reach it

The roadmap's `2.4` chose test files by the **binding** a mutant sits in, through `oxc_semantic`.
`hosts.ts` is one exported binding read by almost every test, through the functions that look a
host up. At that granularity nearly every loader stays, and the largest cost does not move.

## The proposal: record which tests read each static value

The mutated thing is a literal: a string, a number, an object or array, one property of an entry.
What decides whether a test can see the mutant is whether that test **reads that value**.

1. **A read-tracking pass in the dry run only.** The instrumenter (`native/src/instrument.rs`)
   already wraps each mutant site in an `oxmAct` switch. For each static mutant site it also
   emits a read probe that records the current test id when the site's value is read at run time
   (a getter on the property for a property value, a probe at the reference for a module-level
   binding). Mutant runs never carry the probe.
2. **A read while a test file is being collected counts that file.** `describe.each(HOSTS)` reads
   every entry before any test runs; the runner knows which file it is collecting. **A read while
   a source module loads, with no file collecting, is a fallback:** the value may reach tests
   through a copy the probe cannot see, and the mutant keeps today's rule, every loading file.
   The spike found none of these in compat-oracle; the guard stays for packages that have them.
3. **Otherwise** its files are the files of the tests that read it, likeliest first, as now.

## What can make it wrong, and the guard for each

| Way to miss a reader | Guard |
| :-- | :-- |
| A copy made at import time and read later | Rule 2: an import-time read falls back to every loader |
| A read through `Object.getOwnPropertyDescriptor`, `Object.entries` or a structured clone that does not fire the getter | Treat any enumeration of the object as a read of all its properties; a descriptor read falls back |
| A test file whose tests read it only in `beforeAll` or a hook | Hooks run with a current test file: a hook's read counts the whole file |
| Tracking changes behaviour in the dry run (a getter where a data property was) | The dry run's own verdicts are compared with a dry run without the probes; any test whose result differs makes the run fall back for every static mutant |
| A child process reads the value | It cannot see the mutant either: it loads the uninstrumented build. No change from today |

And the guard that does not depend on getting the list right: **the audit `static.group` already
has.** One mutant in twenty that the new rule calls Survived is run again in every loading file.
A disagreement is reported Killed, counted, and fails the run.

## Spike, 2026-11-14: readers are far fewer than loaders

Step 1, done by hand before any instrumenter work. On a throwaway branch, each `HOSTS` and
`PREVIOUS_MAJORS` entry in compat-oracle's `hosts.ts` was wrapped in a `Proxy` that recorded,
per entry and per top-level property, which test read it, and the package's suite ran once. All
935 tests passed with the proxies in place, and the branch was reverted. Raw reads:
1,136 (entry, property) values, 7,561 reads.

- **Every read with no test running came from a test file collecting its tests**
  (`vendored-suite.test.ts`'s `describe.each`, `vendor.test.ts`, `run.test.ts`): 565 of them.
  **None came from a source module copying a value while it loaded.** A collection-time read is
  that file reading the value, so it counts the file; rule 2 above (fall back) was never needed.
- **Static mutants are decided per test file**, so a value's cost is the tests of the files that
  read it, not the tests that read it. A value cached by one test is read within its own file.
- **Tests run per value: median 284, mean 247, p25 83, against 788 today** (the median of
  `hosts.ts`'s static mutants in §10). By the mean, **3.2x fewer**. 793 of the 1,136 values are
  read in one file, and 7 of the package's 27 test files read anything at all.
- **81 of `hosts.ts`'s 119 static mutants in §10 survived**, and a survivor pays every file it runs
  in, so the mean is the figure that moves the static phase.

**The bar this note set before the spike was not met by the median:** 284 is 36% of 788, and the
note asked for under a quarter. It is met by the mean (31%) only narrowly. The cause is one file:
`vendored-suite.test.ts`, 284 tests, reads most values while collecting. The work continues
because the projected gain is about 3x on the largest single cost in the slowest package, the
choice is behind an option that is off, and the audit guards it; the miss is recorded here rather
than the bar moved.

## Order of work

1. **Measure, with no change to which tests run.** Done by hand (the spike above). The
   instrumented version reports the same figure from the dry run.
2. **Fixtures that fail without each guard:** an import-time copy, a hook read, an enumeration.
3. **Behind an option, off by default** (`static.readers`), through `bench/ab.mjs` and the
   compat-oracle head-to-head with every verdict compared. A default is the owner's call, as
   `static.group` is (spec `R6`).

## What it does not do

- It does not change how a static mutant is decided in a file, only which files it runs in.
- It does not apply to non-static mutants, which per-test coverage already narrows.
