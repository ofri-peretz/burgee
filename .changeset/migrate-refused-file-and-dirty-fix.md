---
"burgee": patch
---

`burgee migrate` no longer calls an incumbent removable, or suggests `npm uninstall` for it, when the only file that imports it was refused and left as it was. The dirty-tree refusal now prints its fix (`commit or stash your changes, or pass --force`) on stderr and in the `--json` envelope.
