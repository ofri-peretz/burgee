---
id: D-20261026-fingerprint-missing-not-rerecord
subject: 'foundation-claims-watched success criterion 3 needs every new competitor fingerprinted, and the daily watch never writes one. How are the 29 holes filled without re-recording the fingerprints already held, and does a null `seen` stay allowed?'
taken: Taken
date: '2026-10-26'
superseded_by: —
---

**A null `seen` is no longer a state the tree may hold. The holes are filled by a new `--fingerprint --missing`, which records only the competitors nothing holds a fingerprint for and leaves every held one as it is.**

**What was wrong with the design.** `foundation-claims-watched` R2 said each `seen` "is `null` until the watch fills it". The watch cannot fill it: `check()` is read-only on purpose, and `moved()` is false with nothing held, so the daily pass logged "no fingerprint held" for 29 competitors on every scheduled run from 2026-10-12 to 2026-10-25, opened nothing, and went green. Every foundation incumbent was among them. A lilconfig or tinyexec release in those two weeks would not have been reported. The intent's own failure, a number nobody re-reads, was the state the design left the six packages in.

**Why a lock, not a red scheduled job.** `competitors-lock.test.ts` now fails when any declared competitor holds no fingerprint, keyed as the watch keys it (npm package and `via`). It runs on every PR with no network, so a new declaration is fingerprinted in the PR that adds it. Turning the daily job red would only say so after the PR had merged, on a schedule nobody watches.

**Why `--missing`, not a full `--fingerprint`.** A full run re-records every competitor, held or not. On 2026-10-26 two held ones were behind their registry: `inquirer` 14.2.3 → 14.2.4 (issue #1195) and `@inquirer/prompts` 8.7.3 → 8.7.4 (#1224). Re-recording them would have marked both claims current with nobody re-grading caique against the new releases, and the watch would stop reporting them. `--missing` skips a watch that holds a fingerprint anywhere in the family, so it can never close an open upstream issue. The full run stays as it was, for the step after a person has re-measured a moved release.

**One null is left on purpose.** caique's `.` clack entry shares its watch with `./ask`'s clack, which holds 1.8.1. The watch reads the first fingerprint a resolution holds, so that entry is watched already. The lock asks the watch's question, not the file's, and accepts it.

**Cost.** No new dependency, no workflow change. The `fingerprint()` signature gains an options argument, and compat-oracle is private, so nothing publishes. The 29 readings add about 1,500 lines of hashes across eight `competitors.json` files. That is the price of a diff a person can review when one of them moves.
