---
"burgee": patch
---

`burgee/yargs` no longer reads a file to speak English. In 1.9.2 it walked up from its own file to
`package.json` as it loaded, to find `locales/`, so a `bun build --compile` binary of a
`burgee/yargs` program threw `ENOENT … scandir '/$bunfs'` on every run, `--help` included. Under
Node, a locale read that failed with anything but `ENOENT`, such as `EUNKNOWN` from a Windows
drive, failed every run. English is now built into the module, so a program bundled into one file
prints its help and errors with nothing beside it. Another locale is still read from `locales/`
the first time it is used, and if that read fails for any reason the program speaks English
instead of failing. `.locale()` and `.updateStrings()` work as before. `burgee/yargs` grows by
821 B bundled, and is still lighter than yargs (0.985×).
