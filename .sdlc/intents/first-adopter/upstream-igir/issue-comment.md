# Comment on emmercm/igir#2249: NOT POSTED — awaiting owner go

**NOT POSTED — awaiting owner go.** Nothing in this directory has been sent outside
`ofri-peretz/*`. No comment, issue, pull request, fork or star was made on emmercm/igir.

**Held, and not postable on `burgee@1.9.2`.** The proof
([`igir.md`](../../../research/adoption/igir.md)) found three burgee defects that this text
assumes are fixed:

- [A-20261028-yargs-locale-read-at-runtime](../../../gaps/A-20261028-yargs-locale-read-at-runtime.md):
  igir's own `bun scripts/compile.ts` builds a binary that throws on every invocation. This is the
  exact defect #2249 is about, so posting before it is fixed would be false.
- [A-20261028-yargs-parse-callback-surfaces](../../../gaps/A-20261028-yargs-parse-callback-surfaces.md):
  `--json`, `--schema`, `--mcp` and `completion` misbehave under igir's `.parse(argv, {}, cb)`.
- [A-20261028-yargs-argv-type-call-signature](../../../gaps/A-20261028-yargs-argv-type-call-signature.md):
  `npm run lint` fails on the migrated tree.

Before posting, re-run the whole proof on the published fix and replace every number below that
is marked *(1.9.2)*. Then check that #2249 is still open and has no new comment, and that the
burgee version to pin is at least 7 days old, igir's Renovate `minimumReleaseAge`. Post as a
comment on #2249, not as a new issue: the issue is the maintainer's own and has no other
participants, so a comment notifies only him.

---

```markdown
Hi, I'm Ofri Peretz. I wrote and maintain burgee, so please read this with that in mind.

You opened this saying the #2247 shim is "extremely brittle", and that yargs "is quite slow, has six dependencies, and does filesystem reads at runtime". burgee has a `burgee/yargs` entry that implements the yargs 18 API, so I tried it on igir before asking. This is a question, not a PR.

On your three points, measured on 744bc279 with burgee <VERSION>:

- **Filesystem reads.** `burgee/yargs` keeps its English strings in the module graph, so `src/polyfill/yargsShim.ts` and its test can go, and the package-root rewrite #2283 added to `scripts/compile.ts` has nothing left to rewrite (I left it in place). `bun scripts/compile.ts` passes its own `--help` check from an empty directory. One honest note: until burgee <VERSION>, burgee read `locales/en.json` from disk exactly as yargs does, and a Bun-compiled igir crashed on start. I found that on igir and fixed it in burgee before writing this.
- **Dependencies.** Not zero, so it doesn't meet the commander bar you named. It has 5, all mine. In igir's production tree, yargs and the 8 packages only it pulled in go, and burgee and its 5 come in: 132 entries become 129 *(1.9.2)*. On disk it is about 1.25 MB *larger* *(1.9.2)*.
- **Speed.** `igir --help` cold start, 20 paired runs, three rounds: median 10 to 72 ms faster out of about 450 ms, on a loaded laptop *(1.9.2)*. I wouldn't call that a reason by itself.

The change is two import lines (`src/modules/argumentsParser.ts`, `scripts/compile.ts`), the shim and its test deleted, and the dependency swap. <SUITE LINE FROM THE RE-RUN: `tsc`, `lint`, `vitest --project=native` and `test/endToEndTest.sh` on Node 22 (≥ 22.22.2), 24 and 26, before, after and reverted>, and `--help` is byte-identical. Of 44 argument vectors, every one is identical except the flags burgee reserves: <RESERVED-FLAG LINE FROM THE RE-RUN>.

What it costs besides the bytes: yargs' packages have nine npm maintainers, burgee's have one, me, and it was first published on 2026-09-07.

If you'd like this as a PR, I'll open it. If you'd rather go to commander, or write your own, that's a fine answer and I won't follow up.
```

## What each sentence rests on

- The quotes are #2249's body, verbatim: "The https://github.com/emmercm/igir/pull/2247 shim is
  extremely brittle." and "'yargs' is quite slow, has six dependencies, and does filesystem
  reads at runtime. Most other solutions, such as https://www.npmjs.com/package/commander, are
  faster and have zero dependencies." The comment quotes only those words and does not say he
  asked for burgee or for a PR. He named commander. The issue is self-assigned to him.
- "132 entries become 129" and "+1.25 MB": `package-lock.json` production entries and the bytes
  of the removed and added directories, base against the 1.9.2 PR shape.
- "nine npm maintainers": `npm view <pkg> maintainers` over the 13 packages of
  `yargs@18.2.0` installed alone (sindresorhus, bcoe, oss-bot, mathias, google-wombot, lukeed,
  stefanpenner, nexdrew, shadowspawn; two are bot accounts). burgee's six packages have one.
- On 1.9.2, `lint` fails (gap 3), the 5 reserved-flag vectors that differ are broken rather than
  merely different (gap 2), and e2e on Node 22 was not measured because 22.22.0 is below igir's
  `^22.22.2`. The suite and vector lines are placeholders until the re-run.
- The `compile.ts` and filesystem sentences are **false on 1.9.2** and are the reason this is
  held. They become true only when A-20261028-yargs-locale-read-at-runtime is fixed and the
  compile check is re-run.
