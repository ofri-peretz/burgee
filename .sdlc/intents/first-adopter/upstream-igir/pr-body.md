# PR body for emmercm/igir: NOT POSTED — awaiting owner go

**NOT POSTED — awaiting owner go.** It is opened only if the maintainer says yes to the
[#2249 comment](./issue-comment.md), and **not before 2026-11-05 06:28 UTC**, when
`burgee@1.9.4` is 7 days old (igir's Renovate `minimumReleaseAge: '7 days'`; never ask for an
exception). The title is [`pr-title.txt`](./pr-title.txt); igir's `pr-renamer.yml` requires a
`Refactor:` style prefix. The patch is
[`0001-Refactor-replace-yargs-and-its-locale-shim-with-burg.patch`](./0001-Refactor-replace-yargs-and-its-locale-shim-with-burg.patch),
measured on `burgee@1.9.4` on 2026-11-01 ([`igir.md`](../../../research/adoption/igir.md#re-run-on-burgee194-2026-11-01)).
If a later burgee is pinned instead, re-run the proof on it first. Open it from the owner's fork,
authored as `Ofri Peretz <ofriperetzdev@gmail.com>`, with no `Co-Authored-By` trailer and no
generated-by footer. If igir's `main` has moved, rebase and re-run before opening.

---

```markdown
Hi, I'm Ofri Peretz. I wrote and maintain burgee, the package this PR adds, so please read it with that in mind.

Closes #2249, following <LINK TO THE #2249 COMMENT> and your reply there.

**What changes**

- `src/modules/argumentsParser.ts` and `scripts/compile.ts` import `yargs` (and the `Argv` type) from `burgee/yargs` instead of `yargs` and the shim.
- `src/polyfill/yargsShim.ts` and `test/polyfill/yargsShim.test.ts` are deleted. burgee keeps its English strings in the module graph, so there is no locale file to read at run time.
- `package.json`: `yargs` out, `"burgee": "1.9.4"` in, pinned exactly like your other dependencies. `@types/yargs` stays in devDependencies, untouched; nothing imports it after this, so it can go in a follow-up.
- The package-root rewrite #2283 added to `scripts/compile.ts` now has nothing to rewrite. I left it in, to keep this diff to the swap.

`burgee/yargs` implements yargs 18's API, and its CI runs yargs' own test suite against it: 816 of 816 pass, where yargs itself passes 814 at the graded commit, which is 18.2.0, the version you pin.

**What I ran**, on macOS at 744bc279, with burgee 1.9.4 from npm, on Node 24.22.0:

- `npx tsc --noEmit`, `npm run lint`, `vitest run --project=native` and `test/endToEndTest.sh`, before the change, after it, and after reverting it: tsc, lint and the end-to-end script pass on all three, and vitest gives the same results (below).
- `bun scripts/compile.ts` (Bun 1.4.4) builds the binary and its own `--help` check passes from an empty directory. Copied alone into an empty directory, the binary's `--help`, a `copy` and a `copy extract test --dat …` run match the unchanged binary's output and files.
- With every `locales/*.json` read forced to fail with `EUNKNOWN`, as in #2244, `--help`, a `copy` and two argument errors behave as without it: no locale file is opened.
- `--help` is byte-identical (278 lines).
- 44 argument vectors through both builds: every command, missing and invalid values, unknown flags, mutually exclusive commands, real `copy`, `test`, `report`, `dir2dat` and `playlist` runs on your fixtures, and `--json`, `--schema`, `--mcp` and `completion`. Stdout, stderr, exit code and the files written are the same on all 44. A run of yargs against itself is 44 / 44.
- `npm audit --omit=dev` is 0 before and after. Every added package is MIT.

**What it costs**

- Not fewer bytes: production `node_modules` grows by about 1.26 MB. It is 3 fewer packages, 132 to 129, because igir already ships most of what yargs pulled in. burgee itself has five dependencies, against the zero you named for commander.
- yargs' packages have nine npm maintainers; burgee's six packages have one, me. burgee was first published on 2026-09-07. Every release has npm provenance, which doesn't change the bus factor.
- burgee declares `node: ^20.19.0 || >=22.13.0`, which contains your `^22.22.2 || ^24.15.0 || >=26.0.0`.

**To undo it:** `git revert` of this commit restores the tree exactly; I compared the tree hashes, and the suite passes after the revert.

CONTRIBUTING says CI may need your approval for a first PR. Until then the local runs above are what I have. I ran Node 24 only; CI covers 22 and 26. One test fails locally on both the unchanged tree and this one, so I don't count it: `isFileOpen` with a non-ASCII path, on macOS in my temp directory.
```
