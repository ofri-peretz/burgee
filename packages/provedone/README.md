# provedone

Every change says how it was verified, and a gate reads it. Codename; private until the success
criteria of [its intent](../../.sdlc/intents/provedone/intent.md) are read.

```sh
provedone stamp --run "npm test" --not-checked "the docs site"   # trailers for the commit
provedone stamp --run "npm test" --not-checked nothing --pr      # the PR's "How this was checked" block
provedone stamp --none "comment-only change"                     # Verified-by: none, with its reason
provedone gate .git/COMMIT_EDITMSG                               # observe: passes, logs what enforce would block
provedone gate pr-body.md --mode enforce                         # blocks a body with no receipt
provedone done faster-help                                       # every success criterion has a passing stamp?
provedone intent new faster-help                                 # intent.md and spec.md from _template/
provedone intent check --evidence                                # the intent rules, and the shipped evidence re-run
```

| Command | Exit 1 when |
| :-- | :-- |
| `stamp` | a `--run` command failed (it is still recorded) |
| `gate` | `enforce`, no `Verified-by:` line or a `none` with no reason, and fewer than two blocks this session |
| `done` | a success criterion has no passing stamp on this branch; each gets a `fix:` naming the stamp to run |
| `intent check` | an intent breaks a rule, the index disagrees, or a re-run evidence command no longer matches |

Exit 2 is a usage refusal with a `fix:`. Every command takes `--json`, `--schema` and `--mcp`,
because it is a burgee program.

## The receipt

```text
Verified-by: npm test -> exit 0 (sha256:85f7e552faae)
Captured: shots/home.png
Not-checked: the docs site
```

One `Verified-by:` per command, with its exit code and the first 12 hex of the output's sha256;
`Verified-by: none (<reason>)` for a change that needs no check. They are git trailers, so
`git log --format='%(trailers:key=Verified-by)'` answers which commits were never verified. Git reads trailers from
the message's last paragraph only, so paste them beside `Co-Authored-By:`, with no blank line
between.

Stamps and the gate log are JSON lines under `.git/provedone/`, never in the tree. `done` reads
the stamps of the current branch. The gate's session is `PROVEDONE_SESSION`, else the agent's
session id (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`), else the branch.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.
