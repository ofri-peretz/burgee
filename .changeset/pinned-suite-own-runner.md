---
'compat-oracle': patch
---

A host that pins its suite dependencies gets its runner from that tree, not from the
workspace.

`suiteDeps` exists so a suite runs against the versions it was written for, and
`writeInternalShims` already resolved the incumbent that way; `command()` did not. This repo
hoists **ava 8.0.1** and meow's suite is written for the **6.4.1** its `suiteDeps` installs,
under which ava 8 prints `1..0 / # tests 0 / # fail 32` — a suite of zero reported as
thirty-two failures. ava's CLI entry is also not one filename across its majors: 8 ships
`entrypoints/cli.js`, 6 ships `entrypoints/cli.mjs`, and its exports map admits neither by
name, so hardcoding the first killed a 6.x host before a test ran.

With both fixed, meow's 36 files grade 148 cases at 144 passing against real meow.
