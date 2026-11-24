---
"truepass": patch
---

`no-fixed-sleep` no longer reports a zero or omitted delay (`setTimeout(r, 0)`, `setTimeout(r)`, `sleep(0)`, `waitForTimeout(0)`): it is a tick flush, as inside React's `act()`, not a fixed sleep. `truepass diff` runs its three git calls one after another, so a bad `--base` always quotes the first git command that failed, and `--help` names the default base once.
