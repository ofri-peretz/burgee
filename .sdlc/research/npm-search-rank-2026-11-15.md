# npm search rank — the burgee family, 2026-11-15

The reading behind [`intents/npm-search/`](../intents/npm-search/). Every number here came from
the npm registry search API on 2026-11-15:

```text
https://registry.npmjs.org/-/v1/search?size=250&text=<phrase>
```

A rank is the package's 1-based position in `objects`; `>250` means it is not in the first 250.
`searchScore` is the field the API returns beside each package. Weekly downloads are
`https://api.npmjs.org/downloads/point/last-week/<name>`. The API rate-limits bursts, so the
readings were taken one query at a time with a pause between them.

## 1. Where each package ranks today

Phrases a person might type at setup time, and the bare incumbent names.

| Package | Phrase | Rank | Phrase | Rank |
| --- | --- | --- | --- | --- |
| bellpull | run subprocess | >250 | cross-spawn | #18 |
| bellpull | child process | >250 | execa alternative | >250 |
| bellpull | process execution | >250 | cross-spawn alternative | >250 |
| burgee | cli framework | #106 | commander alternative | >250 |
| burgee | argument parser | >250 | yargs alternative | >250 |
| caique | cli prompts | >250 | inquirer alternative | >250 |
| closeout | exit hook | #8 | signal-exit | #3 |
| closeout | signal exit | #4 | signal-exit alternative | >250 |
| closeout | graceful shutdown | >250 | restore cursor | #3 |
| controlroom | terminal ui | >250 | ink alternative | >250 |
| controlroom | tui | >250 | terminal screens | #1 |
| flagstaff | cli spinner | >250 | ora alternative | >250 |
| flagstaff | terminal spinner | >250 | cli-table3 | #5 |
| flagstaff | progress bar | >250 | log-update | #8 |
| linegauge | string width | #6 | string-width alternative | >250 |
| linegauge | wrap ansi | #9 | slice-ansi | #5 |
| oxmutate | mutation testing | #48 | stryker alternative | >250 |
| paratext | terminal hyperlink | >250 | terminal link | #6 |
| paratext | terminal hyperlinks | #138 | ansi-escapes alternative | >250 |
| roundel | cli colors | >250 | chalk alternative | >250 |
| roundel | terminal colors | >250 | colorette | #4 |
| seniority | config loader | >250 | cosmiconfig alternative | >250 |
| seniority | configuration loader | >250 | lilconfig | #5 |

The pattern: **a small incumbent's name already ranks us top 10** (`string-width` #6,
`cli-table3` #5, `colorette` #4, `exit-hook` #8), because the description's last sentence —
"Drop-in paths for …" — carries that name. **A category phrase does not**, because the
description does not contain its words in the form people type them. **A big incumbent's name
does not either** (`chalk` #219, `commander` #230): hundreds of `chalk-*` and `commander-*`
packages match on the name field.

## 2. What the score is made of

For each phrase, every result whose description contains the exact phrase and whose name does
not contain any of its words was fitted by least squares:

```text
ln(searchScore) = a + b·ln(weekly + 1) + c·ln(description length) + d·(phrase offset / length)
```

| Phrase | n | b (downloads) | c (length) | d (position) | R² |
| --- | --- | --- | --- | --- | --- |
| cli framework | 90 | 0.160 | -0.219 | -0.029 | 0.87 |
| mutation testing | 95 | 0.147 | -0.296 | -0.301 | 0.85 |
| terminal spinner | 18 | 0.135 | -0.342 | +0.269 | 0.91 |
| config loader | 53 | 0.136 | -0.160 | +0.101 | 0.80 |
| child process | 133 | 0.123 | -0.239 | -0.164 | 0.68 |

Read plainly:

- **Ten times the downloads is about ×1.4 on the score.** Halving the description's length is
  about ×1.2.
- **Where the phrase sits has no consistent effect.** Its sign flips between phrases, and it is
  small beside the other two. `burgee` already opens "A CLI framework" and scores 73 with
  1,137 weekly downloads and a 253-character description; `@simplysf/simply-apex-core` has the
  phrase at character 162 of 175 and scores 116 with 7,965.
- **There is no stemming, and adjacency matters.** paratext's description opens "Hyperlinks":
  it ranks #37 for `hyperlinks` and >250 for `hyperlink`. It contains both "terminal" and
  "hyperlinks", apart, and ranks #138 for `terminal hyperlinks`. flagstaff opens "Spinners" and
  is >250 for `cli spinner`.
- **Keywords do not carry a phrase.** burgee's `keywords` include `commander-alternative` and
  `yargs-alternative`; it is >250 for both searches. lilconfig, whose whole description is
  "A zero-dependency alternative to cosmiconfig", is #1 for `cosmiconfig alternative`.

So the lever is **the searched words, in the form searched, adjacent, in the description** —
not their position in it. Leading with them is still right for the reader, who skims the first
words of each result, but that is a reading argument, not a ranking one.

## 3. What a wording change can reach

The same fit, per phrase, with the package's own weekly downloads and the proposed
description's length, gives a predicted score; its rank is the number of today's results
above it. `n < 8` is too few descriptions holding the phrase to fit — the competition there is
names, and the prediction is left to the post-publish reading.

| Package | Phrase | Weekly | Today | Predicted | Top 10 needs |
| --- | --- | --- | --- | --- | --- |
| bellpull | child process | 860 | >250 | #101 | ~4.6M/wk |
| bellpull | process execution | 860 | >250 | #33 | — |
| burgee | cli framework | 1,414 | #106 | #64 | ~115k/wk |
| burgee | cli toolkit | 1,414 | >250 | #18 | — |
| caique | cli prompts | 618 | >250 | #12–13 | ~1,000/wk |
| controlroom | terminal ui | 379 | >250 | #240 | ~2.5M/wk |
| controlroom | tui framework | 379 | >250 | #14 | — |
| controlroom | terminal user interface | 379 | >250 | #51 | — |
| oxmutate | mutation testing | 1,447 | #48 | #44 | ~590k/wk |
| oxmutate | mutation testing tool | 1,447 | >250 | #9 | — |
| roundel | terminal colors | 1,079 | >250 | #7–8 | (reached) |
| seniority | config loader | 1,089 | >250 | #59 | ~157k/wk |
| seniority | config resolution | 1,089 | >250 | #15 | — |
| seniority | load config | 1,089 | >250 | #13 | — |
| flagstaff | cli spinner | — | >250 | n=5 | — |
| flagstaff | terminal spinner | — | >250 | #23 | — |
| paratext | terminal hyperlinks | — | #138 | n=1 | — |

**A broad phrase's top 10 is held by name matches and by packages with 100k+ weekly downloads**
(`@ionic/cli-framework-output` at 6.6M, `@adonisjs/ace` at 273k). Wording does not reach it;
only adoption does. A narrower phrase that is still what someone types — `tui framework`,
`terminal colors`, `cli prompts` — is reachable at today's downloads.

## What this reading does not know

**How often anyone types each phrase.** npm publishes no query volume. The phrases were chosen
by reading the incumbents' own descriptions — the words their users found them with — not from
a measured volume.
