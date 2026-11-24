---
id: D-20261124-npm-similarity-rename
subject: 'What are loadline and truemark called on npm, after npm refused both names?'
taken: 'valz for the validator and fibz for the test-integrity package — the owner, 2026-11-24, on two name cards in the coordinating session'
date: '2026-11-24'
superseded_by: —
---
**`loadline` is now `valz`; `truemark` is now `fibz`.** Both stay unscoped.

On the first manual publish (2026-11-24) npm answered E403 for both: `loadline` is "too similar to
existing package readline", `truemark` "too similar to existing package remark". Each is two edits
from a popular package. npm offered `@ofriperetz/*`; the owner declined a personal scope and asked
for short, memorable names in the spirit of zod and joi. Both new names were free on npm on
2026-11-24 and are three or more edits from every popular package checked (about 1,000).
`truefit` and `truepass` were picked first and dropped the same hour as not memorable enough.

This supersedes the name in
[`D-20261119-validator-name-loadline`](./D-20261119-validator-name-loadline.md) and the name in
[`D-20261123-truemark-lives-in-burgee`](./D-20261123-truemark-lives-in-burgee.md); where each package
lives is unchanged.
