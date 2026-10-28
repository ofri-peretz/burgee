# Draft — the one disclosed pull request for `first-adopter`

**Status: comment posted; pull request opened 2026-10-28 as open-cli-tools/concurrently#639.**
The comment below was posted on open-cli-tools/concurrently#418 on
2026-10-28: <https://github.com/open-cli-tools/concurrently/issues/418#issuecomment-6455508479>. Later
the same day the proof was re-run on `burgee@1.9.1`, which serves `--mcp` under `parseSync()`, and
every check passed
([`concurrently.md`](../../research/adoption/concurrently.md#re-run-on-burgee191-2026-10-28)). The
owner then approved opening the pull request without waiting for a maintainer reply, and opened it
himself: <https://github.com/open-cli-tools/concurrently/pull/639>, from `ofri-peretz:burgee-yargs`
at `d0da17b`. Its commit, title and posted body are in [`upstream/`](./upstream/). No agent
opened, pushed or commented on anything upstream.

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
the revised text without waiting for the `--mcp` fix. Decided later on 2026-10-28: open the pull
request now, on the 1.9.1 proof, without waiting for a maintainer reply. The calls as they were put:

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

## The pull request, 2026-10-28

**Opened 2026-10-28 as open-cli-tools/concurrently#639**
(<https://github.com/open-cli-tools/concurrently/pull/639>), by the owner, from his fork's
`burgee-yargs` branch at `d0da17b`. The proof clone's `revert-proof` branch (`982bce3`, the
`git revert` used for A3) was not pushed anywhere; it exists only in the local clone.

- **Branch.** `burgee-yargs` in the proof clone, one commit on concurrently's default-branch HEAD
  `2a80d44`: `d0da17b924e24d15127e8774fb25f2348562d7c1`,
  `refactor: use burgee/yargs as a drop-in for yargs`, authored as
  `Ofri Peretz <ofriperetzdev@gmail.com>`, with no `Co-Authored-By` trailer. concurrently's own
  husky and lint-staged hook ran on it, and their build, typecheck, lint, format and vitest are
  green on it under Node 22, 24 and 26.
- **Patch.** [`upstream/0001-refactor-use-burgee-yargs-as-a-drop-in-for-yargs.patch`](./upstream/0001-refactor-use-burgee-yargs-as-a-drop-in-for-yargs.patch)
  is `git format-patch` of that commit. `git am` it onto `2a80d44` in a fork to recreate the
  branch. `git apply --index` of it on `2a80d44` gives the branch's tree, `3c9f1a3080d2`.
- **Title.** [`upstream/pr-title.txt`](./upstream/pr-title.txt):

  ```text
  refactor: use burgee/yargs as a drop-in for yargs
  ```

- **Body.** [`upstream/pr-body.md`](./upstream/pr-body.md), the only copy, exactly as posted. It
  opens with the disclosure that Ofri wrote burgee, links #418 and the posted comment, and states
  the 1.9.1 numbers: 649 / 649 before, after and reverted on Node 22.22, 24.12 and 26.10 (naming
  the one `cjs-import` timeout under load), `--help` byte-identical, 37 of 41 vectors identical
  against a 41 / 41 control, the four reserved flags and what each now does, `--mcp` serving with
  an empty tool list, 19 packages to 12, +1.2 MB, eight maintainers to one, and the revert.
- **The owner's edits before posting.** The maintainer's words in #418 are quoted accurately: he
  "wouldn't mind seeing a PR that ditches yargs" if it keeps full compatibility and has decent
  TypeScript types, and "we should discuss first which library that'd be" (gustavohenke, #418). The agent's draft had said he would "take a
  PR". A line was added that `typecheck` passes on burgee's own bundled types, with the
  `cjs-import` and `cjs-require` smoke tests passing. Another notes that `@types/yargs` stays in
  devDependencies, untouched.

What changed from the 2026-10-27 body: the numbers are 1.9.1's, the cold-start line is cut as the
owner decided, and the reserved-flag list says `--mcp` serves where it used to print help. The
posted comment said `--mcp` was unchanged for concurrently. That was true of 1.8.0. The body says
what 1.9.1 does instead, including that `concurrently --mcp` typed in a terminal waits for input.

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
