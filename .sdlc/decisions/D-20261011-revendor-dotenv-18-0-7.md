---
id: D-20261011-revendor-dotenv-18-0-7
subject: 'dotenv 18.0.7 was released (#946): what did `seniority/dotenv` need to stay level with it?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**dotenv: re-vendored at 18.0.7 (`v18.0.7` -> commit 29532075), control 191 / 191, `seniority` 191 / 191, level.** Measured on darwin arm64, Node 24.13.0. Before the port the same run read `seniority` **188 / 191** against the same control.

**18.0.7 changed two things, and the three new cases grade both.** The count moved 181 -> 191 because one of the three titles is a loop of eight spawned runs.

- **`config()` reads an option given as `undefined` as not given (motdotla/dotenv#1070).** `_configOptions` now deletes undefined keys before laying the caller's options over `optionsFromEnv()`, so `config({ path: undefined, quiet: undefined })` keeps `DOTENV_CONFIG_PATH` and `DOTENV_CONFIG_QUIET` instead of falling back to `./.env` and printing the line. `seniority/dotenv`'s `configDotenv` spread `given` over the defaults whole, and failed `undefined options do not override DOTENV_CONFIG_* defaults`. It now filters undefined keys the same way. `null options use environment defaults` already passed: spreading `null` is spreading nothing, in both.
- **`dotenv run` honours a `DOTENV_QUIET` the loaded `.env` itself sets (motdotla/dotenv#1071).** `resolveRunOptions` keeps the environment's `quiet` as given (possibly absent) rather than `=== true`, and after the files load, an absent `quiet` is read again from the environment as it now stands. A shell `false`, legacy name included, still outranks the file's `true`, `--override` or not; `--quiet` outranks both. `seniority/dotenv/cli` coerced to `=== true` up front and failed `CLI startup logging respects quiet from .env` and `... legacy quiet from .env`. It now keeps `undefined` and re-reads after loading.

Both fixes have a unit case in `packages/seniority` that failed on the unfixed source first (`dotenv.test.ts`, `dotenv-cli.test.ts`); coverage stays 100%.

**For the owner.** `seniority`'s changeset is a `patch`: a caller passing `{ path: undefined }` with `DOTENV_PATH` set used to read `./.env` and now reads `DOTENV_PATH`, and a `dotenv run` whose `.env` says `DOTENV_QUIET=true` is now quiet. Both are dotenv's own behaviour at 18.0.7, released by dotenv as a patch, and the drop-in follows its incumbent's current release (D-170).
