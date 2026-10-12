---
id: D-20261011-osv-lockfile-zero
subject: 'Scorecard''s Vulnerabilities check read 9 OSV advisories in the lockfile. Seven have a fix or a removable path; `braces` has neither. Waive it with an expiry, or leave the point off the badge?'
taken: Owner
date: '2026-10-11'
superseded_by: —
---

**Default: `braces` is waived in `osv-scanner.toml` until 2026-11-30. Everything else is fixed.**
That holds until the owner says otherwise. Deleting the one entry drops the waiver. The badge
then reads 9/10 instead of 10/10, and `check:osv` goes red.

The measure is `npm run check:osv` (`scripts/osv-check.ts`). It queries OSV for every package
in `package-lock.json`, which is the question Scorecard asks. Run against main at `6d117f4ace`,
it named the same 9 IDs as the public Scorecard result.

- In range, so only the lock moved: dompurify 3.4.15 → 3.4.16 (posthog-js),
  serialize-javascript 7.1.1 → 7.1.2 (mocha), sharp 0.35.4 → 0.35.5 (next),
  shell-quote 1.10.0 → 1.12.0 (launch-editor).
- Through an override, because the parent pins an exact version or a semver range below
  the fix: `katex` ^0.18.2 (markdownlint → micromark-extension-math pins ^0.16) and
  `smol-toml` ^1.9.0 (markdownlint-cli2 pins 1.8.0).
- **sprintf-js has no fixed release.** The last affected version, 1.1.3, is also the latest.
  The path to it was removed instead: ava → supertap → js-yaml@3 → argparse@1 → sprintf-js.
  js-yaml@3 calls argparse only in its own `bin/js-yaml.js`. The library supertap imports
  never does. The override `js-yaml@3 → argparse ^2.0.1` drops sprintf-js from the tree. It
  breaks only that nested js-yaml CLI, and nothing runs it. If supertap moves to js-yaml 4,
  the override matches nothing and can go.
- **braces has no fixed release and no removable path.** 3.0.3 is the latest version
  (2024-05-21), and the advisory sets `last_affected` to 3.0.3. The fix PRs upstream
  (micromatch/braces#78, #79, #82, #87) are unmerged. The maintainer disputes the advisory in
  github/advisory-database#10132, which is still open. Two dev tools reach it:
  markdownlint-cli2 → micromatch, and ava → globby → fast-glob → micromatch. micromatch 4.0.8
  and fast-glob 3.3.3 are their latest releases and both need braces. Both tools expand glob
  patterns this repo writes. No published package depends on it, because the ten packages
  depend only on each other.

This goes to the owner because a waiver is a documented defect, not a fixed one. Scorecard's
own remediation text points at `osv-scanner.toml` for "does not affect your project". The
reachability above is the case that it does not. The waiver has an expiry date so that it
gets looked at again. `check:osv` fails on an expired waiver. It also fails on a waiver that
nothing matches any more, so the entry is removed once braces ships a fix.
