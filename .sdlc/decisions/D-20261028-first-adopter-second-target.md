---
id: D-20261028-first-adopter-second-target
subject: 'first-adopter: which CLI is lined up second, in case open-cli-tools/concurrently#639 is declined or ignored, and is it ready to post?'
taken: 'emmercm/igir, answering its own open #2249. It runs in parallel with #639 and does not replace it. Proven on burgee@1.9.2 and NOT ready: three burgee gaps block the comment, which is drafted and held. Taken by the agent preparing the build under the owner''s delegation; every post is the owner''s'
date: '2026-10-28'
superseded_by: —
---

**The second candidate is [emmercm/igir](https://github.com/emmercm/igir), answering its open
[#2249](https://github.com/emmercm/igir/issues/2249), "Replace 'yargs' with 'commander' or
something else".** The shortlist, the bot recon, the proof and the friction are in
[`.sdlc/research/adoption/igir.md`](../research/adoption/igir.md). The held texts are in
[`first-adopter/upstream-igir/`](../intents/first-adopter/upstream-igir/).

**It runs beside open-cli-tools/concurrently#639, not instead of it.** #639 was opened by the
owner on 2026-10-28 and is open with no reply
([D-20261027-first-adopter-target-concurrently](./D-20261027-first-adopter-target-concurrently.md)).
Nothing here changes it, and nothing here waits for it. The intent closes A1 and A6 on whichever
merges first.

**Why igir.** Of the five candidates (the four C targets left in `adoption-targets.md` and
what `gh search issues` found), it is the only one whose maintainer has asked, in an open issue
he wrote, to replace the parser. That is issue-first, rule 1 of outreach-yes-patterns. It pins
yargs 18.2.0, the version `burgee/yargs` is graded against (816 / 816). It merges outside
contributors (5 in the last 60 days, 33 from 17 authors all-time), has no CLA and no AI
reviewer, and is a personal repository, not a governed one.

**Why not the others.** graphql-code-generator, dependency-cruiser, commitlint and
markdownlint-cli have no open ask, so each would be a cold pitch. dependency-cruiser and
markdownlint-cli are on commander, where the swap adds packages. commitlint and markdownlint-cli
merged no outside PR in 60 days. Every other open ask found wants `node:util.parseArgs` or no
dependency at all, which burgee is not.

**The risk, stated before the proof.** igir is shrinking its dependencies (Moment.js, crc-32,
node-disk-info and 7z-iterator replaced with native or custom code since June), and #2249 names
commander's zero dependencies as the bar. burgee has five. That is outreach rule 2's warning, and
it is why the approach is a comment that asks first and offers commander as a fine answer, never
a cold PR.

**What the proof found on `burgee@1.9.2`.** The suite holds: `tsc`, vitest and the end-to-end
script pass as on the base tree, `--help` is byte-identical, 39 of 44 argument vectors are
identical against a 44 / 44 control, and `git revert` restores the tree. Three checks fail, each a
burgee gap:

- igir's own `bun scripts/compile.ts` builds a binary that throws on every invocation,
  because `burgee/yargs` walks the disk at load to find its locale files:
  [A-20261028-yargs-locale-read-at-runtime](../gaps/A-20261028-yargs-locale-read-at-runtime.md).
  That is the defect #2249 was opened over, so the comment cannot be posted until it is fixed.
- `--json`, `--schema`, `--mcp` and `completion` misbehave under the `.parse(argv, {}, cb)` form
  igir uses, and `--json` prints `"ok": true` before a run that fails:
  [A-20261028-yargs-parse-callback-surfaces](../gaps/A-20261028-yargs-parse-callback-surfaces.md).
- `npm run lint` fails, because burgee's `Argv` lacks `@types/yargs`' call signature:
  [A-20261028-yargs-argv-type-call-signature](../gaps/A-20261028-yargs-argv-type-call-signature.md).

A fourth, which does not block, is
[A-20261028-migrate-transitive-reads-dev-deps](../gaps/A-20261028-migrate-transitive-reads-dev-deps.md).

**Decided not to fix:** `burgee migrate` refuses to move igir, because its shim reaches into
yargs' build files by computed paths. No rewrite can follow a computed path, and refusing is
the safe outcome, so the swap is made by hand and the report says so.

**Nothing is posted.** The comment, the PR body and the patch are drafted and marked
`NOT POSTED — awaiting owner go`. The order is: fix the three gaps, publish, wait until that
release is at least 7 days old (igir's Renovate `minimumReleaseAge`), re-run the whole proof on
it, replace every number marked *(1.9.2)*, re-read #2249, and then ask the owner. The PR follows
only on the maintainer's yes. Confidence that posting today would be received well is below the
90% bar, because the comment's main claim is false on 1.9.2.
