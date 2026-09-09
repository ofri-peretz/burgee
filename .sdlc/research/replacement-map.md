# Replacement map — every package, and exactly what it replaces

> Research, 2026-09-09. One row per incumbent, measured from `api.npmjs.org` and
> `registry.npmjs.org` on that date. This is the source for any B4 weight claim and for the
> override recipe in `candidate-layers.md` §5. Download figures drift; re-run §Reproducing
> before publishing any number from here.

## Summary

| Tier | Layer | Package | Incumbents | Their combined weekly |
| :-- | :-- | :-- | --: | --: |
| Engine | argv, dispatch, manifest | [`burgee`](../../packages/burgee/) | 14 | **1.90 B** |
| Output stack | colour | [`roundel`](../../packages/roundel/) | 9 | **2.32 B** |
| Output stack | render | [`flagstaff`](../../packages/flagstaff/) | 9 | **360 M** |
| Output stack | prompt | [`caique`](../../packages/caique/) | 4 | **138 M** |
| Foundation | text | [`linegauge`](../../packages/linegauge/) | 12 | **2.16 B** |
| Foundation | config | [`seniority`](../../packages/seniority/) | 16 | **1.81 B** |
| Foundation | process | [`bellpull`](../../packages/bellpull/) | 15 | **2.29 B** |
| Foundation | lifecycle | [`closeout`](../../packages/closeout/) | 6 | **685 M** |
| | | **total** | **85** | **11.67 B** |

Eight packages standing in for **85 incumbents** carrying **11.67 B weekly downloads**
between them. The figure double-counts where one incumbent serves two layers (`ansi-escapes`,
`onetime`), and it counts transitive dependencies of the incumbents as well as the incumbents
themselves — because those are what actually leave a tree when the top-level package does.

## `burgee` — the argv, dispatch, manifest layer

*Engine.* Replaces **14 packages**, **1.90 B/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `commander` | 451,090,873 | 0 | 2026-05-29 |
| `yargs` | 229,025,561 | 6 | 2026-07-26 |
| `cliui` | 212,350,843 | 3 | 2025-03-17 |
| `yargs-parser` | 178,824,999 | 0 | 2025-05-26 |
| `minimist` | 140,693,703 | 0 | 2023-02-09 ⚠ |
| `escalade` | 136,594,460 | 0 | 2024-08-29 ⚠ |
| `y18n` | 126,130,642 | 0 | 2021-04-07 ⚠ |
| `get-caller-file` | 124,482,261 | 0 | 2019-03-09 ⚠ |
| `require-directory` | 112,750,740 | 0 | 2015-05-28 ⚠ |
| `arg` | 71,166,796 | 0 | 2022-06-05 ⚠ |
| `cac` | 43,976,442 | 0 | 2026-02-27 |
| `meow` | 36,681,347 | 0 | 2026-02-20 |
| `citty` | 27,532,776 | 0 | 2026-04-01 |
| `sade` | 6,644,936 | 1 | 2022-01-06 ⚠ |

## `roundel` — the colour layer

*Output stack.* Replaces **9 packages**, **2.32 B/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `ansi-styles` | 470,928,193 | 0 | 2026-07-26 |
| `supports-color` | 441,630,802 | 0 | 2026-07-26 |
| `chalk` | 439,795,694 | 0 | 2026-07-26 |
| `color-name` | 306,572,930 | 0 | 2026-07-22 |
| `color-convert` | 299,591,116 | 1 | 2025-11-14 |
| `picocolors` | 202,478,980 | 0 | 2024-10-16 |
| `kleur` | 70,902,431 | 0 | 2022-06-26 ⚠ |
| `colorette` | 52,887,824 | 0 | 2023-04-16 ⚠ |
| `yoctocolors` | 34,546,493 | 0 | 2026-07-26 |

## `flagstaff` — the render layer

*Output stack.* Replaces **9 packages**, **360 M/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `ansi-escapes` | 113,552,898 | 1 | 2026-02-04 |
| `ora` | 79,774,725 | 8 | 2026-06-22 |
| `cli-spinners` | 40,290,543 | 0 | 2026-01-13 |
| `listr2` | 29,142,654 | 3 | 2026-09-02 |
| `cli-boxes` | 28,961,038 | 0 | 2024-08-04 ⚠ |
| `cli-table3` | 23,275,682 | 1 | 2024-05-12 ⚠ |
| `log-update` | 22,103,662 | 6 | 2026-04-05 |
| `boxen` | 20,238,669 | 8 | 2024-08-05 ⚠ |
| `nanospinner` | 2,730,002 | 1 | 2024-12-09 |

## `caique` — the prompt layer

*Output stack.* Replaces **4 packages**, **138 M/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `prompts` | 53,898,410 | 2 | 2021-10-07 ⚠ |
| `inquirer` | 32,860,350 | 6 | 2026-09-07 |
| `enquirer` | 31,002,435 | 2 | 2023-07-28 ⚠ |
| `@clack/prompts` | 20,354,562 | 4 | 2026-09-07 |

## `linegauge` — the text layer

*Foundation.* Replaces **12 packages**, **2.16 B/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `strip-ansi` | 464,474,013 | 1 | 2026-02-26 |
| `string-width` | 349,993,800 | 2 | 2026-07-08 |
| `ansi-regex` | 345,318,565 | 0 | 2026-08-12 |
| `wrap-ansi` | 311,488,741 | 2 | 2026-08-17 |
| `emoji-regex` | 295,676,115 | 0 | 2025-10-13 |
| `slice-ansi` | 101,819,425 | 2 | 2026-04-04 |
| `get-east-asian-width` | 69,349,620 | 0 | 2026-05-08 |
| `eastasianwidth` | 62,425,148 | 0 | 2024-04-21 ⚠ |
| `string-length` | 46,580,842 | 0 | 2026-01-21 |
| `wcwidth` | 43,940,400 | 1 | 2016-05-30 ⚠ |
| `cli-truncate` | 36,031,248 | 2 | 2026-07-09 |
| `widest-line` | 34,366,674 | 1 | 2026-01-24 |

## `seniority` — the config layer

*Foundation.* Replaces **16 packages**, **1.81 B/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `locate-path` | 217,647,852 | 1 | 2025-09-15 |
| `p-locate` | 216,902,418 | 1 | 2026-02-03 |
| `resolve-from` | 214,222,391 | 0 | 2019-04-15 ⚠ |
| `path-exists` | 204,060,099 | 0 | 2021-08-12 ⚠ |
| `find-up` | 169,773,283 | 2 | 2025-09-16 |
| `dotenv` | 158,377,172 | 0 | 2026-04-12 |
| `import-fresh` | 132,810,299 | 0 | 2026-02-25 |
| `parse-json` | 121,741,497 | 3 | 2025-04-09 |
| `cosmiconfig` | 115,311,385 | 2 | 2026-08-30 |
| `env-paths` | 77,610,480 | 1 | 2026-01-24 |
| `lilconfig` | 70,985,369 | 0 | 2024-12-03 |
| `dotenv-expand` | 36,722,404 | 0 | 2026-07-29 |
| `rc` | 30,266,851 | 4 | 2018-05-26 ⚠ |
| `c12` | 21,850,194 | 6 | 2026-09-03 |
| `configstore` | 12,735,772 | 5 | 2026-01-24 |
| `conf` | 12,092,716 | 9 | 2026-02-04 |

## `bellpull` — the process layer

*Foundation.* Replaces **15 packages**, **2.29 B/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `which` | 290,160,551 | 1 | 2026-05-08 |
| `path-key` | 244,859,615 | 0 | 2021-04-09 ⚠ |
| `isexe` | 243,688,104 | 0 | 2026-02-09 |
| `cross-spawn` | 212,217,694 | 3 | 2024-11-18 |
| `shebang-regex` | 200,206,356 | 0 | 2021-08-13 ⚠ |
| `get-stream` | 182,928,810 | 2 | 2024-03-16 ⚠ |
| `execa` | 150,608,357 | 12 | 2026-07-31 |
| `is-stream` | 142,346,236 | 0 | 2024-02-19 ⚠ |
| `shebang-command` | 121,157,902 | 1 | 2019-09-06 ⚠ |
| `tinyexec` | 119,489,974 | 0 | 2026-09-03 |
| `strip-final-newline` | 114,325,480 | 0 | 2023-12-13 ⚠ |
| `npm-run-path` | 104,046,769 | 2 | 2024-08-26 ⚠ |
| `merge-stream` | 85,835,659 | 0 | 2019-05-23 ⚠ |
| `human-signals` | 75,184,156 | 0 | 2025-03-29 |
| `nano-spawn` | 3,950,037 | 0 | 2026-04-01 |

## `closeout` — the lifecycle layer

*Foundation.* Replaces **6 packages**, **685 M/wk** combined.

| Incumbent | Weekly | Deps | Last publish |
| :-- | --: | --: | :-- |
| `signal-exit` | 198,913,643 | 0 | 2023-07-29 ⚠ |
| `onetime` | 162,339,186 | 1 | 2026-02-02 |
| `cli-cursor` | 107,593,401 | 1 | 2024-07-26 ⚠ |
| `restore-cursor` | 107,525,369 | 2 | 2024-07-26 ⚠ |
| `mimic-fn` | 99,739,275 | 0 | 2023-11-05 ⚠ |
| `exit-hook` | 8,757,946 | 0 | 2026-02-04 |

⚠ marks an incumbent not published in the twelve months to 2026-09-09.

## Reproducing

```sh
curl -s "https://api.npmjs.org/downloads/point/last-week/<comma-separated>"
curl -s "https://registry.npmjs.org/<pkg>/latest"   # dependencies, time, engines
```
