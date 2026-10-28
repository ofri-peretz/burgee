---
id: D-20261028-revendor-inquirer-8-7-5
subject: '@inquirer/core 12.0.6 (#1295) and @inquirer/prompts 8.7.5 (#1296) were released on 2026-10-27. What did the oracle and the drop-ins need to follow them?'
taken: Taken
date: '2026-10-28'
superseded_by: —
---

**Both re-graded at the release tag, both controls level with their reference, and both drop-ins level with their control again. Each fell one case behind on a real behaviour of the new release, and each was ported, red first.** Measured on darwin arm64, Node 24.12.0: `npm run compat -- inquirer-prompts inquirer-core --vendor --control`, then the target.

| Host | Release | Commit | Control | Target before the port | Target now | Before |
| :-- | :-- | :-- | --: | --: | --: | --: |
| inquirer-core | 12.0.5 -> 12.0.6 | `672b77f0` | 46 / 46 | `caique/inquirer` 45 / 46 | 46 / 46 | 45 / 45 |
| inquirer-prompts | 8.7.4 -> 8.7.5 | `672b77f0` | 222 / 222 | `caique/inquirer/prompts` 221 / 222 | 222 / 222 | 221 / 221 |

**The suites were renamed.** At this tag upstream names every test file `*.vitest.ts`, not `*.test.ts`, so the first `--vendor` stopped on `lists checkbox/checkbox.test.ts in suiteFiles and the release does not ship it`. Both rows' `suiteFiles` and `testGlob`, and the twelve exact editor exclusions (D-20261011-inquirer-prompts-editor-mock), now name the new files. Apart from the new cases below, every renamed file has the same contents as its old one.

**The pins.** `suiteDeps` moved to what 8.7.5 asks for, each checked against `npm view`: `@inquirer/prompts@8.7.5`, `@inquirer/core@12.0.6`, checkbox 5.2.8, confirm 6.3.5, editor 5.3.6, expand 5.1.8, input 5.1.9, number 4.2.6, password 5.2.5, rawlist 5.3.8, search 4.3.6 and select 5.2.8, each asking for `@inquirer/core@^12.0.6` and `@inquirer/type@4.2.1`. Also testing 3.3.16, type 4.2.1 and external-editor 3.0.7 (editor 5.3.6 asks `^3.0.7`), and ansi 2.0.10 on the core row. `depsBefore` follows them. Each vendored tree installs one `@inquirer/core`, 12.0.6, so checkbox's `instanceof ValidationError` sees the class the prompt throws (D-20261019-inquirer-prompts-pins-its-prompts).

**@inquirer/core 12.0.6.** It splits the old buffered-keypress case in two. On a TTY, keys typed before the prompt started are still dropped. Input already waiting on a non-TTY stdin is now read, because it is the answer that a script wrote. Upstream now defers the first render only when the input is a TTY. `caique/inquirer` deferred it for every modern readable, so a piped `\r` passed through readline before any keypress handler existed, and the prompt waited forever. It now defers only for a TTY.

**@inquirer/prompts 8.7.5.** It adds one title: `password` keeps the space after its message while the mask has nothing to draw. `@inquirer/password` 5.2.5 now joins prefix, message and value without filtering out empty parts, so the cursor sits one column past the separator. `caique` filtered the empty parts and put the cursor against the message. It no longer filters them, so an empty `prefix` leaves a leading space, as upstream's does. The unit case that held the old behaviour now holds the new one.

**Fingerprints, held to the re-graded only.** As D-20261026-fingerprint-missing-not-rerecord asks, only `@inquirer/core` (12.0.5 -> 12.0.6) and `@inquirer/prompts` (8.7.4 -> 8.7.5) were re-recorded. A full `--fingerprint` run was taken, and every other change it made was discarded: dates, and a `clack` weight entry it filled in. The `f` export that 12.0.6 drops came from `dist/lib/__probe/`, a set of lint probe files that 12.0.5 published by accident. `caique/inquirer` never exported it.

**Weight.** The `caique/inquirer/prompts` ceiling in `subpath-weight-lock` is re-measured, not copied. The same method first reproduced 8.7.4's 582,862 B, then gave **582,855 B** for 8.7.5 with its ten prompts and core 12.0.6, resolved as of the oracle's `depsBefore`. `caique`'s unpacked size is 299,684 B (+8), and the ratio is unchanged at 0.7703.

**For the owner.** `caique` gets a `patch` changeset, because each change is the incumbent's own behaviour at a patch release, and a drop-in follows its incumbent's current release (D-170). `burgee` gets one for `GRADED_VERSIONS`.
