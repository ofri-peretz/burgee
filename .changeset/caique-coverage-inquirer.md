---
"caique": patch
---

Four checks that could never change a result are removed from `caique/inquirer`; behaviour is unchanged. The screen's last line no longer falls back to an empty string (splitting a string always yields one), the loader no longer defaults a tick that `useState(0)` always sets, `INQUIRER_KEYBINDINGS=''` no longer has its own early return (it already parses to no bindings), and `useMemo` no longer asks whether a slot that holds a value was initialised.
