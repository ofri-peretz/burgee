---
id: D-20261009-json-asked-is-json
subject: 'Should a request for JSON in another CLI''s spelling or position (`--format json`, `--json` before the command) run the command, or be refused with a fix'
taken: Taken
date: '2026-10-09'
superseded_by: —
---

**It runs the command with `--json`.** `--format json`, `--format=json`, `--output json` and
`--output=json` are read as `--json`, after the command or before it, and so is `--json` typed
ahead of the command. Three cases stay refusals with a `fix`:

- the command declares an option of that name, so the word is the program's;
- it declares one near it (`--formats`), so reading the word as `--json` is a guess;
- any word other than the request is wrong, such as `get user.name --format json` or
  `config user.name --json`.

Nothing after `--` is read (G5). This is native burgee only: the façades never reach
`surfaces.js` or `failure.js`, and commander 1360/1360 and yargs 816/816 hold.

**Why this is not "a fix that runs itself".** E3 and D-20260930-failures-teach-recovery rule 2
say a `fix` is printed and never executed: an executed guess burns the turn the field exists to
save. That still holds for every guess. Here nothing about *what* runs is guessed. The command,
its arguments and its options are the caller's words, in the caller's order. The only thing
read is how the caller asked for JSON, which burgee already owns on every command (`--json`,
O1). D-146 set the rule for `--format=agent`: the flag is burgee's only on a command that
declares no `format` of its own. This applies the same rule to `--format json`. The refusal
these lines got before was a usage error (exit 2) whose fix was the same command with the same
words. A caller paid a turn to be told what it had already asked for.

**Evidence.** B1's `b1-transcripts` from the seven bench runs on main at ba8a89c, 98c355c,
6b8e3d9, e641aa3, 367cefb, f29f159 and 689c403 contain 70 structured-output runs, both builds.
Their first commands:

| first command | runs |
| :-- | --: |
| `demo config get user.name --format json` | 15 |
| `demo config get user.name --json` | 11 |
| `demo config user.name --format json` / `--json` | 10 |
| `demo user.name --json` / `--format json` | 7 |
| `demo --format json config get user.name` | 6 |
| `demo --get user.name --format json` | 5 |
| `demo get user.name …` / `--format json get user.name` | 6 |
| `demo --format json config user.name` | 4 |
| other (`--format json --key`, `--format json user.name`, `get-config`) | 6 |

21 of the 70 (30%) named the right command and asked for JSON another way. On burgee each took
3 turns or more, against 2 for the 11 that typed `--json`. Now they take 2.

**Two fixes that did not run, fixed here.**

- `demo --get user.name --format json` answered `did you mean --eet?` with
  `fix: demo --eet user.name --json`. `suggestSimilar` strips `--` from the typed word and from
  every candidate, and command names have no dashes, so `greet` came out as `eet`. Three runs
  followed it into a second refusal and spent 5 turns. A dashed word where a command goes is now
  matched by its name: `--get` is `config get`. `suggestSimilar` is unchanged, because
  `burgee/commander` uses it the way commander does.
- `demo --format json config user.name` answered `fix: demo config user.name --json`, which is
  refused in turn, so 4 turns. The analysis now starts where the request for JSON left off, at
  `config`: `fix: demo config get user.name --json`.

`failure-teaches.test.ts` runs every command the agents opened these two tasks with and asserts
that each one either answers, or prints a fix that answers, or lists `config get <key>`. Six of
its cases fail on the unfixed engine.

**Cost.** The core entry is 24,163 → 24,221 bundled (ceiling 24,282). In the core, `execute`
loops while `report` hands back a line. Everything else is in the lazy failure path:
`unknown-option.js` reads the request and defines `Again`, `surfaces.js` throws it, and
`failure.js` turns it into the line. A run that succeeds first time pays for the loop and
nothing else.

**What it does to B1.** I replayed every burgee command in the 175 burgee task-runs of those
seven runs against this build. An agent was taken to stop at its first answer, and to run a
printed fix that answers. On that replay, structured-output's 2-turn runs go from 5 of 35 to 14
of 35, and its turns from 115 to 91. **The pooled median stays at 3.**
[D-20261009-b1-two-turns](./D-20261009-b1-two-turns.md) explains why no change to burgee's
output can make it 2 on this task set.
