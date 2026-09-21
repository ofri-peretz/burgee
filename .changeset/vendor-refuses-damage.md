---
"compat-oracle": patch
---

A vendor run that cannot finish no longer damages what is already there.

It built in place, deleting the host directory first, so a run that produced nothing left the
host with no suite, no `.source.json` and no `package.json` — which is how `dotenv` lost 141
graded cases in one run. It now builds into a staging directory and swaps, and refuses
outright when a run yields no graded file.

`pinnedVersion` makes a pin readable. `slice-ansi`'s lived only in prose — "vendored at
7.1.2, not at the 9.0.0 on npm, and that is a deliberate pin" — and a re-vendor moved it to
9.0.1 anyway, because nothing in the code could read a paragraph.
