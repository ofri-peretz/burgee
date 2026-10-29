# PR body for emmercm/igir: NOT POSTED — awaiting owner go

**NOT POSTED — awaiting owner go.** It is opened only if the maintainer says yes to the
[#2249 comment](./issue-comment.md), and only after the three gaps listed there are fixed, the
proof is re-run on the published fix, and every *(1.9.2)* number is replaced. The title is
[`pr-title.txt`](./pr-title.txt); igir's `pr-renamer.yml` requires a `Refactor:` style prefix.
The patch is
[`0001-Refactor-replace-yargs-and-its-locale-shim-with-burg.patch`](./0001-Refactor-replace-yargs-and-its-locale-shim-with-burg.patch),
measured on `burgee@1.9.2`; regenerate it on the fixed version, pinned exactly, from a release at
least 7 days old. Open it from the owner's fork, authored as `Ofri Peretz <ofriperetzdev@gmail.com>`,
with no `Co-Authored-By` trailer and no generated-by footer.

---

```markdown
Hi, I'm Ofri Peretz. I wrote and maintain burgee, the package this PR adds, so please read it with that in mind.

Closes #2249, following <LINK TO THE #2249 COMMENT> and your reply there.

**What changes**

- `src/modules/argumentsParser.ts` and `scripts/compile.ts` import `yargs` (and the `Argv` type) from `burgee/yargs` instead of `yargs` and the shim.
- `src/polyfill/yargsShim.ts` and `test/polyfill/yargsShim.test.ts` are deleted. burgee keeps its English strings in the module graph, so there is no locale file to read at run time.
- `package.json`: `yargs` out, `"burgee": "<VERSION>"` in, pinned exactly like your other dependencies. `@types/yargs` stays in devDependencies, untouched; nothing imports it after this, so it can go in a follow-up.
- The package-root rewrite #2283 added to `scripts/compile.ts` now has nothing to rewrite. I left it in, to keep this diff to the swap.

`burgee/yargs` implements yargs 18's API, and its CI runs yargs' own test suite against it: 816 of 816 pass, where yargs itself passes 814 at the graded commit, which is 18.2.0, the version you pin.

**What I ran**, on macOS at 744bc279, with burgee <VERSION> from npm, on Node 22, 24 and 26:

- `npx tsc --noEmit`, `npm run lint`, `vitest run --project=native` and `test/endToEndTest.sh`, before the change, after it, and after reverting it. <SUITE LINE FROM THE RE-RUN>
- `bun scripts/compile.ts` (Bun 1.4.4) builds the binary and its own `--help` check passes from an empty directory.
- `--help` is byte-identical (278 lines).
- 44 argument vectors through both builds: every command, missing and invalid values, unknown flags, mutually exclusive commands, real `copy`, `test`, `report` and `playlist` runs on your fixtures. A run of yargs against itself is 44 / 44. <RESERVED-FLAG LINE FROM THE RE-RUN>
- `npm audit --omit=dev` is 0 before and after. Every added package is MIT.

**What it costs**

- Not fewer bytes: production `node_modules` grows by about 1.25 MB *(1.9.2)*. It is 3 fewer packages, 132 to 129 *(1.9.2)*, because igir already ships most of what yargs pulled in.
- yargs' packages have nine npm maintainers; burgee's six packages have one, me. burgee was first published on 2026-09-07. Every release has npm provenance, which doesn't change the bus factor.
- burgee declares `node: ^20.19.0 || >=22.13.0`, which contains your `^22.22.2 || ^24.15.0 || >=26.0.0`.

**To undo it:** `git revert` of this commit restores the tree exactly; I compared the tree hashes, and the suite passes after the revert on all three Node versions.

CONTRIBUTING says CI may need your approval for a first PR. Until then the local runs above are what I have. Two tests fail locally on both the unchanged tree and this one, so I don't count them: `isFileOpen` with a non-ASCII path, on macOS in my temp directory, and an occasional 45 s timeout under load that passes on re-run.
```
