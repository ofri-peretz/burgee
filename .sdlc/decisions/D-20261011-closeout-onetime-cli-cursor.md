---
id: D-20261011-closeout-onetime-cli-cursor
subject: 'How do `onetime` and `cli-cursor` get a grade without changing `closeout/once` or `closeout/cursor`?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**Each gets a façade subpath named for it: `closeout/onetime` grades 6 / 6 against onetime 8.0.0's control of 6 / 6, and `closeout/cli-cursor` grades 8 / 8 against cli-cursor 5.0.0's control of 8 / 8** (`graded-override-targets` R3, R4). Measured on darwin arm64, Node 24.13.0. Before the façades existed, each target run reported `target not built yet`.

- **`closeout/onetime` is written beside `closeout/once`, not on top of it.** The spec says "over `closeout/once`", but onetime 8's suite has a case `once` must fail: `retries if the first call throws`. `once` marks a handler called before running it, so a shutdown handler never runs twice. onetime drops the function only after it returns. The two contracts serve different callers, and the intent's constraint keeps `once`'s API unchanged. What the two share is the wrapper's identity: `name` and `length` are the wrapped function's. onetime's suite asserts nothing of `mimic-function`, and the façade does not export its API, so `mimic-function` gets no row (spec R3).
- **`closeout/cli-cursor` is cli-cursor's `{ show, hide, toggle }` over `closeout/cursor`'s sequences.** The stream defaults to `process.stderr`, read at each call, and one flag for the whole process drives `toggle`. A hide arranges the show at exit through `closeout/restore-cursor`, in the `restore` phase, which is the path cli-cursor takes through restore-cursor. `hideCursor(stream, onExit)` keeps its own shape.

**Two harness changes, neither touching an assertion:**

- `avaConfig: { workerThreads: false }` is cli-cursor's own `ava` block. A worker thread's `process.stderr` has no `setEncoding`, and without the block the control read 0 / 8.
- `entries` writes the `index.js` that the `require` case spawns (`node index.js`, sindresorhus/log-update#2). On the control it is a link to the incumbent's own file. On the target it is an ES module re-export of `closeout/cli-cursor`, because the vendored root is `type: module`. `entryBody` previously wrote CommonJS only. Without the entry the control read 7 / 8.

**Weight, and the one change to closeout's core this needed.** The bar is bundled bytes, the
"Everything" column of `/docs/weight` measured the same way for the incumbent at its graded
release. `scripts/subpath-weight-lock.test.ts` now holds both façades to it.

| subpath | ours (bundled) | incumbent (bundled) |
| :-- | --: | --: |
| `closeout/onetime` | 716 | onetime 8.0.0: 1,527 |
| `closeout/cli-cursor` | 4,568 | cli-cursor 5.0.0: 4,757 |

The first build of `closeout/cli-cursor` read **4,876 B, over by 119**, and the new lock was red
on it. The excess was not the façade. It was the process-wide `onExit` the restore registers
through: it went through the whole `Closeout` view, and that view carries the
`hideCursor`/`showCursor` pairing. `closeout/restore-cursor` had paid the same bytes since it
shipped, at 4,642 B against restore-cursor's 4,519 B.

`install.ts` now keeps the wired registry and its view as two lazy values over one wiring.
`onExit` reaches the registry without the view, and `install()` and every other export behave as
before. After the change `closeout/restore-cursor` bundles 4,330 B and `closeout/cli-cursor`
4,568 B.

On disk, which is what `closeout/src/weight.test.ts` budgets, `./onetime` is 1,295 B and
`./cli-cursor` is 14,544 B. The incumbents' trees are 4,071 B and 15,679 B, broken down below.

| package | bytes |
| :-- | --: |
| onetime | 1,033 |
| mimic-function | 3,038 |
| cli-cursor | 694 |
| restore-cursor | 386 |
| signal-exit | 10,528 |

The first two make up onetime's tree; all five make up cli-cursor's.

**For the owner.** `closeout`'s changeset is a `minor`, because it adds two public entry points.
