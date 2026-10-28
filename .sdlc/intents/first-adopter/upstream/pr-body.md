Hi, I'm Ofri Peretz. I wrote and maintain burgee, the package this PR adds, so please read it with that in mind.

This follows #418 and my comment there: https://github.com/open-cli-tools/concurrently/issues/418#issuecomment-6455508479. You wrote that you wouldn't mind a PR that ditches yargs if it keeps full compatibility and has decent TypeScript types, and that you'd rather agree on the library first. That's what my comment asked about. I'm opening this alongside it so the question has a concrete diff to answer: two import lines, measured below. If burgee isn't the library you'd pick, closing it is a perfectly good answer.

**What changes.** Two import lines in `bin/index.ts`, plus `package.json` and the lockfile:

```diff
-import yargs from 'yargs';
-import { hideBin } from 'yargs/helpers';
+import yargs from 'burgee/yargs';
+import { hideBin } from 'burgee/yargs/helpers';
```

`burgee/yargs` implements yargs 18's API, and its CI runs yargs' own test suite against it: 816 of 816 pass, where yargs itself passes 814 at the graded commit. Nothing else in concurrently changes, so `.env('CONCURRENTLY')` and the `.group()` headings stay exactly as written. The version is pinned exactly, `"burgee": "1.9.1"`, like your other runtime dependencies.

**What I measured** on macOS at 2a80d44, with burgee 1.9.1 from npm:

- `build`, `typecheck`, `lint` and `format` pass. `vitest run` is 649/649 before the change, after it, and after reverting it, on Node 22.22, 24.12 and 26.10. One run after the change hit the 5 s timeout in the `cjs-import` smoke test on Node 22, with the laptop at a load average of 86. It passed on the re-run, and the same test timed out the same way once on the unchanged code in an earlier run.
- `--help` is byte-identical.
- `typecheck` passes on burgee's own bundled types, with no `@types` package added. `@types/yargs` stays in devDependencies, untouched, to keep the diff minimal; nothing imports it after this change, so it can go in a follow-up if you like. The `cjs-import` and `cjs-require` smoke tests pass, so CommonJS users are unaffected.
- I packed both builds, installed each alone, and ran the same 41 argument vectors through both binaries: every option group, `-P`, `-i`, `--teardown`, invalid values, an unknown flag, no arguments, and the `CONCURRENTLY_*` variables. 37 are identical in stdout, stderr and exit code. A run of yargs against itself is 41/41, so the harness isn't adding noise. The 4 that differ are the flags burgee reserves, listed below.
- `concurrently "echo a" "echo b"` prints the same lines and exits the same way.
- Dependencies go from 19 packages to 12: yargs and its 12 dependencies become burgee and its 5. `npm audit --omit=dev` is 0 before and after.

**The 4 reserved flags.** I can't think of a real invocation that starts with one of these, but they are changes, so here they are:

- `--json` is a boolean now, so `-m 1 --json "echo a"` runs `echo a`. Before, `--json` took `echo a` as its value and help was printed.
- `--schema` prints a JSON description of the CLI. Before, help was printed.
- `completion zsh` prints a zsh completion script. Before, it tried to run a command called `completion`.
- `--mcp` starts an MCP server on stdin and stdout, where it used to print help. It answers `initialize`, and `tools/list` returns an empty list. concurrently does its work after `parseSync()` returns, not in a command handler, so there is no tool to list. Typed by hand in a terminal, it now waits for input until you press Ctrl-D, where it used to print help and exit.

**What it costs:**

- It isn't lighter. The yargs subtree is 511 KB on disk and burgee's is 1.73 MB, so the install grows by about 1.2 MB.
- yargs' packages have eight npm maintainers. burgee's have one, me. It was first published on 2026-09-07. Every release has npm provenance, but that doesn't change the bus factor.
- burgee declares `node: ^20.19.0 || >=22.13.0`. yargs 18 already declares `^22.12.0`, so the new gap is 22.12.x only. It runs there; npm only prints an EBADENGINE warning.

**To undo it:** `git revert` of this commit restores the tree exactly. I compared the tree hashes, and the suite is 649/649 after the revert on all three Node versions.

CI will need a maintainer's approval to run, since this is my first PR here. Until then, the local runs above are what I have.
