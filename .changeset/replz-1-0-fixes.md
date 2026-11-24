---
"replz": patch
---

Fixes from the first runs of 1.0:

- `replz run` sets `REPLZ_REPO`, the absolute path of the repository it started in, for the setup, the reviewer and every check, so a reviewer script kept in the repository is named `bash "$REPLZ_REPO/review.sh"`: a relative path was read in the case's worktree, at a head that may predate the script.
- `--max-findings` grades the last stage's findings first, then each earlier stage's, so a low cap no longer spends its grader calls on raw findings before any final one.
- `replz check` refuses a case file not named `<id>.yaml`, an answer still the draft's `TODO`, and a set without a bug or a control, which only this repository's own lock test caught before. `run` refuses the first two as well.
- A runtime failure (exit 1) prints its `fix:` on its own line, and in `--json` as `error.fix`, without the command's usage block, which is now printed for a usage error (exit 2) only. A missing config or case folder names `--repo`.
- `--repo`'s help names its default once.
- The README says what the code does: `run` checks each case out at its head, and `propose` prints its drafts and writes no file.
