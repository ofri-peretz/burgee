---
id: D-20260930-paratext-term-img-path
subject: 'D-030 kept `node:fs` out of paratext, so `paratext/term-img` refused a file path and graded 12 / 18. With the owner asking for full 1.0 on every package, does the `term-img` subpath read a path?'
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**Yes, for the `paratext/term-img` subpath only. It reads a path with `node:fs`, and `paratext/term-img` now grades 18 / 18, level with a control of 18 / 18.** This supersedes D-030 for that one subpath. D-030 still holds everywhere else: the root `image()` takes bytes, and the root `paratext` and every other published entry (`./csi`, `./link`, `./plugin`, `./terminal-link`) import no `node:fs`. D-030 is not edited.

**Why reverse it.** The owner's direction is that every package reaches 1.0, and for a drop-in 1.0 means 100% of the incumbent's own suite at its latest release, level with the control. The six cases D-030 cost (`iTerm2 support`, `WezTerm support`, `Konsole support`, `Rio support`, `VSCode support` and `handles options parameter correctly`) all pass a file path, which is term-img's documented first argument (`@param image - File path to an image or an image as a buffer`). A drop-in that refuses its incumbent's documented argument is not a drop-in. D-030's reason was to keep `node:fs` out of a package that otherwise touches nothing but strings. That reason is kept by scoping the read to the one subpath whose incumbent does it, and by a lock that fails if it spreads.

**What was built.**

- `paratext/term-img` takes a string path or a `URL` and reads it with `readFileSync`, as term-img 7.1.0 does. term-img has no async form, so neither does this. A `URL` is a superset: upstream answers `Image required` to one, because a `URL` has no `length`.
- The read sits on the line where upstream reads, after the argument check and after the terminal check. A path handed to an unsupported terminal is `UnsupportedTerminalError` or the `fallback`, and the file is never opened. That order is what kept four of upstream's cases passing under D-030, and `term-img.test.ts` holds it: a missing file on an unsupported terminal is not `ENOENT`.
- A missing file on a supported terminal throws `node:fs`'s own `ENOENT`, as upstream does.
- The types now match upstream's: `Options<FallbackType>` is exported, and `fallback` may return anything, so term-img's README idiom (a `fallback` that returns nothing) type-checks. `migrate` needs the `Options` name to rewrite `import { type Options } from 'term-img'`.

**The boundary, and the lock that holds it.** `packages/paratext/src/weight.test.ts` walks each published entry's built `dist` graph and now records the `node:` builtins it reaches as well as its bare imports. Each entry declares the builtins it may reach. `./term-img` declares `['node:fs']` and every other entry declares `[]`. A second test asserts that `node:fs` is reachable from `./term-img` and from no other entry. The walk reads static imports, dynamic `import()` and `process.getBuiltinModule()`, in either quote style. Each of those was proved red by adding it to the built root, `./link` or `./csi`, and removing the import from `./term-img` turns it red too. The `paratext` CLI (`bin`, `check.ts`) already used `node:fs` before this change. It is not a published import entry, so the lock does not cover it.

**Weight.** `./term-img` measured **4,815 B**, down from 4,955 B. The import line and the `URL` test cost less than the D-030 refusal message they replaced. Its budget is lowered from 5,000 to 4,900. The root is unchanged at **16,733 B**, because it does not reach `term-img.js`.

**Grades before and after**, all at the latest release on 2026-09-30, which is also the vendored release in each case, so nothing was re-vendored:

| row | release | before | after | control |
| :-- | :-- | :-- | :-- | :-- |
| term-img | 7.1.0 | 12 / 18 | **18 / 18** | 18 / 18 |
| ansi-escapes | 7.3.0 | 4 / 4 | 4 / 4 | 4 / 4 |
| terminal-link | 5.0.0 | 8 / 8 | 8 / 8 | 8 / 8 |

**What level sets in motion (D-137).** `burgee migrate` now rewrites `term-img` to `paratext/term-img`. `FACADE_EXPORTS['paratext/term-img']` lists its seven names. A `require('term-img')` is still refused, because `term-img` is not installed at the root, so `migrate-require.test.ts` cannot measure what its `require()` returns.
