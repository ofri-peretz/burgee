---
"burgee": minor
---

`burgee check` runs every installed layer's own `check`. A plugin is one object for the whole
family, and a key another layer hosts, such as `tokens` (roundel) or `spinners` (flagstaff), is
now handed to that layer's `check` and reported under `layers`: `{ host, keys, run, exitCode,
output }`. Each layer is found where Node would resolve it from the plugin's directory and run as
a command, never imported, so burgee still depends on no layer. A layer that is not installed is
named with the `npx` command to run. A layer that refuses makes the check refuse, with that
layer's own code and fix. An object that carries only other layers' keys is no longer refused as
`E_NO_CONTRIBUTION`. That code now means no layer of the family reads anything in it.
