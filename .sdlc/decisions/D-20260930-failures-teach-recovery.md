---
id: D-20260930-failures-teach-recovery
subject: What a failure, an unknown command and the root help say, so an agent recovers from the refusal instead of from a --help walk
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**A failure with nothing to run next now says what the command takes. An unknown command
names the commands that exist and corrects a near miss. The root help has one line for agents
naming `--schema`, `--json` and `--explain`. This is framework behaviour: every native burgee
program gets it, and the tasks and the demo are unchanged.** The façades are also untouched.
`burgee/commander`, `burgee/yargs` and `burgee/meow` never reach `failure.js`, `surfaces.js`
or `help.js`, so their output stays byte for byte the incumbent's.

B1's transcripts (#775, `b1-transcripts`, run 36748092295) showed where burgee lost:

- recover-failure: 0 passes in 12 runs (7 local in #775, 5 in its CI run). `fail` printed `error: boom` and nothing else, so the
  agent settled for `mytool fail || true` in 3 turns every time. It never learned that `--code`
  exists.
- The unknown-command error said "run --help to see the available commands". Agents that
  guessed `mytool user.name` or `mytool grace` first paid a turn for `--help`.
- `--explain` exists on every runnable command, and no help listed it. diagnose-provenance
  took 9 to 16 turns, most of them spent reading `DEMO_GREETING` through refused shell calls.
- `--schema` was read once in 19 runs, as the last step.

## The rules

1. **A failure teaches.** When the code is `USAGE` or `RUNTIME`, the error carries no `fix`,
   and the command that failed runs, `describeFailure` attaches `usage`. That is the usage line
   from the program name (`demo fail [options]`) and the visible options, each with the notes
   help prints: required, default, choices, requires or conflicts with, and env. Prose appends
   `usage:` and `options:` after `hint:`/`fix:`. The `--json` envelope carries the same thing as
   `error.usage: { command, options?, commands?, more? }`. The exit code does not change.
   - Only `USAGE` and `RUNTIME`, because those are the two codes that mean *the command*. `AUTH`
     means get a credential, `CONFIG` means fix the environment, and an author's own
     `defineError` code means what its author said. Listing options under any of those points
     the reader at the wrong remedy.
   - **Not when there is a `fix`.** A fix is one line to run, and a list beside it invites
     reading instead of running.
   - **Bounded: 8 rows.** Beyond that, `more` names `<cli> <command> --help`. This is how E2
     ("a runtime failure never prints help") still holds. E2 exists because yargs printed the
     whole help screen on a runtime error, and the reader took a runtime failure for a usage
     error. What prints now is one usage line and at most 8 rows. It has no description, no
     examples, no global options and no epilogue, and the exit code still says `RUNTIME`.
2. **An unknown command names what exists.** Candidates are the visible commands one level
   below the node the argv reached, matched by the same edit distance `unknownOption` uses
   (`suggest.ts`).
   - One nearest: `hint: did you mean greet?`, and `fix` is the caller's own line with that
     word corrected. It is quoted where a shell needs it, and the caller's `--json` is kept, so
     the fix runs as it stands.
   - None, or a tie: no fix, because an executed guess burns the turn `fix` exists to save
     (E3). The error carries `usage.commands` instead, and the hint names `--schema` as the one
     call that returns every command and option.
3. **Help advertises the agent surfaces.** Every runnable command lists
   `--explain <option>  where an option's value came from` among its global options, because
   every runnable command parses it (`toParseConfig`), with or without config discovery. The
   root help ends with one paragraph: *For agents: --schema prints every command, option,
   default and env var as JSON, in one call. --json prints one envelope on stdout, and
   --explain <option> says where a value came from.*
4. **Hints name flags, not `<program> --schema`.** A program is often run under a name other
   than the one it declares: `node cli.mjs`, an alias, a wrapper, or B1's `mytool` shim over a
   program named `demo`. The first local run of this change printed ``run `demo --schema` ``.
   An agent ran `demo --schema` exactly as written, the allowlist refused it, and the run
   failed. `fix` keeps the declared name, the way N11's `next[]` does, because a fix is the
   whole line. A hint is prose, and prose that looks like a command gets run as one.
5. **The core does not move.** The new text lives in `usage.js`, which only `failure.js` and
   `surfaces.js` reach, plus the rows in `help.js`. All three are lazy chunks.

## Bytes (`dist/`, the weight lock's walk)

| entry / file | before | after | Δ |
| :-- | --: | --: | --: |
| `.` (core) | 35,577 | 35,577 | **0** |
| `./help` | 8,494 | 8,953 | +459 (budget 9,130) |
| `./commander`, `./yargs`, `./meow`, `./testing`, `./mcp`, `./schema`, `./cli` | — | — | 0 |
| `failure.js` (lazy) | 4,132 | 4,792 | +660 |
| `surfaces.js` (lazy) | 5,880 | 6,788 | +908 |
| `usage.js` (lazy, new) | — | 2,866 | +2,866 |

## What `--schema` says about it

Nothing new, on purpose. `--schema` describes the program: its commands, options and exit
codes. The envelope is a property of the framework, not of any one program, and it is
documented on the Exit codes and errors and Agent surfaces pages. Adding it to `schema.js`
would charge `./yargs` for a document that never mentions yargs, and that entry has 48 bytes
of headroom.

## Measured: B1's burgee variant, `claude` 2.1.283 (pinned), sonnet-4-5, local

"Before" is #775's CI `b1-transcripts` (run 36748092295, 5 runs a task). "After" is this
branch, 2 runs a task, with the tool's environment scrubbed of `CLAUDECODE`. Twelve task-runs in
all: 6 on the first draft, 6 on the final one.

| task | before: passed · turns · median tokens | after: passed · turns · median tokens |
| :-- | :-- | :-- |
| recover-failure | 0/5 · 3,3,3,3,3 · 63,271 | **2/2** · 3,3 · 65,215 |
| diagnose-provenance | 4/5 · 13,12,9,11,16 · 264,651 | **2/2** · 7,7 · 154,749 |
| discover-subcommand | 5/5 · 5,5,5,6,5 · 106,450 | 2/2 · 5,5 · 111,102 |

- **recover-failure:** `mytool fail`, then `mytool fail --code 0`, read off the new `options:`
  row, in both runs.
- **diagnose-provenance:** `--help`, `greet --help`, then `greet grace --explain greeting` in
  both runs. The refused `echo $DEMO_GREETING` / `printenv` / `env | grep` spiral is gone.
- **discover-subcommand:** unchanged, because the agent opens with `--help` and walks it. The
  draft's two runs went `mytool user.name` → `--schema` → answer in 4 turns, and one of them
  failed. That was the draft hint's ``run `demo --schema` `` being run as written, which is
  rule 4.
