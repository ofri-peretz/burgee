# npm search rank — the burgee family, 2026-11-25

Intent [`npm-search`](../intents/npm-search/) criterion 4: the one-week re-reading of the
2026-11-18 reading, which was taken hours after publish. No description among the original eleven
has changed since 2026-11-18, so any movement is npm's scoring catching up, not the wording.
Taken 2026-11-25 02:50 UTC. Command:

```text
npx tsx scripts/npm-search-rank.ts --check   # exit 1: 15 primary phrases outside the top 10
```

| Package      | Kind      | Phrase                           | Rank |
| ------------ | --------- | -------------------------------- | ---- |
| bellpull     | primary   | child process                    | #174 |
| bellpull     | incumbent | cross-spawn alternative          | >250 |
| burgee       | primary   | cli framework                    | #96  |
| burgee       | incumbent | commander alternative            | >250 |
| caique       | primary   | cli prompts                      | #16  |
| caique       | incumbent | inquirer alternative             | >250 |
| closeout     | primary   | exit hook                        | #7   |
| closeout     | incumbent | signal-exit alternative          | >250 |
| controlroom  | primary   | tui framework                    | #21  |
| controlroom  | incumbent | ink alternative                  | >250 |
| flagstaff    | primary   | cli spinner                      | #35  |
| flagstaff    | incumbent | ora alternative                  | >250 |
| linegauge    | primary   | string width                     | #4   |
| linegauge    | incumbent | string-width alternative         | >250 |
| oxmutate     | primary   | mutation testing                 | #50  |
| oxmutate     | incumbent | stryker alternative              | >250 |
| paratext     | primary   | terminal hyperlinks              | #2   |
| paratext     | incumbent | ansi-escapes alternative         | >250 |
| roundel      | primary   | terminal colors                  | #21  |
| roundel      | incumbent | chalk alternative                | >250 |
| seniority    | primary   | config loader                    | #94  |
| seniority    | incumbent | cosmiconfig alternative          | >250 |
| truepass     | primary   | test integrity                   | >250 |
| truepass     | incumbent | eslint-plugin-vitest alternative | >250 |
| contractdiff | primary   | breaking change diff             | >250 |
| contractdiff | incumbent | oasdiff alternative              | >250 |
| truefit      | primary   | ts validator                     | >250 |
| truefit      | incumbent | zod alternative                  | >250 |
| provedone    | primary   | verified commits                 | >250 |
| provedone    | incumbent | commitlint alternative           | >250 |
| replz        | primary   | code review benchmark            | >250 |
| replz        | incumbent | promptfoo alternative            | >250 |
| hookset      | primary   | git hooks presets                | >250 |
| hookset      | incumbent | husky alternative                | >250 |
| triggerlist  | primary   | code review checklist            | >250 |
| triggerlist  | incumbent | danger alternative               | >250 |

## Against the target (the original eleven)

| Group           | Package     | 2026-11-15 | 2026-11-18 | 2026-11-22 | Now  | Top 10 |
| --------------- | ----------- | ---------- | ---------- | ---------- | ---- | ------ |
| within reach    | closeout    | #8         | #6         | #6         | #7   | yes    |
| within reach    | linegauge   | #6         | #4         | #4         | #4   | yes    |
| within reach    | paratext    | #138       | #2         | #2         | #2   | yes    |
| within reach    | caique      | >250       | #16        | #16        | #16  | no     |
| within reach    | controlroom | >250       | #19        | #19        | #21  | no     |
| within reach    | roundel     | >250       | #20        | #23        | #21  | no     |
| within reach    | flagstaff   | >250       | #34        | #33        | #35  | no     |
| downloads-bound | oxmutate    | #48        | #50        | #50        | #50  | no     |
| downloads-bound | burgee      | #106       | #98        | #101       | #96  | no     |
| downloads-bound | seniority   | >250       | #100       | #101       | #94  | no     |
| downloads-bound | bellpull    | >250       | #181       | #172       | #174 | no     |

A week on, no within-reach rank moved more than two places, and none crossed the top-10 line. The
lag hypothesis is cleared: npm's score did not trail the new descriptions. The misses stand.
**caique, controlroom, roundel and flagstaff are a design failure under criterion 4**, and the
four downloads-bound misses were predicted.

## The seven packages added since

truepass, contractdiff, truefit, provedone, replz, hookset and triggerlist joined the phrase table
after the intent's target was set, and all first published on 2026-11-24 (01:24 to 14:48 UTC). This
is their first reading, a baseline rather than a test: every primary and incumbent phrase is >250.
Six of the seven are already indexed with their current description (a search for the package's own
name finds it in the top 4). **truefit is not in the search index yet**: a search for `truefit`
does not return it. Their phrases are broad (between 49,710 and 486,208 matching packages), and the
packages were 12 to 25 hours old when read.
