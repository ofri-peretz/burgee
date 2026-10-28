# Draft — the one disclosed pull request for `first-adopter`

**Status: comment posted, PR held for the maintainer's yes.** The comment below was posted on
open-cli-tools/concurrently#418 on 2026-10-28: <https://github.com/open-cli-tools/concurrently/issues/418#issuecomment-6455508479>. The pull request further down is not
opened. It follows only if the maintainer says yes, and its numbers are then replaced from the
1.8.0 re-run in [`concurrently.md`](../../research/adoption/concurrently.md#re-run-on-burgee180-2026-10-27).

How it got here. On 2026-10-27 the owner chose a short disclosed comment on #418 first and cut the
cold-start line, on condition that the whole proof passed on the published fix. The re-run on
`burgee@1.8.0` passed everything but one expectation: `concurrently --mcp` does not serve, because
concurrently's own `process.exit()` on an empty argv ends the server first
([A-20261027-yargs-parsesync-mcp-ended-by-exit](../../gaps/A-20261027-yargs-parsesync-mcp-ended-by-exit.md)).
Nothing was posted that day. On 2026-10-28 the owner chose to post a revised text that says
`--mcp` behaves as it does today for concurrently, and does not promise the fix.

## Posted comment, 2026-10-28

Posted once, under `ofri-peretz`, exactly as below. Every number is from the 1.8.0 re-run.

```markdown
Hi, I'm Ofri Peretz. I wrote and maintain burgee, so please read this with that in mind.

You said you'd consider dropping yargs if the replacement keeps full compatibility and has decent TypeScript types, and that you'd rather agree on the library before anyone opens a PR. So this is a measured proposal, not a PR.

`burgee/yargs` implements the yargs API, so the change is two import lines in `bin/index.ts` and an exact pin, `"burgee": "1.8.0"`. `.env('CONCURRENTLY')` and the `.group()` headings stay as written, and `typecheck` passes against burgee's own types.

What I measured on 2a80d44 with the published burgee 1.8.0:

- `build`, `typecheck`, `lint` and `format` pass. vitest is 649/649 before, after, and after reverting, on Node 22.22, 24.12 and 26.10.
- `--help` is byte-identical.
- I ran the same 41 argument vectors through both packed builds: every option group, `-P`, invalid values, unknown flags, and the `CONCURRENTLY_*` variables. 38 are identical in stdout, stderr and exit code. The 3 that differ are flags burgee reserves. `--json` is now a boolean, so `--json "echo a"` runs the command where it used to print help. `--schema` prints a JSON description of the CLI. `completion zsh` prints a completion script instead of trying to run a command called `completion`. `--mcp` behaves exactly as today and prints help, because concurrently does its work after `parseSync()` returns.
- Dependencies go from 19 packages to 12. `npm audit --omit=dev` is 0 before and after.

What it costs:

- It isn't lighter. The parser's install grows from 511 KB to 1.72 MB.
- yargs' packages have eight npm maintainers. burgee's have one, me, and it was first published on 2026-09-07.

Undoing it is one `git revert`.

If you'd like the PR, I'll open it. If not, that's a fine answer.
```

Target, evidence and rejected candidates: [`concurrently.md`](../../research/adoption/concurrently.md).
Decision: [D-20261027-first-adopter-target-concurrently](../../decisions/D-20261027-first-adopter-target-concurrently.md).

## Owner's calls before posting

Decided 2026-10-27: a comment on #418 first, and the cold-start line cut. Decided 2026-10-28: post
the revised text without waiting for the `--mcp` fix. The calls as they were put:

- **A pull request, or a comment on #418 first.** The owner's 2026-10-27 rule and intent
  constraint 4 both say a working PR. But in #418 gustavohenke asked to agree on the library
  before anyone puts hours into a PR, and outreach-yes-patterns rule 1 says issue-first gets
  merged. The draft below is a PR that opens by saying it is that concrete proposal and that
  closing it is fine. A comment on #418 would notify all four earlier participants, among them
  shadowspawn, who helps maintain commander and yargs.
- **Whether to mention cold start at all.** The measured lead is 10 to 21 ms on `--version`, on a
  loaded laptop, and is within noise on a real run. The body includes it with that caveat.
  Cutting the line loses nothing.
- **Identity.** Commit as `Ofri Peretz <ofriperetzdev@gmail.com>` (the preflight checks it), from
  Ofri's own fork, with no `Co-Authored-By` trailer and no generated-by footer.

## Title

```text
deps: replace yargs with burgee/yargs, keeping the yargs API (#418)
```

## Body

> Not opened. If the maintainer says yes, `<burgee version>` and every number below are replaced
> from the 1.8.0 re-run, the cold-start line is cut, and the reserved-shape list matches the posted
> comment. The numbers shown are from `burgee@1.7.2` on `2a80d44`.

```markdown
Hi, I'm Ofri Peretz. I wrote and maintain burgee, the package this PR adds, so please read it with
that in mind. I'm opening it because of #418.

In #418 you said you'd take a PR that drops yargs if it keeps full compatibility and has decent
TypeScript types, and that you'd rather agree on the library first. Treat this as a concrete
version of that conversation. If burgee isn't the library you'd pick, closing this is a perfectly
good answer.

**What changes.** Two import lines in `bin/index.ts`, plus `package.json` and the lockfile:

    -import yargs from 'yargs';
    -import { hideBin } from 'yargs/helpers';
    +import yargs from 'burgee/yargs';
    +import { hideBin } from 'burgee/yargs/helpers';

`burgee/yargs` implements yargs 18's API. CI checks it against yargs' own test suite: 816 of 816,
where yargs itself passes 814 at the graded commit. Nothing else in concurrently changes, so
`.env('CONCURRENTLY')` and the `.group()` headings that came up in #418 stay exactly as written.
The version is pinned exactly, like your other runtime dependencies.

**What I measured**, on macOS, at 2a80d44:

- `build`, `typecheck`, `lint` and `format` all pass. `vitest run` is 649/649 before and after, on
  Node 22.22, 24.12 and 26.10.
- `--help` is byte-identical.
- I packed both versions, installed each into an empty directory, and ran the same 40 argument
  vectors through both binaries: every option group, `-P` passthrough, invalid values, unknown
  flags and the `CONCURRENTLY_*` variables. 36 are identical in stdout, stderr and exit code. The
  other 4 are below.
- `npm i --omit=dev`: concurrently's dependencies go from 19 packages to 12. yargs and its 12
  dependencies are replaced by burgee and its 5.
- `npm audit --omit=dev`: 0 before, 0 after.
- `concurrently --version` started 10 to 21 ms faster in three rounds of 20 paired runs. That was
  on a busy laptop, and a real two-command run was within noise, so I wouldn't lean on it.

**What it costs**, plainly:

- It is not smaller. The yargs subtree is 511 KB on disk and burgee's is 1.72 MB, so the install
  grows by about 1.2 MB.
- Eight npm maintainer accounts become one, and that one is me. burgee is two months old. Every
  release is published with npm provenance, but that doesn't change the bus factor.
- burgee declares `node: ^20.19.0 || >=22.13.0`. yargs 18 already declares `^22.12.0`, so the new
  gap is 22.12.x only. It runs there; npm just prints an EBADENGINE warning.
- burgee reserves four argument shapes for itself: `--json`, `--schema`, `--mcp` and a leading
  `completion <shell>`. Before this change, `concurrently completion zsh` tried to run a command
  called `completion`. After it, burgee prints a zsh completion script instead. Likewise,
  `--schema` used to fall through to the help screen and now prints a JSON description of the
  CLI. I couldn't think of a real invocation that starts with any of these, but they are changes,
  so they're listed here.

**What I left out.** chalk and supports-color stay as they are. For concurrently today, the
`--schema`, `--mcp` and completion output is close to empty. The run happens after `parseSync()`
returns, not inside a command handler, and that's what those surfaces read. Moving it would be a
separate change if you ever wanted one; nothing here depends on it.

**To undo it:** `git revert <this commit>` restores the tree exactly (I compared the tree hashes),
and the suite is 649/649 after the revert as well.

CI will need a maintainer's approval to run, since this is my first PR here. Until then, the local
runs above are what I have.
```

## Outreach checks

Every rule in `outreach-rejection-lessons` and every bot class in `outreach-bot-recon`, checked
against concurrently on 2026-10-27.

| Rule | Result |
| :-- | :-- |
| 1. Disclose in the first lines | First sentence |
| 2. No new dependency where the stated stance is fewer | The stance is fewer packages, and this removes 7. The bytes going up is said in the body, not hidden |
| 3. Governed organisation | No. A community organisation (open-cli-tools), maintainer-merged |
| 4. Never bypass supply-chain gates | No `minimumReleaseAge`, `.npmrc` or renovate age. Nothing to bypass |
| 5. No template batches | One PR, written for #418; no other target in flight |
| 6. Fix first | No bug to fix. It answers an open request from the maintainer, with his own conditions quoted |
| 7. Prove reachability | No claim depends on it. Every number comes from their own binary |
| 8. CLA and contributor gates | None. No CLA workflow or bot, and the statuses on #630, #631 and #634 are Coveralls only |
| 9. Claim only what CI runs | The body names `build`, `typecheck`, `lint`, `format` and `vitest`, the steps `.github/workflows/ci.yml` runs |
| 10. Coverage on their real sinks | Not applicable (no lint rules) |
| `preflight-outreach.mjs` on the PR-shaped clone | `preflight: clean — no known-fatal defect in this diff.` |

| Bot class | concurrently |
| :-- | :-- |
| CLA / ECA | None |
| Stale or auto-close | None (`ci.yml` and `release.yml` only) |
| First-time-contributor CI approval | Expected: Ofri has never contributed. Said in the body |
| AI code reviewers | None configured: no `.coderabbit.yaml`, `copilot-instructions.md`, `AGENTS.md` or `CLAUDE.md` |
| Supply-chain scanners | None: no Socket, Snyk or CodeQL workflow. Coveralls only |
| Release-age | None |
| Deploy previews | None |
| Release tooling | Automated. Their CONTRIBUTING says not to bump versions, so the PR touches none |
| Merge gates | No CODEOWNERS. gustavohenke reviews and merges |
| Local hooks | husky and lint-staged run prettier and eslint on commit. The PR's files pass both |
