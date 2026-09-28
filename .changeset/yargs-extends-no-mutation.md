---
"burgee": patch
---

`burgee/yargs`: resolving a config's `extends` no longer deletes `extends` from the object you passed in. It reads a copy instead, so a config object is never written to while it is being resolved (CodeQL #27). The resolved result is unchanged, and yargs' own suite still passes 804 of 804.
