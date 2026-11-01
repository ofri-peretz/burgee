# Comment on emmercm/igir#2249: NOT POSTED — awaiting owner go

**NOT POSTED — awaiting owner go.** Nothing in this directory has been sent outside
`ofri-peretz/*`. No comment, issue, pull request, fork or star was made on emmercm/igir.

**Postable on `burgee@1.9.4`.** The three gaps the 1.9.2 proof found are closed and published, and
the proof was re-run on `burgee@1.9.4` on 2026-11-01: every check passed
([`igir.md` › Re-run on `burgee@1.9.4`](../../../research/adoption/igir.md#re-run-on-burgee194-2026-11-01)).
Every number below is from that re-run.

Before posting, check that #2249 is still open and still has no comments (true on 2026-11-01: open,
assigned to emmercm, 0 comments, body unchanged). Post it as a comment on #2249, not a new issue:
the issue is the maintainer's own and has no other participants, so a comment notifies only him.

The comment can go now. A pull request cannot until **2026-11-05 06:28 UTC**: igir's Renovate has
`minimumReleaseAge: '7 days'`, and `burgee@1.9.4` was published 2026-10-29 06:28 UTC. Its five
dependencies at the resolved versions are older (2026-10-26 and 2026-10-27).

---

```markdown
Hi, I'm Ofri Peretz. I wrote and maintain burgee, so please read this with that in mind.

You wrote that yargs "does filesystem reads at runtime". `burgee/yargs` implements the yargs 18 API, and since 1.9.4 its English strings are in the module graph, so it opens no locale file at run time. I tried it on igir at 744bc279 before asking:

- The #2247 shim and its test go. The rest is two import lines and the dependency swap.
- `bun scripts/compile.ts` builds a binary that passes its own `--help` check from an empty directory, and runs a real `copy` there.
- With every `locales/*.json` read forced to fail with `EUNKNOWN`, as in #2244, `--help` and a real `copy` still run, because no locale file is opened.
- On Node 24, `tsc`, `npm run lint`, `vitest --project=native` and `test/endToEndTest.sh` give the same results as on yargs. `--help` is byte-identical, and 44 argument vectors give the same stdout, stderr and exit code, `--json` and `completion` included.

What it costs:

- It isn't zero dependencies. burgee brings five, against commander's zero. igir's production tree goes from 132 packages to 129, but `node_modules` grows by about 1.26 MB.
- One maintainer, me. It was first published on 2026-09-07.

Would you like this as a PR? If you'd rather move to commander or write your own parser, that's a fine answer and I won't follow up.
```

## What each sentence rests on

- **The quote** is a verbatim substring of #2249's body, "'yargs' is quite slow, has six
  dependencies, and does filesystem reads at runtime." The comment quotes those five words and
  nothing else, and does not say he asked for burgee or for a PR. He named commander.
- **"opens no locale file at run time"**: under Node, a preload that fails every
  `locales/*.json` read with `EUNKNOWN` saw **0** such reads from the migrated tree across
  `--help`, a real `copy`, a missing-argument error and an unknown-argument error, and each
  behaved as without the preload. The unmigrated tree failed all four at load, at the shim's
  `require()` of yargs' `en.json` (under Node that is a disk read; only `compile.ts` embeds it).
- **"The rest is two import lines"**: `src/modules/argumentsParser.ts` +1 / −2 (the type import
  becomes the value import; the shim import goes) and `scripts/compile.ts` +1 / −1, plus
  `package.json` and the lockfile. The shim is 92 lines and its test 53.
- **The compile sentence**: Bun 1.4.4 (igir's `.bun-version`), `bun scripts/compile.ts` exits 0
  and logs `Finished!` after its own `--help` check. Copied alone into an empty `mktemp -d`, the
  binary runs `--help` (278 lines, identical to the base binary's), `copy` (54 files written,
  identical to the base binary's) and `copy extract test --dat …` (43 files, identical).
- **The suite sentence**: Node 24.22.0. tsc 0 and lint 0 on base, migrated and reverted. vitest
  `--project=native`: base 5,125 / 5,127, migrated 5,120 / 5,121 (six fewer cases: the shim's
  test is deleted). The one failure in every run is `isFileOpen` with a non-ASCII path in a
  macOS temp directory, environmental, as on 1.9.2; the second base failure was a 45 s timeout
  under load average 90 that passed 35 / 35 when its file was re-run alone. e2e 0 on all.
  The comment says "Node 24" and no other version because Node 22 (≥ 22.22.2) is not installed
  here and Node 26.10.0 was skipped for load (load average 64 against a gate of 50). On 1.9.2,
  Node 26 matched base on every step.
- **"44 argument vectors"**: through both built trees, stdout (as a multiset of lines: igir
  scans in parallel, so `WARN` lines come in any order), stderr, exit code and the files written.
  44 / 44, and the yargs-against-yargs control is 44 / 44. `--json`, `--schema`, `--mcp` and
  `completion zsh|bash` now print yargs' own errors under igir's `.parse(argv, {}, cb)`.
- **"burgee brings five"**: `burgee@1.9.4` depends on bellpull, closeout, linegauge, roundel and
  seniority. **"132 packages to 129"**: production entries in `package-lock.json`. **"about
  1.26 MB"**: the bytes of the 6 added directories (1,729,422) less the 9 removed (474,062),
  +1,255,360 B.
- **"One maintainer"**: `npm view <pkg> maintainers` on all six packages: `ofriperetz` only.
  yargs' 13 packages have nine accounts, two of them bots (1.9.2 proof).
- **Not said, on purpose**: speed. The 1.9.2 cold-start measurement was within its own spread,
  and it was not re-measured on 1.9.4.
