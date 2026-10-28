---
id: A-20261028-yargs-locale-read-at-runtime
section: A
status: open
source: first-adopter second-target proof on emmercm/igir (`.sdlc/research/adoption/igir.md`), answering igir#2249
done_when: 'A `burgee/yargs` program compiled into one file by `bun build --compile` runs `--help` and prints its English errors from an empty directory, and the same program under Node prints them when a `locales/*.json` read fails with an error other than ENOENT; each case proven red on `burgee@1.9.2` first; English needs no file on disk, and `locales-lock.test.ts` still reads `de` back; then the igir proof is re-run on the published fix, including `bun scripts/compile.ts`'
---

`burgee/yargs` finds and reads its English strings on disk at run time, as yargs does. That is
the defect igir#2249 was opened over, and in a single-file build burgee fails earlier than yargs
did.

**Where.** `packages/burgee/src/yargs/shim.ts` computes `locales` at module load:
`findUp(here, …package.json…)` from its own file, then hands the directory to y18n. The first
message y18n renders calls `readLocaleFile()`, which reads `<locales>/en.json` with
`readFileSync` and rethrows every error but `ENOENT`.

**What igir needs.** igir ships a Bun-compiled single binary. Its maintainer's rule, in
`src/polyfill/yargsShim.ts`, is that nothing in the app may rely on files on disk next to the
executable. yargs' own read crashed every igir command on a Windows machine with a real `B:`
drive (`EUNKNOWN` instead of `ENOENT`, [igir#2244](https://github.com/emmercm/igir/issues/2244)).
igir fixed it with a shim that seeds y18n from a static import of yargs' `en.json`
(#2247, then #2283 so Bun embeds it), and opened #2249 the same day to replace yargs.

**What the proof found on `burgee@1.9.2`**, with the shim deleted and the import swapped:

- `bun scripts/compile.ts`, igir's own compile step, builds the binary and then fails its own
  smoke test. The binary throws at module load on every invocation, `--help` included, on
  macOS: `ENOENT: no such file or directory, scandir '/$bunfs'`, from `findUp` at
  `readdirSync(dir)` while it walks up from the binary's virtual path. `findUp` has no guard
  around `readdirSync`. The base tree's binary runs `--help` from an empty directory.
- Under Node, a preload that makes any `locales/*.json` read fail with `EUNKNOWN`, as #2244's
  did, makes every igir invocation fail with that error, a valid `copy` included.

**The fix belongs in burgee, for everyone, not in igir** (constraint 3): English, the default,
comes from the module graph (a static JSON import or an inlined table), the locale directory is
resolved lazily and only for a non-English locale, and a failed walk-up is not fatal. Then a
single-file build of any `burgee/yargs` program needs no file beside it for its default strings.
