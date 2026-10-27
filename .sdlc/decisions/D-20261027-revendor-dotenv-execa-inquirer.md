---
id: D-20261027-revendor-dotenv-execa-inquirer
subject: 'The scheduled re-vendor (#1285) copied dotenv 18.0.9 (#1228), execa 10.2.1 (#1227), @inquirer/core 12.0.5 (#1194) and @inquirer/prompts 8.7.4 (#1193, #1224). What did the oracle and the drop-ins need to follow them?'
taken: Taken
date: '2026-10-27'
superseded_by: —
---

**All four re-graded at the release tag, every control level with its reference, and every drop-in level with its control again. Three drop-ins had fallen behind on the new cases, and each fell for a real behaviour of the new release, not for the harness. All three were ported, red first.** Measured on darwin arm64, Node 24.12.0: `npm run compat -- --vendor --control <hosts>`, then the target.

| Host | Release | Commit | Control | Target before the port | Target now | Before |
| :-- | :-- | :-- | --: | --: | --: | --: |
| dotenv | 18.0.8 -> 18.0.9 | `8d1ab850` | 197 / 197 | `seniority/dotenv` 196 / 197 | 197 / 197 | 193 / 193 |
| execa | 10.2.0 -> 10.2.1 | `247faa0f` | 1360 / 1360 | `bellpull` 0 / 1360 (ceiling) | 0 / 1360 (ceiling) | 0 / 1360 |
| inquirer-core | 12.0.4 -> 12.0.5 | `ea3130eb` | 45 / 45 | `caique/inquirer` 42 / 45 | 45 / 45 | 41 / 41 |
| inquirer-prompts | 8.7.3 -> 8.7.4 | `ea3130eb` | 221 / 221 | `caique/inquirer/prompts` 216 / 221 | 221 / 221 | 213 / 213 |

**Why the PR was red.** The scheduled re-vendor copies the suites, and it does not move what grades them. `hosts.ts` still pinned the old incumbents in `suiteDeps`, so each control ran the new cases against the old package and failed them: dotenv 1, inquirer-core 3, inquirer-prompts 5. `GRADED_VERSIONS` and the baselines still named the old releases (`migrate-drop-ins-lock`, the B2/B3/B4 floor). The root `execa` devDependency was still 10.2.0, which `bellpull/capabilities.json` cites by installed path, so `capabilities-lock` failed all 13 bellpull cells on one cause: `node_modules/execa is 10.2.0, but compat-oracle grades execa 10.2.1`. The cells were never wrong. The install was. `suiteDeps` now pins the new releases, and the re-vendor rewrote each `package.json` and `depsBefore` from them. The root devDependencies follow: `execa` `^10.2.1`, and `@inquirer/prompts` 8.7.4 for the type-surface and require-shape locks. `benchmarks/package.json` pins dotenv 18.0.9, because `pinned-incumbent-lock` holds B4's pin to a release the oracle grades.

**dotenv 18.0.9.** It adds four test titles that count four assertions. Three pin the `{ fast: true }` scanner to the regex parser: around the 4,096-character comment-search threshold, `export` with no whitespace after it, and a key whose whitespace runs to the end of the input. `seniority` already passed all three. The fourth runs `dotenv run` with `DOTENV_PATH` or `DOTENV_CONFIG_PATH` set to the empty string. dotenv tests the path's truthiness, so an empty one means the default `.env`. `seniority/dotenv/cli` tested `!== undefined`, resolved `''` to the working directory, and stopped with `EISDIR`. It now tests truthiness. `config()` already did, and its comment says so.

**@inquirer/core 12.0.5.** Its four `settlement:` cases settle a prompt before its deferred first render. That render waits one `setImmediate` for a modern input. Upstream now clears that immediate as one of the prompt's cleanups. `caique/inquirer` still ran the render after a cancel or an abort, which armed `useKeypress` on an input nobody would read again. Three of the four cases failed on that, and the fourth already passed. The immediate is now a cleanup, as upstream's is.

**@inquirer/prompts 8.7.4.** It adds nine titles. Six are `checkbox` with an async `validate` still pending: the prompt shows its loading spinner and ignores every key, a second Enter included, until `validate` answers. `caique`'s `checkbox` never entered `loading`, so keys toggled the selection underneath the pending answer and a second Enter validated again. Three of the six failed on that. It now sets `loading` before it awaits and `idle` after, and drops keys while it is not idle, as `@inquirer/checkbox` 5.2.7 does. Two are `number` reading a whitespace-only line as empty, so it takes the default or is refused under `required`. `caique` read `'  '` as `Number('  ')`, which is `0`. It now trims first, as `@inquirer/number` 4.2.5 does. The ninth is `editor`'s `ignores keypresses while validation is running`. It answers through `editorAction` and counts `editAsync` calls, which is the `vi.mock('@inquirer/external-editor')` that every other `editor` case uses (D-20261011-inquirer-prompts-editor-mock). It is excluded by exact title for both sides, with the other eleven, and that is why the reference is 221 and not 222. The control read 222 / 222 before the exclusion and reads 221 / 221 after it.

**execa 10.2.1.** It rewrites `arguments/command-resolution.js`, `methods/node.js` and a fixtures helper, and adds no title, so the reference stays 1360. The row is still a declared ceiling (D-160): every graded file fails at link time on `execa`, which `bellpull` does not export.

**Fingerprints, held to the re-graded only.** As D-20261026-fingerprint-missing-not-rerecord asks, only `@inquirer/prompts` was re-recorded, from 8.7.3 to 8.7.4, because it is the one competitor this PR re-grades whose held fingerprint was behind. dotenv 18.0.9, execa 10.2.1 and `@inquirer/core` 12.0.5 were already held at the new release, recorded by `--missing` on 2026-10-26. `inquirer` 14.2.4 (#1195), the legacy package, is not graded and stays held at 14.2.3. A full `--fingerprint` run was taken and every other change it made was discarded.

**Weight.** The `caique/inquirer/prompts` ceiling in `subpath-weight-lock` is re-measured, not copied. The same method first reproduced 8.7.3's 582,754 B. It then gives **582,862 B** for 8.7.4 with its ten prompts and core 12.0.5, resolved as of the oracle's `depsBefore`.

**For the owner.** `caique` and `seniority` get `patch` changesets. Each change is the incumbent's own behaviour at a patch release, and a drop-in follows its incumbent's current release (D-170).
