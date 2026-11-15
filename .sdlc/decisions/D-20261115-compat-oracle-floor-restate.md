---
id: D-20261115-compat-oracle-floor-restate
subject: "compat-oracle's mutation floor is 91.1, set from a run whose hosts.ts kills were false; today's engine measures 86.22% after hosts.ts's real gaps were killed. Keep the floor, or restate it?"
taken: "Taken — by the session that killed hosts.ts's survivors (#1596), under the owner's standing delegation of mutation trade-offs, 2026-11-15"
date: "2026-11-15"
superseded_by: —
---

**compat-oracle's floor restarts at 86.2**, the full run of 2026-11-15 rounded down to one
decimal. The run was oxmutate 2.6.0 at 4 workers, at `eb995279a8`. That is #1596's head, and its
compat-oracle and oxmutate sources are the same as main's at `6d8aaa7af0`.

| run                                 | engine | score | killed | timeout | survived | no coverage |
| ----------------------------------- | ------ | ----- | ------ | ------- | -------- | ----------- |
| 2026-10-31, `bd98f43aae` (set 91.1) | 1.1.0  | 91.17 | 6,065  | 14      | 588      | 1           |
| 2026-11-05, `c1e0ba5f54`            | 1.5.0  | 74.61 | 4,872  | 14      | 1,662    | 1           |
| **2026-11-15, `eb995279a8` (this)** | 2.6.0  | 86.22 | 5,611  | 14      | 898      | 1           |

**The floor was set from false kills.** The 2026-10-31 run scored 0 survivors in `src/hosts.ts`.
The 2026-11-05 run scored 963 there, and the score fell from 91.17% to 74.61%.
[`sc8-profile.md` §6](../intents/oxmutate/sc8-profile.md) checked the difference by hand: 1.1.0's
kills on `hosts.ts:699` do not reproduce. With `'convert'` → `''` written into the source, the
package's suite passes 917 of 917. The drop was the score becoming true. 91.1 was never a level
this suite reached.

**The mutant set changed too.** The five runs since the first floor graded 4,620, 6,314, 6,668,
6,549 and 6,524 mutants. Mutators were added (`NumericLiteral` in 1.1.0), Stryker-compatible skips were
added, and `// Stryker disable` lines with reasons were added. A floor read off one set is not the
same bar on another.

**The real gaps were killed first.** #1596 added `hosts-record.test.ts` and
`hosts-page.test.ts`. Together they hold every `hosts.ts` row against two things: the record its
suite was vendored with, and the table `compatibility.mdx` publishes. Run alone, the two files
killed 681 of `hosts.ts`'s 1,036 survivors in the partial run of the same day. The kills were
sampled by writing each mutant into the source. 30 active-row notes and the unread fields of the
three ungraded rows took the existing reason ("nothing reads it"). `hosts.ts` now has 216
survivors, down from 963.

**What remains is outside `hosts.ts`, and the rest of `hosts.ts` is read in another process.**

| file                   | survivors |
| ---------------------- | --------- |
| `hosts.ts`             | 216       |
| `run.ts`               | 96        |
| `registry.ts`          | 82        |
| `vendor.ts`            | 79        |
| `demand.ts`            | 72        |
| `semver.ts`            | 62        |
| `report.ts`            | 55        |
| `upstream.ts`          | 49        |
| `issue.ts`             | 48        |
| `facts.ts`             | 30        |
| `watch.ts`             | 29        |
| nine others, ≤ 12 each | 81        |

- **Outside `hosts.ts`: 683 survivors.**
  - `run.ts`, `registry.ts`, `vendor.ts` and `demand.ts` hold 329 of them. Their tests spawn
    processes, clone repositories and call npm.
  - The equal-set comparison in `sc8-profile.md` §10 found the same thing: 159 mutants that
    oxmutate scores Survived, Stryker scored Timeout, at load 27.
- **In `hosts.ts`: 216 survivors.** Most are fields that only the compat ratchet reads, in its
  own process:
  - `exact`
  - `reexportDefault`
  - `control`
  - `subpath`
  - `env`
  - `vitestConfig`
  - `peers`
  - `entries`

  They are left undisabled on purpose, so they stay visible.

To restore 91.1, ~350 of these survivors would need to be killed. That work is not done here.

**Why restate rather than hold.** A floor catches a suite getting weaker. Held at 91.1, the floor
fails every weekly run until those ~350 survivors are killed, and a check that always fails
catches nothing. From 86.2 the ratchet works as usual. Killing a survivor raises the floor on the
next run.

**Conditions of the measurement.** The run took 18:06:47Z to 23:28:56Z, 322 minutes. The machine
was otherwise reserved for it. The 5-minute load ran 33 to 91, mostly 50 to 65, and much of it
was endpoint scanning.

- Timeouts are 14 of 6,524 graded mutants, the same count as the two runs above. Load did not
  buy this score with timeout kills.
- 15 orphaned `uvu` runners were left behind and killed afterwards.

**Reversible.** A later decision can put the floor back, and the weekly run raises it on its own.
