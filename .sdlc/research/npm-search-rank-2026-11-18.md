# npm search rank — the burgee family, 2026-11-18

Intent [`npm-search`](../intents/npm-search/) criterion 4, read after the 2026-11-18 release
(#1648) published the shortened descriptions. Before the reading, every changed package's search
result already carried its new registry description. Command:

```text
npx tsx scripts/npm-search-rank.ts --check   # exit 1
```

| Package | Kind | Phrase | Rank |
| --- | --- | --- | --- |
| bellpull | primary | child process | #181 |
| bellpull | incumbent | cross-spawn alternative | >250 |
| burgee | primary | cli framework | #98 |
| burgee | incumbent | commander alternative | >250 |
| caique | primary | cli prompts | #16 |
| caique | incumbent | inquirer alternative | >250 |
| closeout | primary | exit hook | #6 |
| closeout | incumbent | signal-exit alternative | >250 |
| controlroom | primary | tui framework | #19 |
| controlroom | incumbent | ink alternative | >250 |
| flagstaff | primary | cli spinner | #34 |
| flagstaff | incumbent | ora alternative | >250 |
| linegauge | primary | string width | #4 |
| linegauge | incumbent | string-width alternative | >250 |
| oxmutate | primary | mutation testing | #50 |
| oxmutate | incumbent | stryker alternative | >250 |
| paratext | primary | terminal hyperlinks | #2 |
| paratext | incumbent | ansi-escapes alternative | >250 |
| roundel | primary | terminal colors | #20 |
| roundel | incumbent | chalk alternative | >250 |
| seniority | primary | config loader | #100 |
| seniority | incumbent | cosmiconfig alternative | >250 |

## Against the target

| Group | Package | Before (2026-11-15) | Now | Top 10 |
| --- | --- | --- | --- | --- |
| within reach | closeout | #8 | #6 | yes |
| within reach | linegauge | #6 | #4 | yes |
| within reach | paratext | #138 | #2 | yes |
| within reach | caique | >250 | #16 | no |
| within reach | controlroom | >250 (`terminal ui`) | #19 | no |
| within reach | roundel | >250 | #20 | no |
| within reach | flagstaff | >250 | #34 | no |
| downloads-bound | oxmutate | #48 | #50 | no |
| downloads-bound | burgee | #106 | #98 | no |
| downloads-bound | seniority | >250 | #100 | no |
| downloads-bound | bellpull | >250 | #181 | no |

Every primary phrase moved up except oxmutate's, and seven entered the first 250 for the first
time. Only 3 of the 7 packages the spec put within reach by wording made the top 10, so by
criterion 4 the target is missed. **caique, controlroom, roundel and flagstaff reopen the
intent.** The four downloads-bound misses were predicted, and they open an adoption intent, not
another rewording.

No incumbent phrase (`<incumbent> alternative`) is in the first 250 for any package.

The reading was taken hours after publish. If npm's popularity and quality scores lag the
description, a re-reading may move these ranks, so the next reading, one week on, is what
confirms the misses.
