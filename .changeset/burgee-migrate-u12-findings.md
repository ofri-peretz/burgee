---
"burgee": minor
---

`burgee migrate` fixes five findings from a trial on two real CLIs (D-20261008-migrate-u12-findings):

- **Mocks move with the imports they mock.** The first argument of `vi.mock`, `vi.doMock`, `vi.unmock`, `vi.doUnmock`, `vi.importActual`, `vi.importMock`, `jest.mock`, `jest.doMock`, `jest.unmock`, `jest.requireActual`, `jest.requireMock`, `jest.unstable_mockModule` and `require.resolve` is now rewritten like an import, type arguments included. A `vi.mock('chalk')` left behind mocked a module nothing loaded any more.
- **The install command is pinned.** `next` prints each family package at a caret range of the version that carries the graded drop-in, `roundel@^1.0.0` rather than `roundel`, read from the packages' manifests at build time. A project that sets `minimumReleaseAge` (`pnpm-workspace.yaml`) or `minimum-release-age` (`.npmrc`) is told so under `releaseAge`.
- **You choose what moves.** New `--only <lib,…>` and `--skip <lib,…>` flags take incumbent package names. By default only the incumbents `package.json` declares (in any of its four dependency fields) are rewritten; one imported without being declared is listed under `undeclared` and left alone. An unknown name is a usage error, exit 2.
- **An incumbent moves in every file or in none.** When one of its imports is refused or kept, it is listed under `held` and rewritten nowhere, so a program never runs on two copies of it. An incumbent another declared dependency still depends on is listed under `transitive`, and imports of the error classes that dependency still throws stay on the incumbent.
- **The report reads as text.** The human report is sentences and aligned lines instead of one-line JSON, and its first line, also `summary` in `--json`, says `complete: …`, `partial: N files rewritten, M refused` or `nothing to rewrite`. The exit codes are unchanged.

The engine's text surface for a result that is not a string moved to its own lazily loaded chunk, which also prints a result's own text when it carries one under `Symbol.for('burgee.text')`; `--json` is unchanged.
