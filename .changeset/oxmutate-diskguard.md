---
"oxmutate": minor
---

A mutant that writes into the project is caught after its unit, its write is put back, and the verdicts that could have run on the changed project run again.

oxmutate snapshots the project's tracked files and the directories that hold them before the run. After each unit:

- a changed or deleted tracked file is written back from the snapshot;
- a new entry git does not ignore is removed;
- the unit's verdicts, and those of the units running beside it, are dropped and re-run in halves, until the mutant that writes is alone in its unit.

That mutant carries `wrote`, and `stats.diskWrites` counts the units. Scratch a suite keeps where git ignores it is left alone. Set `OXMUTATE_NO_DISKGUARD=1` to turn the guard off.

The case this guards against is [#1453](https://github.com/ofri-peretz/burgee/pull/1453): a compat-oracle mutant overwrote its package's `package.json`, and every later mutant ran against a broken package for four hours.
