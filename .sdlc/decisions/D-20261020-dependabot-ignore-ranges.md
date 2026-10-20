---
id: D-20261020-dependabot-ignore-ranges
subject: 'Exact-version Dependabot ignores for next and fumadocs only moved the proposal one release down (#1210). Skip the release lines instead?'
taken: Taken
date: '2026-10-20'
superseded_by: —
---

**`next` skips `>=16.4.0 <16.5.0`, and `fumadocs-core`/`fumadocs-ui` skip `>16.17.1 <16.18.0`.
react 19.3.1 and js-yaml 5.5.0 keep their exact-release ignores. This supersedes the
exact-release half of `D-20261020-dependabot-rejected-bumps` for these two dependencies only.**

Within an hour of #1208 ignoring next 16.4.2 and fumadocs 16.17.5, Dependabot opened #1210
with next 16.4.1 and fumadocs 16.17.4. They failed the same way. The Build lane's runner was
shut down mid-build, as with 16.4.0 (#1088) and 16.4.2 (#1148, #1181). The lockfile also lacked
the `@emnapi` entries that npm 11.16 refuses.

- **next:** every 16.4 release tried so far (16.4.0, 16.4.1 and 16.4.2) breaks the docs build.
- **fumadocs:** the cause is fumadocs-mdx's peer pin, which keeps 16.17.1 at the root, not
  any one release. Every later 16.17 patch lands as a second copy.

An exact-version ignore therefore only invites the next release below it. #1210 is closed
with a link here.

**Revisit:**
- **next:** 16.5.0 is proposed on its own, because the range ends at 16.5.0. Grade it there.
- **fumadocs:** when fumadocs-mdx widens its fumadocs-core peer past 16.17.1, drop the
  fumadocs entries.
