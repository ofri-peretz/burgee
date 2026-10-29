---
id: A-20261028-yargs-locale-read-at-runtime
section: A
status: closed
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

**Closed 2026-10-29** by `fix/yargs-locales-embedded`, which publishes with burgee's next release
(`yargs-compat` X9). English is in the module graph: `packages/burgee/scripts/generate-yargs-locales.mjs`
renders `src/yargs/y18n-locales.ts` from `locales/`, the seven `en.json` entries that are not
their own key and the names of the 29 shipped locales. `--check` runs in the build and the tests
compare the values, so `locales/` stays the one source. The walk up to `package.json` runs on the first
non-English read, not at load. y18n picks a file from the shipped list, never by `statSync`, and
any failure on the way (no `locales/` found, `ENOENT`, `EUNKNOWN`, `EACCES`, a file that is not
JSON) serves English. A locale burgee does not ship stays its keys, as on y18n.

`packages/burgee/src/yargs/locales-embedded.test.ts` holds it. Each case was red on `f801cf48e7`,
whose y18n and shim are `burgee@1.9.2`'s: a program run with every `readdirSync` and every
`locales/*.json` read failing (`EUNKNOWN`, then `ENOENT`) prints help, runs `copy`, prints
`Missing dependent arguments:` and reads no locale file (it crashed at load); the program bundled
by esbuild into a directory of its own prints that English (it printed the key,
`Implications failed:`), and still prints help when that directory cannot be listed, the
`/$bunfs` shape (it threw `EACCES … scandir` at load). `locales-lock.test.ts` still reads `de` back,
and `de_DE` from the installed package prints `Kommandos:`.

`bun build --compile` (Bun 1.4.4) of the same program: on `f801cf48e7` the binary exits 1 from an
empty directory with `ENOENT: no such file or directory, scandir '/$bunfs'` at `findUp`, as on
igir; on this change it prints help, runs `copy`, prints the English error, and under
`LC_ALL=de_DE` prints English help, exit 0. `runtime-smoke.yml`'s bun job, informational like the rest of it, now compiles and runs it
on every pull request. The compat oracle grades `burgee/yargs` 816 / 816 and `yargs-17`
793 / 794, both unchanged. The cost is +821 B bundled
([D-20261029-yargs-english-embedded-bytes](../decisions/D-20261029-yargs-english-embedded-bytes.md)).
Re-running the igir proof on the published fix, `bun scripts/compile.ts` included, belongs to the
first-adopter intent, which holds the comment until it is done.
