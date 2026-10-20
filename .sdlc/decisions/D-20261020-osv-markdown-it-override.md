---
id: D-20261020-osv-markdown-it-override
subject: 'GHSA-r7fv-28h4-cvq7 (markdown-it smartquotes, quadratic) reached the lockfile through markdownlint-cli2, which pins markdown-it 15.0.1 exactly. Override or waive?'
taken: Taken
date: '2026-10-20'
superseded_by: —
---

**Override `markdown-it` to `^15.0.2`, the first fixed 15.x release. It resolves to 15.0.3.
No waiver is needed.**

On 2026-10-20 the advisory reddened `check:osv` on every PR, the closeout Version PR #1199
included. The only path to it is the dev tool `<root> > markdownlint-cli2@0.23.3 >
markdown-it@15.0.1`. markdownlint-cli2 pins the exact version, and 0.23.3 is its latest
release, so only an override moves it. This follows `D-20261011-osv-lockfile-zero`, which
did the same for `katex` and `smol-toml` under the same parent.

The bump is a patch within the major markdownlint-cli2 already uses. The override's
`linkify-it`, `entities` and `argparse` move up a minor or patch inside their ranges.
`npm run lint:md` reads 0 issues in 813 files after the change, as it did before.
`npm run check:osv` reads 0 unwaived advisories, and the one waiver is still braces.
No published package depends on markdown-it.

**Revisit:** when a markdownlint-cli2 release depends on markdown-it >= 15.0.2, the override
matches what the parent already asks for, and it can go.
