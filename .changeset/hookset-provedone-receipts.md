---
"hookset": minor
---

The reusable `hookset-check.yml` workflow gains a `provedone receipts` job on pull requests: it runs `provedone gate --mode enforce` on every non-merge commit, so a commit that skipped the `commit-msg` hook (the web editor, a bypassed hook) fails CI without its `Verified-by:` receipt. The Version PR and bot-opened PRs are exempt.
