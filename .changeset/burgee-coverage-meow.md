---
"burgee": patch
---

Three code paths no input could reach are removed from `burgee/meow` and `burgee migrate`; behaviour is unchanged. `burgee/meow` no longer reads a deprecated `alias` as a spelling of its flag, because meow refuses a flag that declares one before anything is parsed. `burgee migrate` no longer falls back to an empty table for a drop-in with no export list or no supported majors, because two locks hold a table for every one.
